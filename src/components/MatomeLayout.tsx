"use client";

import { useState } from "react";
import type { Country } from "@/lib/config/countries";
import { TagBadge } from "@/components/TagBadge";
import type { CountryNewsMap } from "@/types";

/** 1カ国あたりの初期表示件数と「もっと見る」の増分。1国150件を一度に出すと読めないため */
const INITIAL_VISIBLE = 20;
const LOAD_MORE_STEP = 20;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M7 5l6 5-6 5V5z" />
    </svg>
  );
}

export function MatomeLayout({
  countries,
  newsData,
}: {
  countries: Country[];
  newsData: CountryNewsMap;
}) {
  // 明示的に開閉した国だけを保持する。未操作の国は「先頭の国だけ開く」を既定とする
  // （全部開くと大量の記事が一度に並び、まとめ型が読めなくなるため）
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});
  const [visibleByCountry, setVisibleByCountry] = useState<Record<string, number>>({});

  return (
    <div className="flex flex-col gap-3">
      {countries.map((country, index) => {
        const entry = newsData[country.code];
        const allArticles = entry?.articles ?? [];
        const isOpen = openOverrides[country.code] ?? index === 0;
        const visible = visibleByCountry[country.code] ?? INITIAL_VISIBLE;
        const articles = allArticles.slice(0, visible);
        const remaining = allArticles.length - articles.length;
        const panelId = `matome-panel-${country.code}`;

        return (
          <section
            key={country.code}
            className="border border-black/10 dark:border-white/15 rounded-lg overflow-hidden"
          >
            <h2>
              <button
                type="button"
                onClick={() =>
                  setOpenOverrides((prev) => ({ ...prev, [country.code]: !isOpen }))
                }
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="w-full bg-neutral-800 text-white font-bold px-4 py-2 text-sm flex items-center gap-2 text-left hover:bg-neutral-700"
              >
                <Chevron open={isOpen} />
                <span className="min-w-0 truncate">
                  【速報】{country.flag} {country.nameJa}のニュースまとめ
                </span>
                <span className="ml-auto shrink-0 font-normal text-xs text-white/60">
                  {allArticles.length}件
                </span>
              </button>
            </h2>

            {isOpen && (
              <div id={panelId}>
                <div className="divide-y divide-black/10 dark:divide-white/10">
                  {articles.length === 0 && (
                    <p className="px-4 py-3 text-sm text-black/50 dark:text-white/50">
                      まだニュースがありません。
                    </p>
                  )}
                  {articles.map((article, i) => (
                    <div key={article.id} className="px-4 py-3 flex flex-col gap-1">
                      <p className="text-sm flex items-center gap-1.5 flex-wrap">
                        <span className="text-black/40 dark:text-white/40 mr-1">&gt;&gt;{i + 1}</span>
                        <TagBadge tagId={article.tag} />
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold hover:underline"
                        >
                          {article.titleJa ?? article.originalTitle}
                        </a>
                      </p>
                      {article.summaryJa && (
                        <p className="text-sm text-black/70 dark:text-white/70 bg-black/[0.03] dark:bg-white/[0.05] rounded px-2 py-1.5">
                          {article.summaryJa}
                        </p>
                      )}
                      <p className="text-xs text-black/40 dark:text-white/40">{article.sourceName}</p>
                    </div>
                  ))}
                </div>
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleByCountry((prev) => ({
                        ...prev,
                        [country.code]: visible + LOAD_MORE_STEP,
                      }))
                    }
                    className="w-full text-xs border-t border-black/10 dark:border-white/15 py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  >
                    もっと見る（残り{remaining}件）
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
