import type { Article } from "@/lib/news/types";

const SYSTEM_PROMPT = `あなたは国際ニュース編集者です。日本の読者向けに、各記事について次の2つを作成してください。
(1) 自然な日本語の見出し (titleJa)
(2) 1〜2文の日本語要約 (summaryJa)。可能なら背景や重要性を一言補足してください。
原文から推測できない詳細を創作してはいけません。
出力は次の形式のJSON配列のみとしてください。説明文やコードブロックのマークアップは付けないでください。
[{"index":0,"titleJa":"...","summaryJa":"..."}]`;

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

function extractJsonArray(text: string): SummaryResult[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("応答にJSON配列が見つかりませんでした");
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) {
    throw new Error("応答がJSON配列ではありません");
  }
  return parsed;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

async function requestSummaries(
  apiKey: string,
  model: string,
  articles: Article[],
): Promise<SummaryResult[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildUserContent(articles) }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Gemini API がエラーを返しました (status ${res.status})`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n") ?? "";
  return extractJsonArray(text);
}

/**
 * 1国分の記事をまとめて1回のAPIコールで要約する。
 * パース失敗時は1回だけリトライし、それでも失敗したら該当記事は titleJa/summaryJa = null のまま返す。
 */
export async function summarizeArticles(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return articles;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません。.env に設定してください。");
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  let results: SummaryResult[] | null = null;
  for (let attempt = 0; attempt < 2 && results === null; attempt++) {
    try {
      results = await requestSummaries(apiKey, model, articles);
    } catch {
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
