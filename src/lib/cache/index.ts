import type { Article } from "@/lib/news/types";
import type { KeyValueBackend } from "./backend";
import { createFileBackend } from "./file-backend";
import { createUpstashBackend } from "./upstash-backend";

export interface CountryCache {
  articles: Article[];
  fetchedAt: string;
}

export type SummaryEntry = Pick<Article, "titleJa" | "summaryJa" | "tag">;

/**
 * 要約の保存コストは再要約コストの約1/300（docs/SPEC.md 8-1）なので、長く保持するほど得になる。
 * Upstash無料枠（256MB・月50万コマンド）に対して1件あたり約500バイトと十分小さいため、1年間保持する。
 * 無期限にしないのは、二度と出てこない記事の要約が永久に残り続けるのを避けるため。
 */
const SUMMARY_TTL_SECONDS = 365 * 24 * 60 * 60;

function getBackend(): KeyValueBackend {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return createUpstashBackend(url, token);
  }
  return createFileBackend();
}

const backend = getBackend();

function countryCacheKey(countryCode: string): string {
  return `news:${countryCode}`;
}

function summaryKey(summaryId: string): string {
  return `summary:${summaryId}`;
}

export async function getCountryCache(countryCode: string): Promise<CountryCache | null> {
  const raw = await backend.get(countryCacheKey(countryCode));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as CountryCache;
  } catch {
    return null;
  }
}

export async function setCountryCache(countryCode: string, cache: CountryCache): Promise<void> {
  await backend.set(countryCacheKey(countryCode), JSON.stringify(cache));
}

/**
 * 指定IDの要約をまとめて取得する。
 * 要約は1件=1キーで保存する。全件を1つの巨大なJSONにまとめると、
 * 国ごとの並列更新で read-modify-write が衝突して他国の要約を消してしまい、
 * さらに更新のたびに全件を転送することになるため。
 */
export async function getSummaries(summaryIds: string[]): Promise<Record<string, SummaryEntry>> {
  if (summaryIds.length === 0) return {};
  const values = await backend.getMany(summaryIds.map(summaryKey));
  const found: Record<string, SummaryEntry> = {};
  summaryIds.forEach((id, i) => {
    const raw = values[i];
    if (raw === null || raw === undefined) return;
    try {
      found[id] = JSON.parse(raw) as SummaryEntry;
    } catch {
      // 壊れたエントリは未キャッシュ扱いにして再生成させる
    }
  });
  return found;
}

export async function saveSummaries(entries: Record<string, SummaryEntry>): Promise<void> {
  await Promise.all(
    Object.entries(entries).map(([id, entry]) =>
      backend.set(summaryKey(id), JSON.stringify(entry), SUMMARY_TTL_SECONDS),
    ),
  );
}

export function isFresh(fetchedAt: string, ttlMinutes: number): boolean {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs < ttlMinutes * 60_000;
}
