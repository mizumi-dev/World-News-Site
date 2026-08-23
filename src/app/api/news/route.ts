import { NextRequest, NextResponse } from "next/server";
import { getCountryCache } from "@/lib/cache";
import { COUNTRIES } from "@/lib/config/countries";

const VALID_CODES = new Set(COUNTRIES.map((c) => c.code));

export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("countries") ?? "";
  const codes = param
    .split(",")
    .map((c) => c.trim())
    .filter((c) => VALID_CODES.has(c));

  const countries: Record<string, { articles: unknown[]; fetchedAt: string | null }> = {};
  for (const code of codes) {
    const cached = await getCountryCache(code);
    countries[code] = {
      articles: cached?.articles ?? [],
      fetchedAt: cached?.fetchedAt ?? null,
    };
  }

  return NextResponse.json({ countries });
}
