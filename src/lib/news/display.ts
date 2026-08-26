import type { Article } from "@/lib/news/types";
import type { DisplayLanguage } from "@/components/LanguageToggle";

/** 表示言語に応じたタイトル・要約を選ぶ。該当言語の翻訳が無ければ原文タイトルにフォールバックする */
export function pickDisplayText(
  article: Article,
  language: DisplayLanguage,
): { title: string; summary: string | null } {
  if (language === "en") {
    return { title: article.titleEn ?? article.originalTitle, summary: article.summaryEn };
  }
  return { title: article.titleJa ?? article.originalTitle, summary: article.summaryJa };
}

/**
 * 出典サイトの favicon を Google の無料 favicon サービス経由で取得するURLを返す。
 * 画像はブラウザが直接読み込むため、サーバー側のAI/キャッシュコストは増えない。
 * ドメインが不明な場合は null を返す（呼び出し側で非表示にする）。
 */
export function sourceFaviconUrl(domain?: string): string | null {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}
