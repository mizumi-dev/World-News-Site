import type { Article } from "@/lib/news/types";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}日前`;
}

export function ArticleCard({ article }: { article: Article }) {
  return (
    <article className="border border-black/10 rounded-lg p-4 flex flex-col gap-2 bg-white dark:bg-black/20">
      <h3 className="font-semibold leading-snug">
        {article.titleJa ?? article.originalTitle}
      </h3>
      {article.summaryJa && (
        <p className="text-sm text-black/70 dark:text-white/70">
          <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-blue-600/10 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5 mr-1.5 align-middle">
            AI要約
          </span>
          {article.summaryJa}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-black/50 dark:text-white/50 mt-1">
        <span>
          {article.sourceName} ・ {relativeTime(article.publishedAt)}
        </span>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-blue-600"
        >
          原文を読む
        </a>
      </div>
    </article>
  );
}
