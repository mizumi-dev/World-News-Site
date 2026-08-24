import type { Article } from "@/lib/news/types";

export type { Article } from "@/lib/news/types";

export interface CountryNewsEntry {
  articles: Article[];
  fetchedAt: string | null;
}

export type CountryNewsMap = Record<string, CountryNewsEntry>;
