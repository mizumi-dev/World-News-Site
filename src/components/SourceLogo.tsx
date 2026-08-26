import { sourceFaviconUrl } from "@/lib/news/display";

/**
 * 出典サイト名とその favicon（ロゴ）を横並びで表示する。
 * favicon は Google の無料 favicon サービスからブラウザが直接読み込むため、
 * サーバー側の追加コストは発生しない。取得できない場合は名前だけを表示する。
 */
export function SourceLogo({
  domain,
  name,
  className,
}: {
  domain?: string;
  name: string;
  className?: string;
}) {
  const src = sourceFaviconUrl(domain);
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className ?? ""}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
          className="w-4 h-4 rounded-[3px] object-contain shrink-0 bg-black/5 dark:bg-white/10"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}
