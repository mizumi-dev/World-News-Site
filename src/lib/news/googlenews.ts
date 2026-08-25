import { createHash } from "crypto";
import type { Country } from "@/lib/config/countries";
import { NewsProviderError, type Article, type NewsProvider } from "./types";

function articleId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

/**
 * Google Newsのトピック別RSS（WORLD/BUSINESS等）と、本アプリのタグID(src/lib/config/tags.ts)の対応。
 * このマッピングでタグが確定するフィードは、AIにタグを推測させる必要がなくなる
 * （src/lib/summarize.ts 参照）。総合フィード(topic=null)由来の記事はAIがタグを推測する。
 */
const TOPIC_TO_TAG: Record<string, string> = {
  WORLD: "world",
  NATION: "world",
  BUSINESS: "economy",
  TECHNOLOGY: "technology",
  ENTERTAINMENT: "entertainment",
  SPORTS: "sports",
  SCIENCE: "science",
  HEALTH: "health",
};
const TOPICS = Object.keys(TOPIC_TO_TAG);

/** 1トピックフィードあたりの取得件数上限。トピック数×この値が1国あたりの取得量になる */
const PER_TOPIC_LIMIT = 20;

/**
 * 1国あたりの最終的な記事数上限。NewsData.io等の MAX_ARTICLES_PER_COUNTRY（無料枠に合わせて小さい値）
 * とは別に持つ。トピック別フィードを束ねるとその何倍も取れるため、ここで別途上限を設ける。
 */
function maxArticlesPerCountry(): number {
  return Number(process.env.GOOGLENEWS_MAX_ARTICLES_PER_COUNTRY ?? 150);
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

function feedUrl(topic: string | null, lang: string, gl: string): string {
  const ceid = `${gl}:${lang}`;
  if (topic === null) {
    return `https://news.google.com/rss?hl=${lang}&gl=${gl}&ceid=${ceid}`;
  }
  return `https://news.google.com/rss/headlines/section/topic/${topic}?hl=${lang}&gl=${gl}&ceid=${ceid}`;
}

async function fetchFeed(
  countryCode: string,
  topic: string | null,
  lang: string,
  gl: string,
  limit: number,
): Promise<Article[]> {
  const url = feedUrl(topic, lang, gl);
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? `Google News RSS(${topic ?? "総合"}) への接続がタイムアウトしました(20秒)`
        : `Google News RSS(${topic ?? "総合"}) への接続に失敗しました: ${(err as Error).message}`;
    throw new NewsProviderError(countryCode, message);
  }

  if (!res.ok) {
    throw new NewsProviderError(
      countryCode,
      `Google News RSS(${topic ?? "総合"}) がエラーを返しました (status ${res.status})`,
    );
  }

  const xml = await res.text();
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const tag = topic ? TOPIC_TO_TAG[topic] : null;

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
        titleEn: null,
        summaryEn: null,
        // トピック別フィード由来なら、フィードの分類をそのままタグとして確定させる
        // （AIにタグを推測させない。src/lib/summarize.ts 参照）
        tag: tag ?? null,
        sourceName: extractTag(item, "source") ?? "Google News",
        url: link,
        publishedAt: toIso(extractTag(item, "pubDate")),
        imageUrl: null,
        excerptForSummary: description ?? undefined,
      };
    })
    .filter((a): a is Article => a !== null);
}

/**
 * Google News RSS を使ったニュース取得アダプタ。APIキー不要・無料だが非公式
 * （Googleは公式のNews APIを提供していない）。SLA・バージョニングは無く、
 * フォーマットが予告なく変わりうる。利用規約の制約もあるため、
 * 主要プロバイダ(NewsData.io等)が使えない場合の代替として使うことを想定する
 * （docs/ARCHITECTURE_REVIEW.md 参照）。
 *
 * 総合フィードに加えて、トピック別フィード(WORLD/BUSINESS/TECHNOLOGY等)を並列取得して
 * 統合する。トピック別フィードで取れた記事はタグが確定するため、AIの推測が不要になり、
 * 「ジャンルで絞るとほとんど出ない」状態を避けられるだけの母数も確保できる
 * （docs/ARCHITECTURE_REVIEW.md「ボリュームアップ」参照）。
 * 1フィードの失敗（レート制限等）は無視して、成功したフィードの記事だけで続行する。
 */
export function createGoogleNewsProvider(country: Country): NewsProvider {
  return {
    // limit(MAX_ARTICLES_PER_COUNTRY)は他プロバイダの無料枠向けの値のため、ここでは受け取らない。
    // 独自の GOOGLENEWS_MAX_ARTICLES_PER_COUNTRY で上限を決める
    async fetchTopHeadlines(countryCode: string): Promise<Article[]> {
      const limit = maxArticlesPerCountry();
      const lang = country.langHint || "en";
      const gl = countryCode.toUpperCase();

      const feeds = [null, ...TOPICS];
      const results = await Promise.allSettled(
        feeds.map((topic) => fetchFeed(countryCode, topic, lang, gl, PER_TOPIC_LIMIT)),
      );

      const byUrl = new Map<string, Article>();
      let anySucceeded = false;
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        anySucceeded = true;
        for (const article of result.value) {
          // 同じ記事が総合フィードとトピック別フィードの両方に出ることがある。
          // タグ付き(トピック別由来)を優先して残す
          const existing = byUrl.get(article.url);
          if (!existing || (!existing.tag && article.tag)) {
            byUrl.set(article.url, article);
          }
        }
      }

      if (!anySucceeded) {
        const firstError = results.find(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        throw (
          firstError?.reason ??
          new NewsProviderError(countryCode, "Google News RSS の取得にすべて失敗しました")
        );
      }

      return [...byUrl.values()]
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, limit);
    },
  };
}
