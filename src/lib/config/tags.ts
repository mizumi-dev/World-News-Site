export interface Tag {
  id: string;
  nameJa: string;
  /** Tailwindのユーティリティクラス。背景と文字色をセットで管理する */
  colorClass: string;
}

// 記事に付けるタグの一覧。AI要約時にこの中から1つを選ばせる（src/lib/summarize.ts）。
// 増やす場合はここに追加し、summarize.ts のプロンプトにも反映されるようにする（TAGS を参照しているので自動的に反映される）。
export const TAGS: Tag[] = [
  { id: "politics", nameJa: "政治", colorClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  { id: "economy", nameJa: "経済", colorClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { id: "business", nameJa: "ビジネス", colorClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  { id: "technology", nameJa: "テクノロジー", colorClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { id: "science", nameJa: "科学", colorClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300" },
  { id: "health", nameJa: "健康・医療", colorClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { id: "sports", nameJa: "スポーツ", colorClass: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { id: "entertainment", nameJa: "エンタメ", colorClass: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300" },
  { id: "world", nameJa: "国際", colorClass: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  { id: "disaster", nameJa: "事件・災害", colorClass: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  { id: "environment", nameJa: "環境", colorClass: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
  { id: "other", nameJa: "その他", colorClass: "bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300" },
];

export function getTag(id: string | null | undefined): Tag | undefined {
  return TAGS.find((t) => t.id === id);
}
