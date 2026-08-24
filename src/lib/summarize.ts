import type { Article } from "@/lib/news/types";

const SYSTEM_PROMPT = `あなたは国際ニュース編集者です。日本の読者向けに、各記事について次の2つを作成してください。
(1) 自然な日本語の見出し (titleJa)
(2) 1〜2文の日本語要約 (summaryJa)。可能なら背景や重要性を一言補足してください。
原文から推測できない詳細を創作してはいけません。
出力は次の形式のJSONオブジェクトのみとしてください。説明文やコードブロックのマークアップは付けないでください。
{"results":[{"index":0,"titleJa":"...","summaryJa":"..."}]}`;

const MAX_OUTPUT_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 30_000;

interface SummaryResult {
  index: number;
  titleJa: string;
  summaryJa: string;
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
      return `${i}. 見出し: ${a.originalTitle}${excerpt}`;
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

/**
 * 1国分の記事をまとめて1回のAPIコールで要約する（Qwen, OpenAI互換エンドポイント）。
 * 失敗時は1回だけリトライし、それでも失敗したら要約なしの記事と失敗理由を返す。
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

  let results: SummaryResult[] | null = null;
  let lastError = "不明なエラー";
  for (let attempt = 0; attempt < 2 && results === null; attempt++) {
    try {
      results = await requestSummaries(apiKey, baseUrl, model, articles);
    } catch (err) {
      lastError =
        err instanceof Error
          ? err.name === "TimeoutError"
            ? `応答がタイムアウトしました(${REQUEST_TIMEOUT_MS / 1000}秒)`
            : err.message
          : String(err);
      console.error(
        `[summarize] Qwen API呼び出しに失敗しました (試行${attempt + 1}/2, model=${model}):`,
        lastError,
      );
      results = null;
    }
  }

  if (results === null) {
    return { articles, error: lastError };
  }

  const byIndex = new Map(results.map((r) => [r.index, r]));
  return {
    articles: articles.map((article, i) => {
      const result = byIndex.get(i);
      if (!result) return article;
      return { ...article, titleJa: result.titleJa, summaryJa: result.summaryJa };
    }),
  };
}
