import { createHash } from "crypto";
import type { Country } from "@/lib/config/countries";
import { NewsProviderError, type Article, type NewsProvider } from "./types";

function articleId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "");
}

function extractTag(xml: string, tag: string): string | null {
  const cdata = xml.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i"));
  if (cdata) return cdata[1].trim();
  const plain = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return plain ? decodeEntities(plain[1].trim()) : null;
}

function toIso(pubDate: string | null): string {
  if (!pubDate) return new Date().toISOString();
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Google News RSS を使ったニュース取得アダプタ。APIキー不要・無料だが非公式
 * （Googleは公式のNews APIを提供していない）。SLA・バージョニングは無く、
 * フォーマットが予告なく変わりうる。利用規約の制約もあるため、
 * 主要プロバイダ(NewsData.io等)が使えない場合の代替として使うことを想定する
 * （docs/ARCHITECTURE_REVIEW.md 参照）。
 */
export function createGoogleNewsProvider(country: Country): NewsProvider {
  return {
    async fetchTopHeadlines(countryCode: string, limit: number): Promise<Article[]> {
      const lang = country.langHint || "en";
      const gl = countryCode.toUpperCase();
      const url = `https://news.google.com/rss?hl=${lang}&gl=${gl}&ceid=${gl}:${lang}`;

      let res: Response;
      try {
        res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      } catch (err) {
        const message =
          err instanceof Error && err.name === "TimeoutError"
            ? "Google News RSS への接続がタイムアウトしました(20秒)。時間をおいて再試行してください。"
            : `Google News RSS への接続に失敗しました: ${(err as Error).message}`;
        throw new NewsProviderError(countryCode, message);
      }

      if (!res.ok) {
        throw new NewsProviderError(
          countryCode,
          `Google News RSS がエラーを返しました (status ${res.status})`,
        );
      }

      const xml = await res.text();
      const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

      return itemBlocks
        .slice(0, limit)
        .map((item): Article | null => {
          const title = extractTag(item, "title");
          const link = extractTag(item, "link");
          if (!title || !link) return null;
          const description = extractTag(item, "description");
          return {
            id: articleId(link),
            countryCode,
            originalTitle: title,
            titleJa: null,
            summaryJa: null,
            tag: null,
            sourceName: extractTag(item, "source") ?? "Google News",
            url: link,
            publishedAt: toIso(extractTag(item, "pubDate")),
            imageUrl: null,
            excerptForSummary: description ?? undefined,
          };
        })
        .filter((a): a is Article => a !== null);
    },
  };
}
