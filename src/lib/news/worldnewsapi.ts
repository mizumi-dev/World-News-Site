import { createHash } from "crypto";
import type { Country } from "@/lib/config/countries";
import { NewsProviderError, type Article, type NewsProvider } from "./types";

interface WorldNewsResult {
  title?: string;
  url?: string;
  source_country?: string;
  publish_date?: string;
  image?: string | null;
  text?: string | null;
  summary?: string | null;
}

interface WorldNewsResponse {
  top_news?: { news: WorldNewsResult[] }[];
  news?: WorldNewsResult[];
  message?: string;
}

function articleId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function toIso(publishDate: string | undefined): string {
  if (!publishDate) return new Date().toISOString();
  const d = new Date(publishDate);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function createWorldNewsApiProvider(country: Country): NewsProvider {
  return {
    async fetchTopHeadlines(countryCode: string, limit: number): Promise<Article[]> {
      const apiKey = process.env.WORLDNEWS_API_KEY;
      if (!apiKey) {
        throw new NewsProviderError(
          countryCode,
          "WORLDNEWS_API_KEY が設定されていません。.env に設定してください。",
        );
      }

      const url = new URL("https://api.worldnewsapi.com/top-news");
      url.searchParams.set("api-key", apiKey);
      url.searchParams.set("source-country", countryCode);
      if (country.langHint) {
        url.searchParams.set("language", country.langHint.slice(0, 2));
      }

      let res: Response;
      try {
        res = await fetch(url, { cache: "no-store" });
      } catch (err) {
        throw new NewsProviderError(
          countryCode,
          `World News API への接続に失敗しました: ${(err as Error).message}`,
        );
      }

      if (!res.ok) {
        if (res.status === 429) {
          throw new NewsProviderError(
            countryCode,
            "World News API のレート制限に達しました。しばらく待ってから再試行してください。",
          );
        }
        throw new NewsProviderError(
          countryCode,
          `World News API がエラーを返しました (status ${res.status})`,
        );
      }

      const data = (await res.json()) as WorldNewsResponse;
      const flat: WorldNewsResult[] =
        data.top_news?.flatMap((g) => g.news) ?? data.news ?? [];

      return flat
        .filter((r) => r.title && r.url)
        .slice(0, limit)
        .map((r): Article => ({
          id: articleId(r.url!),
          countryCode,
          originalTitle: r.title!,
          titleJa: null,
          summaryJa: null,
          sourceName: new URL(r.url!).hostname.replace(/^www\./, ""),
          url: r.url!,
          publishedAt: toIso(r.publish_date),
          imageUrl: r.image ?? null,
          excerptForSummary: r.summary ?? r.text?.slice(0, 200) ?? undefined,
        }));
    },
  };
}
