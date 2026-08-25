import { getTag } from "@/lib/config/tags";

export function TagBadge({ tagId }: { tagId: string | null }) {
  const tag = getTag(tagId ?? undefined);
  if (!tag) return null;
  return (
    // w-fit がないと、flex-col のカード内で align-self: stretch により
    // バッジが列幅いっぱいに伸びて帯のように見えてしまう
    <span className={`inline-block w-fit text-[11px] font-medium rounded-full px-2 py-0.5 ${tag.colorClass}`}>
      {tag.nameJa}
    </span>
  );
}
