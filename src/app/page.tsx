"use client";

import { useCallback, useEffect, useState } from "react";
import { getCountry } from "@/lib/config/countries";
import { CountrySelector } from "@/components/CountrySelector";
import { LayoutToggle, type LayoutMode } from "@/components/LayoutToggle";
import { NewspaperLayout } from "@/components/NewspaperLayout";
import { MatomeLayout } from "@/components/MatomeLayout";
import { TagFilter } from "@/components/TagFilter";
import { SearchBox } from "@/components/SearchBox";
import type { CountryNewsMap } from "@/types";

const STORAGE_KEY = "wns:settings";
const DEFAULT_COUNTRIES = ["jp", "us", "gb"];

interface StoredSettings {
  selectedCountries: string[];
  layout: LayoutMode;
  sectionOverrides: Record<number, string>;
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(DEFAULT_COUNTRIES);
  const [layout, setLayout] = useState<LayoutMode>("newspaper");
  const [sectionOverrides, setSectionOverrides] = useState<Record<number, string>>({});

  const [newsData, setNewsData] = useState<CountryNewsMap>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // 初回マウント時に localStorage から設定を復元する
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<StoredSettings>;
          if (parsed.selectedCountries?.length) setSelectedCountries(parsed.selectedCountries);
          if (parsed.layout) setLayout(parsed.layout);
          if (parsed.sectionOverrides) setSectionOverrides(parsed.sectionOverrides);
        }
      } catch {
        // 壊れた設定は無視してデフォルトのまま続行する
      }
      setHydrated(true);
    });
  }, []);

  // 設定が変わるたびに localStorage へ保存する（初回復元より後のみ）
  useEffect(() => {
    if (!hydrated) return;
    const settings: StoredSettings = { selectedCountries, layout, sectionOverrides };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [hydrated, selectedCountries, layout, sectionOverrides]);

  // 国ごとに独立したパス(/api/news/{code})を叩く。クエリパラメータを使わないため
  // Next.jsがISRで静的キャッシュでき、閲覧のたびにサーバー関数やRedisを読みに行かずに済む。
  const fetchNewsForCountries = useCallback(async (codes: string[]): Promise<CountryNewsMap> => {
    const entries = await Promise.all(
      codes.map(async (code) => {
        const res = await fetch(`/api/news/${code}`);
        const data = await res.json();
        return [code, { articles: data.articles ?? [], fetchedAt: data.fetchedAt ?? null }] as const;
      }),
    );
    return Object.fromEntries(entries);
  }, []);

  // 選択国が変わるたびにキャッシュ済みニュースを読み込む
  useEffect(() => {
    if (!hydrated) return;
    let ignore = false;
    fetchNewsForCountries(selectedCountries).then((data) => {
      if (!ignore) setNewsData(data);
    });
    return () => {
      ignore = true;
    };
  }, [hydrated, selectedCountries, fetchNewsForCountries]);

  const selectedCountryObjects = selectedCountries
    .map((code) => getCountry(code))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const query = searchQuery.trim().toLowerCase();
  const filteredNewsData: CountryNewsMap = Object.fromEntries(
    Object.entries(newsData).map(([code, entry]) => [
      code,
      {
        ...entry,
        articles: entry.articles.filter((article) => {
          if (selectedTags.length > 0 && !selectedTags.includes(article.tag ?? "other")) {
            return false;
          }
          if (query === "") return true;
          const haystack = `${article.titleJa ?? ""} ${article.summaryJa ?? ""} ${article.originalTitle}`.toLowerCase();
          return haystack.includes(query);
        }),
      },
    ]),
  );

  const hasAnyArticles = Object.values(newsData).some((entry) => entry.articles.length > 0);
  const hasFilteredArticles = Object.values(filteredNewsData).some(
    (entry) => entry.articles.length > 0,
  );

  // 表示中の国のうち最も新しい更新時刻。更新は裏側の定期実行が担うため、ここは表示のみ
  const lastUpdatedAt = Object.values(newsData)
    .map((entry) => entry.fetchedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-bold">世界ニュースまとめ（プロトタイプ）</h1>
          <div className="flex items-center gap-2 shrink-0">
            <LayoutToggle layout={layout} onChange={setLayout} />
          </div>
        </div>
        <CountrySelector selected={selectedCountries} onChange={setSelectedCountries} />
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
          <TagFilter selected={selectedTags} onChange={setSelectedTags} />
          <SearchBox value={searchQuery} onChange={setSearchQuery} />
        </div>
        {lastUpdatedAt && (
          <p className="text-xs text-black/50 dark:text-white/50">
            最終更新: {new Date(lastUpdatedAt).toLocaleString("ja-JP")}
            （ニュースは裏側で自動更新されています）
          </p>
        )}
      </header>

      {selectedCountries.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          表示したい国を上から選んでください。
        </p>
      )}

      {selectedCountries.length > 0 && !hasAnyArticles && (
        <p className="text-sm text-black/60 dark:text-white/60">
          まだニュースがありません。しばらくしてから再度アクセスしてください。
        </p>
      )}

      {selectedCountries.length > 0 && hasAnyArticles && !hasFilteredArticles && (
        <p className="text-sm text-black/60 dark:text-white/60">
          条件に一致する記事がありません。タグや検索条件を変えてみてください。
        </p>
      )}

      {selectedCountries.length > 0 &&
        (layout === "newspaper" ? (
          <NewspaperLayout
            countries={selectedCountryObjects}
            newsData={filteredNewsData}
            sectionOverrides={sectionOverrides}
            onSectionOverrideChange={(slotIndex, code) =>
              setSectionOverrides((prev) => ({ ...prev, [slotIndex]: code }))
            }
          />
        ) : (
          <MatomeLayout countries={selectedCountryObjects} newsData={filteredNewsData} />
        ))}
    </div>
  );
}
