"use client";

import { useState } from "react";
import { COUNTRIES, type Country } from "@/lib/config/countries";
import { TagBadge } from "@/components/TagBadge";
import type { CountryNewsMap } from "@/types";

type SlotSize = "large" | "medium" | "small";

interface Slot {
  colSpanClass: string;
  size: SlotSize;
}

/**
 * 選択国数に応じた紙面スロット構成 (SPEC 5.2)。
 * 6分割グリッド上で 2/3=col-span-4, 1/3=col-span-2, 1/2=col-span-3, 全幅=col-span-6 として表現する。
 */
function getSlots(count: number): Slot[] {
  if (count <= 1) {
    return [{ colSpanClass: "md:col-span-6", size: "large" }];
  }
  if (count === 2) {
    return [
      { colSpanClass: "md:col-span-4", size: "large" },
      { colSpanClass: "md:col-span-2", size: "medium" },
    ];
  }
  if (count === 3) {
    return [
      { colSpanClass: "md:col-span-4", size: "large" },
      { colSpanClass: "md:col-span-2", size: "medium" },
      { colSpanClass: "md:col-span-6", size: "medium" },
    ];
  }
  if (count === 4) {
    return [
      { colSpanClass: "md:col-span-4", size: "large" },
      { colSpanClass: "md:col-span-2", size: "medium" },
      { colSpanClass: "md:col-span-3", size: "medium" },
      { colSpanClass: "md:col-span-3", size: "medium" },
    ];
  }
  // 5カ国以上: 上段は2/3+1/3、下段は残りを等幅（3分割）で折り返す
  const slots: Slot[] = [
    { colSpanClass: "md:col-span-4", size: "large" },
    { colSpanClass: "md:col-span-2", size: "medium" },
  ];
  for (let i = 2; i < count; i++) {
    slots.push({ colSpanClass: "md:col-span-2", size: "small" });
  }
  return slots;
}

/**
 * 各スロットの初期表示件数。実際の紙面と同じく、先頭1件をリード記事として大きく扱い、
 * 残りは見出し中心に詰めて表示する。スロットの横幅に対して自然な分量にしている。
 */
function initialCountFor(size: SlotSize): number {
  switch (size) {
    case "large":
      return 8;
    case "medium":
      return 6;
    case "small":
      return 4;
  }
}

const LOAD_MORE_STEP = 10;

/** リード記事の見出しサイズ。スロットが広いほど大きくする */
function leadHeadlineClass(size: SlotSize): string {
  switch (size) {
    case "large":
      return "text-2xl font-bold leading-tight";
    case "medium":
      return "text-lg font-bold leading-tight";
    case "small":
      return "text-base font-bold leading-snug";
  }
}

function SectionHeader({
  country,
  options,
  total,
  onChange,
}: {
  country: Country;
  options: Country[];
  total: number;
  onChange: (code: string) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b-2 border-black/80 dark:border-white/80 pb-1 mb-2 gap-2">
      <h2 className="font-serif font-bold text-lg flex items-baseline gap-1.5 min-w-0">
        <span className="truncate">
          {country.flag} {country.nameJa}
        </span>
        <span className="text-xs font-normal text-black/40 dark:text-white/40 shrink-0">
          {total}件
        </span>
      </h2>
      <select
        value={country.code}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs border border-black/15 rounded px-1.5 py-0.5 bg-transparent shrink-0"
        aria-label={`${country.nameJa}のセクションに表示する国を変更`}
      >
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.flag} {o.nameJa}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NewspaperLayout({
  countries,
  newsData,
  sectionOverrides,
  onSectionOverrideChange,
}: {
  countries: Country[];
  newsData: CountryNewsMap;
  sectionOverrides: Record<number, string>;
  onSectionOverrideChange: (slotIndex: number, code: string) => void;
}) {
  const slots = getSlots(countries.length);
  // スロットごとの表示件数。未操作のスロットは initialCountFor の既定値を使う
  const [shownBySlot, setShownBySlot] = useState<Record<number, number>>({});

  return (
    <div className="font-serif grid grid-cols-1 md:grid-cols-6 gap-6">
      {slots.map((slot, i) => {
        const assignedCode = sectionOverrides[i] ?? countries[i]?.code ?? countries[0]?.code;
        const country = COUNTRIES.find((c) => c.code === assignedCode) ?? countries[0];
        const entry = newsData[country.code];
        const allArticles = entry?.articles ?? [];
        const shown = shownBySlot[i] ?? initialCountFor(slot.size);
        const articles = allArticles.slice(0, shown);
        const remaining = allArticles.length - articles.length;

        return (
          <div key={i} className={slot.colSpanClass}>
            <SectionHeader
              country={country}
              options={countries}
              total={allArticles.length}
              onChange={(code) => onSectionOverrideChange(i, code)}
            />
            {articles.length === 0 ? (
              <p className="text-sm text-black/50 dark:text-white/50">
                まだニュースがありません。
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {articles.map((article, articleIndex) => {
                    const isLead = articleIndex === 0;
                    return (
                      <article
                        key={article.id}
                        className={
                          isLead
                            ? "flex flex-col gap-1"
                            : "flex flex-col gap-0.5 border-t border-black/10 dark:border-white/10 pt-2"
                        }
                      >
                        <TagBadge tagId={article.tag} />
                        <h3 className={isLead ? leadHeadlineClass(slot.size) : "text-sm font-semibold leading-snug"}>
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {article.titleJa ?? article.originalTitle}
                          </a>
                        </h3>
                        {article.summaryJa && (
                          <p
                            className={
                              isLead
                                ? "text-sm text-black/80 dark:text-white/80"
                                : "text-xs text-black/60 dark:text-white/60 line-clamp-2"
                            }
                          >
                            {article.summaryJa}
                          </p>
                        )}
                        <p className="text-[11px] text-black/40 dark:text-white/40">
                          {article.sourceName}
                        </p>
                      </article>
                    );
                  })}
                </div>
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setShownBySlot((prev) => ({ ...prev, [i]: shown + LOAD_MORE_STEP }))
                    }
                    className="mt-3 w-full text-xs font-sans border border-black/15 dark:border-white/20 rounded py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  >
                    もっと見る（残り{remaining}件）
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
