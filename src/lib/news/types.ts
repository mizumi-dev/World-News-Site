export interface Article {
  id: string;
  countryCode: string;
  originalTitle: string;
  titleJa: string | null;
  summaryJa: string | null;
  titleEn: string | null;
  summaryEn: string | null;
  /** タグID（src/lib/config/tags.ts の Tag.id）。AI要約時に付与される */
  tag: string | null;
  sourceName: string;
  url: string;
  publishedAt: string;
  imageUrl?: string | null;
  /** 要約の入力にのみ使う原文抜粋。本文は保存・表示しない */
  excerptForSummary?: string;
}

export interface NewsProvider {
  fetchTopHeadlines(countryCode: string, limit: number): Promise<Article[]>;
}

export class NewsProviderError extends Error {
  constructor(
    public readonly countryCode: string,
    message: string,
  ) {
    super(message);
    this.name = "NewsProviderError";
  }
}
