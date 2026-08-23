"use client";

import { useCallback, useEffect, useState } from "react";
import { ArticleCard } from "@/components/ArticleCard";
import type { Article } from "@/lib/news/types";

// フェーズ2: 日本(jp)固定の縦貫通確認用の最小UI。国選択・レイアウト切替はフェーズ3で実装する。
const COUNTRY_CODE = "jp";

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCached = useCallback(async () => {
    const res = await fetch(`/api/news?countries=${COUNTRY_CODE}`);
    const data = await res.json();
    const countryData = data.countries?.[COUNTRY_CODE];
    setArticles(countryData?.articles ?? []);
    setFetchedAt(countryData?.fetchedAt ?? null);
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/news?countries=${COUNTRY_CODE}`)
      .then((res) => res.json())
      .then((data) => {
        if (ignore) return;
        const countryData = data.countries?.[COUNTRY_CODE];
        setArticles(countryData?.articles ?? []);
        setFetchedAt(countryData?.fetchedAt ?? null);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countries: [COUNTRY_CODE] }),
      });
      const data = await res.json();
      const result = data.results?.[0];
      if (!result?.ok) {
        setError(result?.error ?? "更新に失敗しました");
      }
      await loadCached();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setIsRefreshing(false);
    }
  }, [loadCached]);

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">世界ニュースまとめ（プロトタイプ）</h1>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {isRefreshing ? "更新中…" : "更新"}
        </button>
      </header>

      {fetchedAt && (
        <p className="text-xs text-black/50 dark:text-white/50">
          最終更新: {new Date(fetchedAt).toLocaleString("ja-JP")}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded p-3">
          {error}
        </p>
      )}

      {articles.length === 0 && !error && (
        <p className="text-sm text-black/60 dark:text-white/60">
          まだニュースがありません。「更新」を押してください。
        </p>
      )}

      <div className="flex flex-col gap-3">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </div>
  );
}
