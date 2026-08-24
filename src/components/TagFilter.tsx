import { TAGS } from "@/lib/config/tags";

export function TagFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (tagIds: string[]) => void;
}) {
  const toggle = (tagId: string) => {
    if (selected.includes(tagId)) {
      onChange(selected.filter((t) => t !== tagId));
    } else {
      onChange([...selected, tagId]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={() => onChange([])}
        className={`text-xs font-medium rounded-full px-2.5 py-1 border ${
          selected.length === 0
            ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
            : "border-black/15 text-black/60 dark:text-white/60"
        }`}
      >
        すべて
      </button>
      {TAGS.map((tag) => {
        const isSelected = selected.includes(tag.id);
        return (
          <button
            key={tag.id}
            onClick={() => toggle(tag.id)}
            className={`text-xs font-medium rounded-full px-2.5 py-1 ${tag.colorClass} ${
              isSelected ? "ring-2 ring-offset-1 ring-black/40 dark:ring-white/40" : "opacity-50"
            }`}
          >
            {tag.nameJa}
          </button>
        );
      })}
    </div>
  );
}
