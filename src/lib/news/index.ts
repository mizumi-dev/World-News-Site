import type { Country } from "@/lib/config/countries";
import { createNewsDataProvider } from "./newsdata";
import { createWorldNewsApiProvider } from "./worldnewsapi";
import type { NewsProvider } from "./types";

export type { Article, NewsProvider } from "./types";
export { NewsProviderError } from "./types";

export function getNewsProvider(country: Country): NewsProvider {
  const provider = process.env.NEWS_PROVIDER ?? "newsdata";
  switch (provider) {
    case "worldnewsapi":
      return createWorldNewsApiProvider(country);
    case "newsdata":
    default:
      return createNewsDataProvider(country);
  }
}
