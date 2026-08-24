export function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="記事を検索（見出し・要約）"
      className="w-full sm:w-64 border border-black/15 rounded px-3 py-1.5 text-sm bg-white dark:bg-black/20"
    />
  );
}
