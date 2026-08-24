import { createHash } from "crypto";
import type { Country } from "@/lib/config/countries";
import { NewsProviderError, type Article, type NewsProvider } from "./types";

interface NewsDataResult {
  title?: string;
  link?: string;
  source_name?: string;
  source_id?: string;
  pubDate?: string;
  image_url?: string | null;
  description?: string | null;
}

interface NewsDataResponse {
  status: string;
  results?: NewsDataResult[];
  message?: string;
}

function articleId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function toIso(pubDate: string | undefined): string {
  if (!pubDate) return new Date().toISOString();
  // NewsData.io は "YYYY-MM-DD HH:mm:ss" (UTC) 形式で返す
  const normalized = pubDate.includes("T") ? pubDate : pubDate.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function createNewsDataProvider(country: Country): NewsProvider {
  return {
    async fetchTopHeadlines(countryCode: string, limit: number): Promise<Article[]> {
      const apiKey = process.env.NEWSDATA_API_KEY;
      if (!apiKey) {
        throw new NewsProviderError(
          countryCode,
          "NEWSDATA_API_KEY が設定されていません。.env に設定してください。",
        );
      }

      const url = new URL("https://newsdata.io/api/1/latest");
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("country", countryCode);
      url.searchParams.set("size", String(limit));
      if (country.langHint) {
        url.searchParams.set("language", country.langHint);
      }

      let res: Response;
      try {
        res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      } catch (err) {
        const message =
          err instanceof Error && err.name === "TimeoutError"
            ? "NewsData.io への接続がタイムアウトしました(20秒)。時間をおいて再試行してください。"
            : `NewsData.io への接続に失敗しました: ${(err as Error).message}`;
        throw new NewsProviderError(countryCode, message);
      }

      if (!res.ok) {
        if (res.status === 429) {
          throw new NewsProviderError(
            countryCode,
            "NewsData.io のレート制限に達しました。しばらく待ってから再試行してください。",
          );
        }
        throw new NewsProviderError(
          countryCode,
          `NewsData.io がエラーを返しました (status ${res.status})`,
        );
      }

      const data = (await res.json()) as NewsDataResponse;
      if (data.status !== "success") {
        throw new NewsProviderError(
          countryCode,
          data.message ?? "NewsData.io から不明なエラーが返されました",
        );
      }

      return (data.results ?? [])
        .filter((r) => r.title && r.link)
        .map((r): Article => ({
          id: articleId(r.link!),
          countryCode,
          originalTitle: r.title!,
          titleJa: null,
          summaryJa: null,
          sourceName: r.source_name ?? r.source_id ?? country.nameJa,
          url: r.link!,
          publishedAt: toIso(r.pubDate),
          imageUrl: r.image_url ?? null,
          excerptForSummary: r.description ?? undefined,
        }));
    },
  };
}
