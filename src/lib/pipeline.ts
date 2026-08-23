import { getCountry } from "@/lib/config/countries";
import { getNewsProvider, NewsProviderError } from "@/lib/news";
import type { Article } from "@/lib/news/types";
import { summarizeArticles } from "@/lib/summarize";
import {
  getCountryCache,
  getSummaryCache,
  isFresh,
  mergeSummaryCache,
  setCountryCache,
} from "@/lib/cache";

export interface RefreshResult {
  code: string;
  ok: boolean;
  count: number;
  error?: string;
}

const MAX_ARTICLES_PER_COUNTRY = Number(process.env.MAX_ARTICLES_PER_COUNTRY ?? 10);
const CACHE_TTL_MINUTES = Number(process.env.CACHE_TTL_MINUTES ?? 15);

async function refreshCountry(code: string, force: boolean): Promise<RefreshResult> {
  const country = getCountry(code);
  if (!country) {
    return { code, ok: false, count: 0, error: `未対応の国コードです: ${code}` };
  }

  if (!force) {
    const cached = await getCountryCache(code);
    if (cached && isFresh(cached.fetchedAt, CACHE_TTL_MINUTES)) {
      return { code, ok: true, count: cached.articles.length };
    }
  }

  try {
    const provider = getNewsProvider(country);
    const fetched = await provider.fetchTopHeadlines(code, MAX_ARTICLES_PER_COUNTRY);

    const summaryCache = await getSummaryCache();
    const alreadySummarized: Article[] = [];
    const needsSummary: Article[] = [];
    for (const article of fetched) {
      const cachedSummary = summaryCache[article.id];
      if (cachedSummary) {
        alreadySummarized.push({ ...article, ...cachedSummary });
      } else {
        needsSummary.push(article);
      }
    }

    const newlySummarized = await summarizeArticles(needsSummary);
    if (newlySummarized.some((a) => a.titleJa && a.summaryJa)) {
      await mergeSummaryCache(newlySummarized);
    }

    const articles = [...alreadySummarized, ...newlySummarized].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

    await setCountryCache(code, { articles, fetchedAt: new Date().toISOString() });
    return { code, ok: true, count: articles.length };
  } catch (err) {
    const message =
      err instanceof NewsProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "不明なエラーが発生しました";
    return { code, ok: false, count: 0, error: message };
  }
}

/** 国ごとに直列で取得→要約→キャッシュ更新を行う。1国の失敗は他国の処理を止めない */
export async function refreshCountries(codes: string[], force = false): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  for (const code of codes) {
    results.push(await refreshCountry(code, force));
  }
  return results;
}
