import { getTag } from "@/lib/config/tags";

export function TagBadge({ tagId }: { tagId: string | null }) {
  const tag = getTag(tagId ?? undefined);
  if (!tag) return null;
  return (
    <span className={`inline-block text-[11px] font-medium rounded-full px-2 py-0.5 ${tag.colorClass}`}>
      {tag.nameJa}
    </span>
  );
}
