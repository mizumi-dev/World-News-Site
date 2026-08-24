import { NextRequest, NextResponse } from "next/server";
import { refreshCountries } from "@/lib/pipeline";
import { COUNTRIES } from "@/lib/config/countries";

const VALID_CODES = new Set(COUNTRIES.map((c) => c.code));

// Qwen要約は国ごとに最大30秒×2リトライかかりうるため、Vercelのデフォルト実行時間(10秒)より長く確保する
export const maxDuration = 60;

/**
 * 収集専用エンドポイント。公開サイトでは誰でも叩けてしまうと、AI課金とニュースAPI枠を
 * 無制限に消費されてしまうため、cronと同じ CRON_SECRET で保護する
 * （docs/ARCHITECTURE_REVIEW.md「収集と配信の分離」参照）。
 * ブラウザから直接叩くための公開APIではない。手動更新はUIから廃止し、
 * GitHub Actions等の定期実行からのみ呼び出す想定。
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
