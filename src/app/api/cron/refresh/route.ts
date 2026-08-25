import { NextRequest, NextResponse } from "next/server";
import { refreshCountries } from "@/lib/pipeline";
import { COUNTRIES } from "@/lib/config/countries";

// Qwen要約は記事数に応じて数十秒かかりうるため、Vercelのデフォルト実行時間より長く確保する
export const maxDuration = 300;

/**
 * Vercel Cron から叩かれる自動更新エンドポイント。全対応国を一度に更新する。
 * Vercelは環境変数 CRON_SECRET が設定されていると、cron実行時のリクエストに
 * `Authorization: Bearer {CRON_SECRET}` を自動で付与する。それ以外からの呼び出しは拒否する。
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET が設定されていません" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const codes = COUNTRIES.map((c) => c.code);
  const { results, stats } = await refreshCountries(codes, false);
  return NextResponse.json({ stats, results });
}
