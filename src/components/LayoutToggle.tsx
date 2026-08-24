export type LayoutMode = "newspaper" | "matome";

export function LayoutToggle({
  layout,
  onChange,
}: {
  layout: LayoutMode;
  onChange: (layout: LayoutMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-black/15 overflow-hidden text-sm">
      <button
        onClick={() => onChange("newspaper")}
        className={`px-3 py-1.5 ${
          layout === "newspaper" ? "bg-blue-600 text-white" : "bg-transparent"
        }`}
      >
        新聞風
      </button>
      <button
        onClick={() => onChange("matome")}
        className={`px-3 py-1.5 ${
          layout === "matome" ? "bg-blue-600 text-white" : "bg-transparent"
        }`}
      >
        まとめ風
      </button>
    </div>
  );
}
