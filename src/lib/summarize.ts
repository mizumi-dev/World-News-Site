import type { Article } from "@/lib/news/types";
import { TAGS } from "@/lib/config/tags";

const TAG_IDS = TAGS.map((t) => t.id);

// tagはフィード側で既に確定している記事があるため、AIには「未確定のものだけ」推測させる。
// index行に "(タグ確定済み)" と付いている記事は tag を省略してよい（省略時は既存タグを保持する）。
const SYSTEM_PROMPT = `あなたは国際ニュース編集者です。各記事について、日本語版と英語版の両方を作成してください。
(1) 自然な日本語の見出し (titleJa) と、1〜2文の日本語要約 (summaryJa)。可能なら背景や重要性を一言補足する
(2) 自然な英語の見出し (titleEn) と、1〜2文の英語要約 (summaryEn)。日本語版の単なる直訳ではなく、
    英語ニュース読者にとって自然な言い回しにする
(3) 記事に最もふさわしいタグを1つ (tag)。次の中から必ず1つ選ぶこと: ${TAG_IDS.join(", ")}
  ただし「(タグ確定済み)」と付記された記事は tag を出力しなくてよい（省略可）。
原文から推測できない詳細を創作してはいけません。
出力は次の形式のJSONオブジェクトのみとしてください。説明文やコードブロックのマークアップは付けないでください。
{"results":[{"index":0,"titleJa":"...","summaryJa":"...","titleEn":"...","summaryEn":"...","tag":"..."}]}`;

const MAX_OUTPUT_TOKENS = 4096;
// attemptBatch は最大2回リトライするため、1バッチの最悪ケースはこの2倍かかりうる。
// Vercelの実行時間上限(60秒)に対して十分な余白を残すため、30秒から20秒に短縮した
// （pipeline.ts の SUMMARIZE_TIME_BUDGET_MS も参照）。
const REQUEST_TIMEOUT_MS = 20_000;

interface SummaryResult {
  index: number;
  titleJa: string;
  summaryJa: string;
  titleEn: string;
  summaryEn: string;
  tag?: string;
}

export interface SummarizeOutcome {
  articles: Article[];
  /** 要約に失敗した場合の理由。成功時は undefined */
  error?: string;
}

function buildUserContent(articles: Article[]): string {
  return articles
    .map((a, i) => {
      const excerpt = a.excerptForSummary ? `\n概要: ${a.excerptForSummary.slice(0, 200)}` : "";
      const tagNote = a.tag ? " (タグ確定済み)" : "";
      return `${i}. 見出し: ${a.originalTitle}${tagNote}${excerpt}`;
    })
    .join("\n\n");
}

function extractResults(text: string): SummaryResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      throw new Error("応答にJSONオブジェクトが見つかりませんでした");
    }
    parsed = JSON.parse(text.slice(start, end + 1));
  }
  const results = (parsed as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    throw new Error("応答にresults配列が含まれていません");
  }
  return results as SummaryResult[];
}

interface QwenChatResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  error?: { message?: string };
}

async function requestSummaries(
  apiKey: string,
  baseUrl: string,
  model: string,
  articles: Article[],
): Promise<SummaryResult[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserContent(articles) },
      ],
      response_format: { type: "json_object" },
      max_tokens: MAX_OUTPUT_TOKENS,
      // Qwen3系は思考モードがデフォルトで有効。非ストリーミング呼び出しでは
      // 思考が長引いて応答が返らずタイムアウトするため明示的に無効化する。
      // 見出しの翻訳と要約に推論は不要で、レイテンシとコストの削減にもなる。
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = (await res.json()) as QwenChatResponse;
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Qwen API がエラーを返しました (status ${res.status})`);
  }

  const choice = data.choices?.[0];
  // finish_reason が "length" の場合、応答が上限で打ち切られてJSONが壊れている
  if (choice?.finish_reason === "length") {
    throw new Error(
      `応答が最大長(${MAX_OUTPUT_TOKENS}トークン)で打ち切られました。1回に要約する記事数を減らしてください（.env の MAX_ARTICLES_PER_COUNTRY）。`,
    );
  }

  return extractResults(choice?.message?.content ?? "");
}

/** Qwenのコンテンツ安全フィルタによる拒否。同じ内容を送る限り何度リトライしても必ず同じ結果になる */
const CONTENT_POLICY_ERROR_PATTERN = /DataInspectionFailed/i;

async function attemptBatch(
  apiKey: string,
  baseUrl: string,
  model: string,
  articles: Article[],
): Promise<{ results: SummaryResult[] | null; error: string }> {
  let lastError = "不明なエラー";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const results = await requestSummaries(apiKey, baseUrl, model, articles);
      return { results, error: "" };
    } catch (err) {
      lastError =
        err instanceof Error
          ? err.name === "TimeoutError"
            ? `応答がタイムアウトしました(${REQUEST_TIMEOUT_MS / 1000}秒)`
            : err.message
          : String(err);
      console.error(
        `[summarize] Qwen API呼び出しに失敗しました (試行${attempt + 1}/2, model=${model}, ${articles.length}件):`,
        lastError,
      );
    }
  }
  return { results: null, error: lastError };
}

function mergeResults(articles: Article[], results: SummaryResult[]): Article[] {
  const byIndex = new Map(results.map((r) => [r.index, r]));
  return articles.map((article, i) => {
    const result = byIndex.get(i);
    if (!result) return article;
    // フィード由来のタグ(article.tag)があれば優先する。無ければAIの推測を使う
    const tag = article.tag ?? (result.tag && TAG_IDS.includes(result.tag) ? result.tag : "other");
    return {
      ...article,
      titleJa: result.titleJa,
      summaryJa: result.summaryJa,
      titleEn: result.titleEn,
      summaryEn: result.summaryEn,
      tag,
    };
  });
}

async function summarizeChunk(
  apiKey: string,
  baseUrl: string,
  model: string,
  articles: Article[],
): Promise<SummarizeOutcome> {
  const { results, error } = await attemptBatch(apiKey, baseUrl, model, articles);
  if (results !== null) {
    return { articles: mergeResults(articles, results) };
  }

  if (articles.length === 1) {
    if (CONTENT_POLICY_ERROR_PATTERN.test(error)) {
      // Qwenのコンテンツフィルタに永続的に拒否される記事。同じ内容なので次回実行しても
      // 必ず同じ結果になり、放置すると毎回無駄にAPIを消費し続ける。原文タイトルをそのまま
      // 採用してキャッシュを埋め、二度とAIに送らないようにする。
      const article = articles[0];
      console.warn(
        `[summarize] コンテンツフィルタにより要約を生成できませんでした。原文タイトルで代替します: ${article.originalTitle}`,
      );
      return {
        articles: [
          {
            ...article,
            titleJa: article.originalTitle,
            summaryJa: "(AIによる要約は生成できませんでした)",
            titleEn: article.originalTitle,
            summaryEn: "(AI summary unavailable)",
            tag: article.tag ?? "other",
          },
        ],
      };
    }
    return { articles, error };
  }

  // 複数件をまとめて送って失敗した場合、原因の記事を切り分ける。コンテンツフィルタは
  // バッチ中の1件が原因でも全体を巻き込むため、半分に割って再送すれば残りは要約できる。
  const mid = Math.ceil(articles.length / 2);
  const [first, second] = await Promise.all([
    summarizeChunk(apiKey, baseUrl, model, articles.slice(0, mid)),
    summarizeChunk(apiKey, baseUrl, model, articles.slice(mid)),
  ]);
  return {
    articles: [...first.articles, ...second.articles],
    error: first.error ?? second.error,
  };
}

/**
 * 記事をまとめてAPIコールで要約する（Qwen, OpenAI互換エンドポイント）。
 * バッチ全体が失敗した場合は半分に割って再送し、原因の記事を切り分ける
 * （コンテンツフィルタは1件の問題記事でバッチ全体を巻き込むため）。
 */
export async function summarizeArticles(articles: Article[]): Promise<SummarizeOutcome> {
  if (articles.length === 0) return { articles };

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    throw new Error("QWEN_API_KEY が設定されていません。.env に設定してください。");
  }
  const baseUrl =
    process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_MODEL || "qwen3.7-flash";

  return summarizeChunk(apiKey, baseUrl, model, articles);
}
