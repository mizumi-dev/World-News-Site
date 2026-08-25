import type { Country } from "@/lib/config/countries";
import { createNewsDataProvider } from "./newsdata";
import { createWorldNewsApiProvider } from "./worldnewsapi";
import { createGoogleNewsProvider } from "./googlenews";
import type { NewsProvider } from "./types";

export type { Article, NewsProvider } from "./types";
export { NewsProviderError } from "./types";

export function getNewsProvider(country: Country): NewsProvider {
  const provider = process.env.NEWS_PROVIDER ?? "newsdata";
  switch (provider) {
    case "worldnewsapi":
      return createWorldNewsApiProvider(country);
    case "googlenews":
      return createGoogleNewsProvider(country);
    case "newsdata":
    default:
      return createNewsDataProvider(country);
  }
}

/**
 * 主プロバイダ(NEWS_PROVIDER)が失敗した/記事が極端に少なかった場合の保険として使う
 * NewsData.ioプロバイダ。NEWSDATA_API_KEYが設定されておらず使えない場合はnullを返す
 * （pipeline.ts のフォールバック処理はnullなら何もしない）。
 * NEWS_PROVIDER=newsdata の場合は主プロバイダと同じになるため意味が無く、nullを返す。
 */
export function getFallbackNewsProvider(country: Country): NewsProvider | null {
  if ((process.env.NEWS_PROVIDER ?? "newsdata") === "newsdata") return null;
  if (!process.env.NEWSDATA_API_KEY) return null;
  return createNewsDataProvider(country);
}
