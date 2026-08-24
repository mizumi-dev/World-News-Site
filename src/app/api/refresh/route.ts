import { NextRequest, NextResponse } from "next/server";
import { refreshCountries } from "@/lib/pipeline";
import { COUNTRIES } from "@/lib/config/countries";

const VALID_CODES = new Set(COUNTRIES.map((c) => c.code));

// Qwen要約は国ごとに最大30秒×2リトライかかりうるため、Vercelのデフォルト実行時間(10秒)より長く確保する
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: { countries?: unknown; force?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONではありません" }, { status: 400 });
  }

  const countries = Array.isArray(body.countries)
    ? body.countries.filter((c): c is string => typeof c === "string" && VALID_CODES.has(c))
    : [];

  if (countries.length === 0) {
    return NextResponse.json({ error: "countries が指定されていません" }, { status: 400 });
  }

  const force = body.force === true;
  const results = await refreshCountries(countries, force);
  return NextResponse.json({ results });
}
