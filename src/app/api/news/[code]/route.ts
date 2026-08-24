import { NextResponse } from "next/server";
import { getCountryCache } from "@/lib/cache";
import { COUNTRIES } from "@/lib/config/countries";

const VALID_CODES = new Set(COUNTRIES.map((c) => c.code));

// パスパラメータのみで検索パラメータを使わないため、Next.jsが静的にキャッシュしてくれる（ISR）。
// これにより閲覧のたびにサーバー関数が起動してRedisを読みに行くことがなくなる。
// CACHE_TTL_MINUTES のデフォルト(15分)に合わせているが、更新頻度を変えたら合わせて調整する。
export const revalidate = 900;

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!VALID_CODES.has(code)) {
    return NextResponse.json({ error: `未対応の国コードです: ${code}` }, { status: 400 });
  }

  const cached = await getCountryCache(code);
  return NextResponse.json({
    articles: cached?.articles ?? [],
    fetchedAt: cached?.fetchedAt ?? null,
  });
}
