"use client";

import { useCallback, useEffect, useState } from "react";
import { getCountry } from "@/lib/config/countries";
import { CountrySelector } from "@/components/CountrySelector";
import { LayoutToggle, type LayoutMode } from "@/components/LayoutToggle";
import { RefreshButton } from "@/components/RefreshButton";
import { NewspaperLayout } from "@/components/NewspaperLayout";
import { MatomeLayout } from "@/components/MatomeLayout";
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshErrors, setRefreshErrors] = useState<{ code: string; error: string }[]>([]);

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

  const loadCached = useCallback(async (codes: string[]) => {
    if (codes.length === 0) {
      setNewsData({});
      return;
    }
    const res = await fetch(`/api/news?countries=${codes.join(",")}`);
    const data = await res.json();
    setNewsData(data.countries ?? {});
  }, []);

  // 選択国が変わるたびにキャッシュ済みニュースを読み込む
  useEffect(() => {
    if (!hydrated) return;
    let ignore = false;
    fetch(`/api/news?countries=${selectedCountries.join(",")}`)
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) setNewsData(data.countries ?? {});
      });
    return () => {
      ignore = true;
    };
  }, [hydrated, selectedCountries]);

  const handleRefresh = useCallback(async () => {
    if (selectedCountries.length === 0) return;
    setIsRefreshing(true);
    setRefreshErrors([]);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countries: selectedCountries }),
      });
      const data = await res.json();
      const results = (data.results ?? []) as {
        code: string;
        ok: boolean;
        error?: string;
        warning?: string;
      }[];
      const messages = results.flatMap((r) => {
        if (!r.ok) return [{ code: r.code, error: r.error ?? "更新に失敗しました" }];
        if (r.warning) return [{ code: r.code, error: r.warning }];
        return [];
      });
      setRefreshErrors(messages);
      await loadCached(selectedCountries);
    } catch (err) {
      setRefreshErrors([{ code: "", error: err instanceof Error ? err.message : "更新に失敗しました" }]);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedCountries, loadCached]);

  const selectedCountryObjects = selectedCountries
    .map((code) => getCountry(code))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const hasAnyArticles = Object.values(newsData).some((entry) => entry.articles.length > 0);

  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-bold">世界ニュースまとめ（プロトタイプ）</h1>
          <div className="flex items-center gap-2 shrink-0">
            <LayoutToggle layout={layout} onChange={setLayout} />
            <RefreshButton isRefreshing={isRefreshing} onClick={handleRefresh} />
          </div>
        </div>
        <CountrySelector selected={selectedCountries} onChange={setSelectedCountries} />
      </header>

      {refreshErrors.length > 0 && (
        <div className="flex flex-col gap-2">
          {refreshErrors.map((e, i) => (
            <p
              key={i}
              className="text-sm text-red-600 border border-red-200 bg-red-50 rounded p-3"
            >
              {getCountry(e.code)?.nameJa ?? "更新"}: {e.error}
            </p>
          ))}
        </div>
      )}

      {selectedCountries.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          表示したい国を上から選んでください。
        </p>
      )}

      {selectedCountries.length > 0 && !hasAnyArticles && refreshErrors.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          まだニュースがありません。「更新」を押してください。
        </p>
      )}

      {selectedCountries.length > 0 &&
        (layout === "newspaper" ? (
          <NewspaperLayout
            countries={selectedCountryObjects}
            newsData={newsData}
            sectionOverrides={sectionOverrides}
            onSectionOverrideChange={(slotIndex, code) =>
              setSectionOverrides((prev) => ({ ...prev, [slotIndex]: code }))
            }
          />
        ) : (
          <MatomeLayout countries={selectedCountryObjects} newsData={newsData} />
        ))}
    </div>
  );
}
