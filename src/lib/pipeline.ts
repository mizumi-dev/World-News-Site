import { getCountry } from "@/lib/config/countries";
import { assignDedupKeys, mergeClustersByEmbedding } from "@/lib/dedup";
import { getEmbeddings } from "@/lib/embeddings";
import { getNewsProvider, NewsProviderError } from "@/lib/news";
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
  /** ニュース取得は成功したが要約に失敗した場合の理由 */
  warning?: string;
}

const MAX_ARTICLES_PER_COUNTRY = Number(process.env.MAX_ARTICLES_PER_COUNTRY ?? 10);
const CACHE_TTL_MINUTES = Number(process.env.CACHE_TTL_MINUTES ?? 15);
// 1回のQwen呼び出しで要約する記事数の上限（国単位ではなく、重複排除後のユニーク記事単位）
const SUMMARIZE_CHUNK_SIZE = 10;
/**
 * 1回のrefreshCountries呼び出しで新規に要約するdedupKeyの上限。
 * トピック別フィード導入で取得量が大きく増えたため、何らかの異常（フィード側の変化、
 * 重複判定の精度低下など）で新規記事が急増してもAIコストが青天井にならないようにする安全弁。
 * 上限を超えた分は要約なしのまま返り、次回の実行で改めて対象になる。
 */
const MAX_NEW_SUMMARIES_PER_RUN = Number(process.env.MAX_NEW_SUMMARIES_PER_RUN ?? 300);

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

  try {
    const provider = getNewsProvider(country);
    const articles = await provider.fetchTopHeadlines(code, MAX_ARTICLES_PER_COUNTRY);
    return { code, status: "fetched", articles };
  } catch (err) {
    const message =
      err instanceof NewsProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "不明なエラーが発生しました";
    return { code, status: "error", error: message };
  }
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
export async function refreshCountries(codes: string[], force = false): Promise<RefreshResult[]> {
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
  const representatives = [...representativeByDedupKey.entries()].slice(
    0,
    MAX_NEW_SUMMARIES_PER_RUN,
  );

  const newSummaries: Record<string, SummaryEntry> = {};
  let summarizeError: string | undefined;
  const chunks: [string, Article][][] = [];
  for (let i = 0; i < representatives.length; i += SUMMARIZE_CHUNK_SIZE) {
    chunks.push(representatives.slice(i, i + SUMMARIZE_CHUNK_SIZE));
  }
  await Promise.all(
    chunks.map(async (chunk) => {
      const outcome = await summarizeArticles(chunk.map(([, article]) => article));
      if (outcome.error) summarizeError = outcome.error;
      outcome.articles.forEach((resultArticle, i) => {
        if (resultArticle.titleJa && resultArticle.summaryJa) {
          const [dedupKey] = chunk[i];
          newSummaries[dedupKey] = {
            titleJa: resultArticle.titleJa,
            summaryJa: resultArticle.summaryJa,
            tag: resultArticle.tag,
          };
        }
      });
    }),
  );
  if (Object.keys(newSummaries).length > 0) {
    await saveSummaries(newSummaries);
  }

  const allSummaries = { ...cachedSummaries, ...newSummaries };

  return Promise.all(
    countryStates.map(async (state): Promise<RefreshResult> => {
      if (state.status === "invalid") {
        return { code: state.code, ok: false, count: 0, error: `未対応の国コードです: ${state.code}` };
      }
      if (state.status === "error") {
        return { code: state.code, ok: false, count: 0, error: state.error };
      }
      if (state.status === "fresh") {
        return { code: state.code, ok: true, count: state.articles.length };
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

      const hasUnsummarized = articles.some((a) => !a.titleJa || !a.summaryJa);
      return {
        code: state.code,
        ok: true,
        count: articles.length,
        warning: hasUnsummarized
          ? `AI要約に失敗しました: ${summarizeError ?? "不明なエラー"}`
          : undefined,
      };
    }),
  );
}
