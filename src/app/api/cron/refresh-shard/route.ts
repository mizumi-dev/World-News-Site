import { NextRequest, NextResponse } from "next/server";
import { refreshCountries } from "@/lib/pipeline";
import { COUNTRIES } from "@/lib/config/countries";

// トピック別フィード込みで数カ国分を処理するため、デフォルト(10秒)より長く確保する
export const maxDuration = 60;

/**
 * GitHub Actions から数分〜数十分おきに叩かれる、シャード（分割）更新エンドポイント。
 * Vercel Cron(Hobbyプラン)は1日1回までしか実行できないため、全国×全トピックを
 * 高頻度で更新するにはこのエンドポイントを外部スケジューラから叩く必要がある
 * （docs/ARCHITECTURE_REVIEW.md「更新方法」参照）。
 *
 * 呼び出し側は状態を持たず、いつ呼んでも安全なようにする。
 * どの国を処理するかは「現在時刻」から決定的に計算するシャード番号で決める
 * （SHARD_INTERVAL_MINUTES 間隔で切り替わり、NUM_SHARDS 個で全国を一巡する）。
 * これにより、GitHub Actions 側は単に一定間隔で叩くだけでよく、
 * サーバー側の状態やロックを持たずに「今どの国の番か」を再現できる。
 */
// トピック別フィード導入で1国あたりの記事数が10件から最大150件に増えたため、
// 1回のシャードで扱う国数を減らし、その分実行間隔を短くして一巡時間を維持する。
// 1シャードあたりの国数は全対応国数をシャード数(11)で割った値（約5カ国/回）になる。
// 15分間隔 × 11シャードで、全国を約2.75時間で一巡する。
// ワークフロー(.github/workflows/scheduled-refresh.yml)のcron式と必ず揃えること。
const SHARD_INTERVAL_MINUTES = 15;
const NUM_SHARDS = 11;

function currentShardCountries(): { shardIndex: number; codes: string[] } {
  const shardIndex =
    Math.floor(Date.now() / (SHARD_INTERVAL_MINUTES * 60_000)) % NUM_SHARDS;
  const codes = COUNTRIES.filter((_, i) => i % NUM_SHARDS === shardIndex).map((c) => c.code);
  return { shardIndex, codes };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET が設定されていません" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shardIndex, codes } = currentShardCountries();
  const { results, stats } = await refreshCountries(codes, false);
  return NextResponse.json({ shardIndex, numShards: NUM_SHARDS, stats, results });
}
