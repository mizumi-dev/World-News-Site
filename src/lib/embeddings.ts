/**
 * Qwen（Alibaba Cloud）の埋め込みAPI。dedup.ts の段階③（言い回しが異なる同一ニュースの検出）専用。
 * OpenAI互換エンドポイントの /embeddings をそのまま使う。
 */

interface EmbeddingResponse {
  data?: { embedding: number[]; index: number }[];
  error?: { message?: string };
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    throw new Error("QWEN_API_KEY が設定されていません。.env に設定してください。");
  }
  const baseUrl =
    process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_EMBEDDING_MODEL || "text-embedding-v4";

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: texts }),
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await res.json()) as EmbeddingResponse;
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Embeddings API がエラーを返しました (status ${res.status})`);
  }
  if (!data.data) {
    throw new Error("Embeddings API の応答にdataがありません");
  }

  // インデックス順が保証されない場合があるため並べ替える
  return [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
