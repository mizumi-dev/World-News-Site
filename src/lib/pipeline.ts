import { getCountry } from "@/lib/config/countries";
import { assignDedupKeys, mergeClustersByEmbedding } from "@/lib/dedup";
import { getEmbeddings } from "@/lib/embeddings";
import { getFallbackNewsProvider, getNewsProvider, NewsProviderError } from "@/lib/news";
import type { Article } from "@/lib/news/types";
import { summarizeArticles } from "@/lib/summarize";
import {
  getCountryCache,
  getSummaries,
  isFresh,
  saveSummaries,
  setCountryCache,
  type SummaryEntry,
} from "@/lib/cache";

export interface RefreshResult {
  code: string;
  ok: boolean;
  count: number;
  error?: string;
  /** ニュース取得は成功したが、要約が揃わなかった場合の理由 */
  warning?: string;
  /** 記事を取得せずキャッシュをそのまま使った場合に true */
  cached?: boolean;
  /** 表示記事のうち要約がまだ無い件数。0でなければ次回実行で埋まる */
  pending?: number;
}

const MAX_ARTICLES_PER_COUNTRY = Number(process.env.MAX_ARTICLES_PER_COUNTRY ?? 10);
const CACHE_TTL_MINUTES = Number(process.env.CACHE_TTL_MINUTES ?? 15);
// 1回のQwen呼び出しで要約する記事数の上限（国単位ではなく、重複排除後のユニーク記事単位）
const SUMMARIZE_CHUNK_SIZE = 10;
/**
 * 1回のrefreshCountries呼び出しで新規に要約するdedupKeyの上限（ハード上限、安全弁）。
 * フィード側の変化や重複判定の精度低下で新規記事が急増しても、AIコストと実行時間が
 * 青天井にならないようにする最終防衛ライン。通常はこれより先に SUMMARIZE_TIME_BUDGET_MS の
 * 時間予算の方で先に打ち切られる（下記 summarizeRepresentatives 参照）。
 */
const MAX_NEW_SUMMARIES_PER_RUN = Number(process.env.MAX_NEW_SUMMARIES_PER_RUN ?? 600);
/**
 * 新規要約に使ってよい実行時間の目安(ミリ秒)。Vercelの実行時間上限(60秒)より十分短く取り、
 * 応答の取りまとめや他国の処理に余裕を残す。
 * 固定の「1回あたり◯件まで」という件数上限だと、Qwen側の応答速度が速い日は余力を無駄にし、
 * 遅い日はタイムアウトの危険がある。時間予算にすることで、実際のスループットに応じて
 * 自動的に「今回どこまで処理できるか」が決まり、翻訳の滞留（未翻訳記事の蓄積）が
 * 自己解消しやすくなる。SUMMARIZE_CHUNK_SIZE件ずつの「波」で処理し、次の波を開始する前に
 * 予算を超えていないか確認する（既に開始した波は最後まで待つ）。
 */
const SUMMARIZE_TIME_BUDGET_MS = Number(process.env.SUMMARIZE_TIME_BUDGET_MS ?? 40_000);
// 1波あたりの並列Qwen呼び出し数
const SUMMARIZE_WAVE_SIZE = 20;
/**
 * ニュース取得結果がこの件数未満だった場合、フォールバックプロバイダ(NewsData.io)でも
 * 取得を試み、より多く取れた方を採用する。取得元フィードの一時的な不調で
 * 「その国だけ記事がほぼ無い」状態が固定化するのを防ぐための自己修復。
 */
const MIN_ARTICLES_BEFORE_FALLBACK = 15;

type CountryState =
  | { code: string; status: "invalid" }
  | { code: string; status: "error"; error: string }
  | { code: string; status: "fresh"; articles: Article[] }
  | { code: string; status: "fetched"; articles: Article[] };

async function fetchCountry(code: string, force: boolean): Promise<CountryState> {
  const country = getCountry(code);
  if (!country) return { code, status: "invalid" };

  if (!force) {
    const cached = await getCountryCache(code);
    // 全記事が要約済みのキャッシュだけを「新鮮」とみなす。
    // 要約に失敗した結果をキャッシュしてしまうと、再度「更新」を押しても再試行されないため。
    const fullySummarized =
      cached !== null && cached.articles.every((a) => a.titleJa && a.summaryJa);
    if (cached && fullySummarized && isFresh(cached.fetchedAt, CACHE_TTL_MINUTES)) {
      return { code, status: "fresh", articles: cached.articles };
    }
  }

  let articles: Article[] = [];
  let primaryError: string | undefined;
  try {
    const provider = getNewsProvider(country);
    articles = await provider.fetchTopHeadlines(code, MAX_ARTICLES_PER_COUNTRY);
  } catch (err) {
    primaryError =
      err instanceof NewsProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "不明なエラーが発生しました";
  }

  // 主プロバイダが失敗した、または記事数が極端に少なかった場合はフォールバックを試す。
  // 「特定の国だけ記事がほぼ無い」状態を、次回の巡回を待たずその場で自己修復するための処理。
  if (primaryError !== undefined || articles.length < MIN_ARTICLES_BEFORE_FALLBACK) {
    const fallback = getFallbackNewsProvider(country);
    if (fallback) {
      try {
        const fallbackArticles = await fallback.fetchTopHeadlines(code, MAX_ARTICLES_PER_COUNTRY);
        if (fallbackArticles.length > articles.length) {
          console.log(
            primaryError
              ? `[fetch] ${code}: 主プロバイダが失敗(${primaryError})したため、フォールバックで${fallbackArticles.length}件取得`
              : `[fetch] ${code}: 主プロバイダが${articles.length}件しか返さなかったため、フォールバックで${fallbackArticles.length}件取得`,
          );
          articles = fallbackArticles;
          primaryError = undefined;
        }
      } catch (fallbackErr) {
        console.warn(
          `[fetch] ${code}: フォールバックプロバイダも失敗しました:`,
          fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
        );
      }
    }
  }

  if (primaryError !== undefined) {
    return { code, status: "error", error: primaryError };
  }
  return { code, status: "fetched", articles };
}

/**
 * 段階③（docs/SPEC.md 8-2）: 埋め込みベクトルで、段階①②が見逃した「言い回しが大きく異なる
 * 同一ニュース」をさらに統合する。オプトイン（ENABLE_EMBEDDING_DEDUP=true）。
 * 失敗しても段階①②の結果をそのまま使って処理を続行する（重複判定の追加精度であり必須ではないため）。
 */
async function mergeByEmbeddingIfEnabled(
  dedupKeyByArticleId: Map<string, string>,
  articles: Article[],
): Promise<Map<string, string>> {
  if (process.env.ENABLE_EMBEDDING_DEDUP !== "true" || articles.length === 0) {
    return dedupKeyByArticleId;
  }

  const representativeTitleByDedupKey = new Map<string, string>();
  for (const article of articles) {
    const dedupKey = dedupKeyByArticleId.get(article.id)!;
    if (!representativeTitleByDedupKey.has(dedupKey)) {
      representativeTitleByDedupKey.set(dedupKey, article.originalTitle);
    }
  }
  // クラスタが1つ以下なら統合しようがない
  if (representativeTitleByDedupKey.size <= 1) return dedupKeyByArticleId;

  try {
    const keys = [...representativeTitleByDedupKey.keys()];
    const embeddings = await getEmbeddings(keys.map((k) => representativeTitleByDedupKey.get(k)!));
    const clusterEmbeddings = new Map(keys.map((k, i) => [k, embeddings[i]]));
    return mergeClustersByEmbedding(dedupKeyByArticleId, clusterEmbeddings);
  } catch (err) {
    console.error(
      "[dedup] 埋め込みによる重複判定に失敗しました。段階①②の結果のみで続行します:",
      err instanceof Error ? err.message : err,
    );
    return dedupKeyByArticleId;
  }
}

/**
 * 国ごとに並列でニュースを取得し、通信社配信などで実質同じ記事（正規化タイトルの一致/類似）は
 * 国をまたいで1回だけ要約する。要約は dedupKey 単位でキャッシュを共有するため、
 * 別の国が既に要約済みの記事は再要約しない。
 */
export interface RefreshRun {
  results: RefreshResult[];
  /** 実行全体の診断値。ログから状況を数字で追えるようにするためのもの */
  stats: {
    /** 今回ニュースを取得した記事数（キャッシュ利用国は含まない） */
    fetched: number;
    /** 重複排除後のユニークな記事数 */
    unique: number;
    /** 既に要約がキャッシュされていた数 */
    cachedSummaries: number;
    /** 今回新たに要約した数 */
    newSummaries: number;
    /** 上限に達して次回送りにした数 */
    deferred: number;
  };
}

export async function refreshCountries(codes: string[], force = false): Promise<RefreshRun> {
  const countryStates = await Promise.all(codes.map((code) => fetchCountry(code, force)));

  const toSummarize = countryStates.filter((s) => s.status === "fetched");
  const allFetchedArticles = toSummarize.flatMap((s) => s.articles);

  const dedupKeyByArticleId = await mergeByEmbeddingIfEnabled(
    assignDedupKeys(allFetchedArticles.map((a) => ({ key: a.id, title: a.originalTitle }))),
    allFetchedArticles,
  );

  const uniqueDedupKeys = [...new Set(dedupKeyByArticleId.values())];
  const cachedSummaries = await getSummaries(uniqueDedupKeys);

  // 各dedupKeyにつき、まだ要約が無ければ代表記事を1件だけ要約対象にする
  const representativeByDedupKey = new Map<string, Article>();
  for (const article of allFetchedArticles) {
    const dedupKey = dedupKeyByArticleId.get(article.id)!;
    if (!cachedSummaries[dedupKey] && !representativeByDedupKey.has(dedupKey)) {
      representativeByDedupKey.set(dedupKey, article);
    }
  }
  const allRepresentatives = [...representativeByDedupKey.entries()];
  // ハード上限（安全弁）。通常はこれより先に時間予算の方で打ち切られる
  const representatives = allRepresentatives.slice(0, MAX_NEW_SUMMARIES_PER_RUN);
  const capDeferredCount = allRepresentatives.length - representatives.length;

  const chunks: [string, Article][][] = [];
  for (let i = 0; i < representatives.length; i += SUMMARIZE_CHUNK_SIZE) {
    chunks.push(representatives.slice(i, i + SUMMARIZE_CHUNK_SIZE));
  }

  const newSummaries: Record<string, SummaryEntry> = {};
  let summarizeError: string | undefined;
  let attemptedCount = 0;
  let timeBudgetExceeded = false;
  const startedAt = Date.now();

  // SUMMARIZE_CHUNK_SIZE件ずつのチャンクを、SUMMARIZE_WAVE_SIZE個まとめた「波」単位で処理する。
  // 波を始める前に時間予算を確認することで、実際のQwenの応答速度に応じて
  // 「今回どこまでできるか」が自動的に決まる（固定の件数上限だと、速い日は余力を無駄にし、
  // 遅い日はタイムアウトの危険がある）。既に始めた波は最後まで待つ。
  for (let i = 0; i < chunks.length; i += SUMMARIZE_WAVE_SIZE) {
    if (Date.now() - startedAt > SUMMARIZE_TIME_BUDGET_MS) {
      timeBudgetExceeded = true;
      break;
    }
    const wave = chunks.slice(i, i + SUMMARIZE_WAVE_SIZE);
    attemptedCount += wave.reduce((sum, chunk) => sum + chunk.length, 0);
    await Promise.all(
      wave.map(async (chunk) => {
        const outcome = await summarizeArticles(chunk.map(([, article]) => article));
        if (outcome.error) summarizeError = outcome.error;
        outcome.articles.forEach((resultArticle, j) => {
          if (resultArticle.titleJa && resultArticle.summaryJa) {
            const [dedupKey] = chunk[j];
            newSummaries[dedupKey] = {
              titleJa: resultArticle.titleJa,
              summaryJa: resultArticle.summaryJa,
              titleEn: resultArticle.titleEn,
              summaryEn: resultArticle.summaryEn,
              tag: resultArticle.tag,
            };
          }
        });
      }),
    );
  }
  if (Object.keys(newSummaries).length > 0) {
    await saveSummaries(newSummaries);
  }

  // 「次回に持ち越す」件数 = 上限カットで最初から手を付けなかった分 + 時間予算切れで手を付けられなかった分
  const timeBudgetDeferredCount = representatives.length - attemptedCount;
  const deferredCount = capDeferredCount + timeBudgetDeferredCount;
  if (deferredCount > 0) {
    console.log(
      timeBudgetExceeded
        ? `[summarize] 時間予算(${SUMMARIZE_TIME_BUDGET_MS}ms)に達したため、${deferredCount}件を次回に持ち越します`
        : `[summarize] 新規要約の上限(${MAX_NEW_SUMMARIES_PER_RUN}件)に達したため、${deferredCount}件を次回に持ち越します`,
    );
  }

  const allSummaries = { ...cachedSummaries, ...newSummaries };

  const results = await Promise.all(
    countryStates.map(async (state): Promise<RefreshResult> => {
      if (state.status === "invalid") {
        return { code: state.code, ok: false, count: 0, error: `未対応の国コードです: ${state.code}` };
      }
      if (state.status === "error") {
        return { code: state.code, ok: false, count: 0, error: state.error };
      }
      if (state.status === "fresh") {
        return { code: state.code, ok: true, count: state.articles.length, cached: true };
      }

      const withSummary = state.articles.map((article) => {
        const summary = allSummaries[dedupKeyByArticleId.get(article.id)!];
        return summary ? { ...article, ...summary } : article;
      });

      // 同じ国内で実質同じ記事（通信社配信等）が複数媒体から取れた場合、
      // 発行時刻が最も早い（一次情報に近い）ものだけを代表として残す
      const groupsByDedupKey = new Map<string, Article[]>();
      for (const article of withSummary) {
        const dedupKey = dedupKeyByArticleId.get(article.id)!;
        const group = groupsByDedupKey.get(dedupKey);
        if (group) group.push(article);
        else groupsByDedupKey.set(dedupKey, [article]);
      }

      // デバッグ用: どの見出しが同一グループに統合されたか可視化する
      for (const group of groupsByDedupKey.values()) {
        if (group.length > 1) {
          console.log(
            `[dedup] ${state.code}: ${group.length}件を統合 ->`,
            group.map((a) => a.originalTitle),
          );
        }
      }

      const articles = [...groupsByDedupKey.values()]
        .map((group) =>
          group.reduce((earliest, a) =>
            new Date(a.publishedAt) < new Date(earliest.publishedAt) ? a : earliest,
          ),
        )
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      console.log(
        `[dedup] ${state.code}: 取得${state.articles.length}件 -> 表示${articles.length}件`,
      );

      await setCountryCache(state.code, { articles, fetchedAt: new Date().toISOString() });

      const pending = articles.filter((a) => !a.titleJa || !a.summaryJa).length;

      // 要約が揃わない理由は3つあり、区別しないと原因の切り分けができない。
      // (1) Qwen APIが実際に失敗した (2) 1回あたりの新規要約上限に達して次回送りになった
      // (3) それ以外（想定外）。(2)は正常な挙動なのでエラーとして報告しない。
      let warning: string | undefined;
      if (pending > 0) {
        if (summarizeError) {
          warning = `AI要約に失敗しました: ${summarizeError}`;
        } else if (deferredCount > 0) {
          warning = timeBudgetExceeded
            ? `1回の実行時間予算を使い切ったため、${pending}件は次回の実行で要約されます`
            : `新規要約の上限(${MAX_NEW_SUMMARIES_PER_RUN}件/回)に達したため、${pending}件は次回の実行で要約されます`;
        } else {
          warning = `${pending}件の要約が生成されませんでした（AI応答に該当記事が含まれていない可能性があります）`;
        }
      }

      return {
        code: state.code,
        ok: true,
        count: articles.length,
        pending: pending > 0 ? pending : undefined,
        warning,
      };
    }),
  );

  const stats = {
    fetched: allFetchedArticles.length,
    unique: uniqueDedupKeys.length,
    cachedSummaries: Object.keys(cachedSummaries).length,
    newSummaries: Object.keys(newSummaries).length,
    deferred: deferredCount,
  };
  console.log("[refresh] stats:", JSON.stringify(stats));

  return { results, stats };
}
