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

function articleLimitFor(size: SlotSize): number {
  switch (size) {
    case "large":
      return 4;
    case "medium":
      return 3;
    case "small":
      return 2;
  }
}

function SectionHeader({
  country,
  options,
  onChange,
}: {
  country: Country;
  options: Country[];
  onChange: (code: string) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b-2 border-black/80 dark:border-white/80 pb-1 mb-2">
      <h2 className="font-serif font-bold text-lg">
        {country.flag} {country.nameJa}
      </h2>
      <select
        value={country.code}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs border border-black/15 rounded px-1.5 py-0.5 bg-transparent"
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

  return (
    <div className="font-serif grid grid-cols-1 md:grid-cols-6 gap-6">
      {slots.map((slot, i) => {
        const assignedCode = sectionOverrides[i] ?? countries[i]?.code ?? countries[0]?.code;
        const country = COUNTRIES.find((c) => c.code === assignedCode) ?? countries[0];
        const entry = newsData[country.code];
        const articles = (entry?.articles ?? []).slice(0, articleLimitFor(slot.size));

        return (
          <div key={i} className={slot.colSpanClass}>
            <SectionHeader
              country={country}
              options={countries}
              onChange={(code) => onSectionOverrideChange(i, code)}
            />
            {articles.length === 0 ? (
              <p className="text-sm text-black/50 dark:text-white/50">
                まだニュースがありません。「更新」を押してください。
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {articles.map((article, articleIndex) => {
                  const isLead = slot.size === "large" && articleIndex === 0;
                  return (
                    <article key={article.id} className="flex flex-col gap-1">
                      <TagBadge tagId={article.tag} />
                      <h3
                        className={
                          isLead ? "text-2xl font-bold leading-tight" : "font-semibold leading-snug"
                        }
                      >
                        <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {article.titleJa ?? article.originalTitle}
                        </a>
                      </h3>
                      {article.summaryJa && (
                        <p
                          className={
                            isLead
                              ? "text-sm text-black/80 dark:text-white/80"
                              : "text-xs text-black/60 dark:text-white/60"
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
            )}
          </div>
        );
      })}
    </div>
  );
}
