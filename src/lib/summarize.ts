import type { Article } from "@/lib/news/types";

const SYSTEM_PROMPT = `あなたは国際ニュース編集者です。日本の読者向けに、各記事について次の2つを作成してください。
(1) 自然な日本語の見出し (titleJa)
(2) 1〜2文の日本語要約 (summaryJa)。可能なら背景や重要性を一言補足してください。
原文から推測できない詳細を創作してはいけません。
出力は次の形式のJSONオブジェクトのみとしてください。説明文やコードブロックのマークアップは付けないでください。
{"results":[{"index":0,"titleJa":"...","summaryJa":"..."}]}`;

interface SummaryResult {
  index: number;
  titleJa: string;
  summaryJa: string;
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
  choices?: { message?: { content?: string } }[];
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
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await res.json()) as QwenChatResponse;
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Qwen API がエラーを返しました (status ${res.status})`);
  }

  const text = data.choices?.[0]?.message?.content ?? "";
  return extractResults(text);
}

/**
 * 1国分の記事をまとめて1回のAPIコールで要約する（Qwen, OpenAI互換エンドポイント）。
 * パース失敗時は1回だけリトライし、それでも失敗したら該当記事は titleJa/summaryJa = null のまま返す。
 */
export async function summarizeArticles(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return articles;

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    throw new Error("QWEN_API_KEY が設定されていません。.env に設定してください。");
  }
  const baseUrl =
    process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_MODEL || "qwen3.7-flash";

  let results: SummaryResult[] | null = null;
  for (let attempt = 0; attempt < 2 && results === null; attempt++) {
    try {
      results = await requestSummaries(apiKey, baseUrl, model, articles);
    } catch (err) {
      console.error(
        `[summarize] Qwen API呼び出しに失敗しました (試行${attempt + 1}/2, model=${model}):`,
        err instanceof Error ? err.message : err,
      );
      results = null;
    }
  }

  if (results === null) {
    return articles;
  }

  const byIndex = new Map(results.map((r) => [r.index, r]));
  return articles.map((article, i) => {
    const result = byIndex.get(i);
    if (!result) return article;
    return { ...article, titleJa: result.titleJa, summaryJa: result.summaryJa };
  });
}
