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
