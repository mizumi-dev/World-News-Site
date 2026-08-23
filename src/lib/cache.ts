import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { Article } from "@/lib/news/types";

const CACHE_DIR = path.join(process.cwd(), ".cache");

export interface CountryCache {
  articles: Article[];
  fetchedAt: string;
}

type SummaryEntry = Pick<Article, "titleJa" | "summaryJa">;

async function ensureCacheDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureCacheDir();
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function countryCachePath(countryCode: string): string {
  return path.join(CACHE_DIR, `news-${countryCode}.json`);
}

function summariesCachePath(): string {
  return path.join(CACHE_DIR, "summaries.json");
}

export async function getCountryCache(countryCode: string): Promise<CountryCache | null> {
  return readJson<CountryCache>(countryCachePath(countryCode));
}

export async function setCountryCache(countryCode: string, cache: CountryCache): Promise<void> {
  await writeJson(countryCachePath(countryCode), cache);
}

export async function getSummaryCache(): Promise<Record<string, SummaryEntry>> {
  return (await readJson<Record<string, SummaryEntry>>(summariesCachePath())) ?? {};
}

export async function mergeSummaryCache(articles: Article[]): Promise<void> {
  const existing = await getSummaryCache();
  for (const article of articles) {
    if (article.titleJa && article.summaryJa) {
      existing[article.id] = { titleJa: article.titleJa, summaryJa: article.summaryJa };
    }
  }
  await writeJson(summariesCachePath(), existing);
}

export function isFresh(fetchedAt: string, ttlMinutes: number): boolean {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs < ttlMinutes * 60_000;
}
