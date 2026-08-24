import type { Article } from "@/lib/news/types";
import type { KeyValueBackend } from "./backend";
import { createFileBackend } from "./file-backend";
import { createUpstashBackend } from "./upstash-backend";

export interface CountryCache {
  articles: Article[];
  fetchedAt: string;
}

type SummaryEntry = Pick<Article, "titleJa" | "summaryJa">;

function getBackend(): KeyValueBackend {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return createUpstashBackend(url, token);
  }
  return createFileBackend();
}

const backend = getBackend();

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await backend.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function countryCacheKey(countryCode: string): string {
  return `news:${countryCode}`;
}

const SUMMARIES_KEY = "summaries";

export async function getCountryCache(countryCode: string): Promise<CountryCache | null> {
  return readJson<CountryCache>(countryCacheKey(countryCode));
}

export async function setCountryCache(countryCode: string, cache: CountryCache): Promise<void> {
  await backend.set(countryCacheKey(countryCode), JSON.stringify(cache));
}

export async function getSummaryCache(): Promise<Record<string, SummaryEntry>> {
  return (await readJson<Record<string, SummaryEntry>>(SUMMARIES_KEY)) ?? {};
}

export async function mergeSummaryCache(articles: Article[]): Promise<void> {
  const existing = await getSummaryCache();
  for (const article of articles) {
    if (article.titleJa && article.summaryJa) {
      existing[article.id] = { titleJa: article.titleJa, summaryJa: article.summaryJa };
    }
  }
  await backend.set(SUMMARIES_KEY, JSON.stringify(existing));
}

export function isFresh(fetchedAt: string, ttlMinutes: number): boolean {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs < ttlMinutes * 60_000;
}
