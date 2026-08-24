export function RefreshButton({
  isRefreshing,
  onClick,
}: {
  isRefreshing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isRefreshing}
      className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-50 shrink-0"
    >
      {isRefreshing ? "更新中…" : "更新"}
    </button>
  );
}
