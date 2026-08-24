import { createHash } from "crypto";

/**
 * 見出しを比較・キャッシュキー生成用に正規化する（表示には使わない）。
 * 全角/半角統一、記号除去、末尾の「 - 媒体名」的なサフィックス除去を行う。
 */
/** 媒体名サフィックスを剥がした結果がこれより短くなるなら、見出し本体を削っているとみなして剥がさない */
const MIN_LENGTH_AFTER_STRIP = 10;

export function normalizeTitle(title: string): string {
  const base = title.normalize("NFKC").toLowerCase();

  // 末尾の「 - 媒体名」「 | 媒体名」を落とす。
  // 区切り文字の前に空白を必須にしているのは、"Trump-Putin" や "Japan-US" のような
  // 複合語を媒体名と誤認して切り落とし、見出しが一語に潰れるのを防ぐため
  // （潰れると無関係な見出し同士が一致してしまう）。
  const stripped = base.replace(/\s+[-|–—]\s*[^-|–—]{1,40}$/, "");
  const kept = stripped.trim().length >= MIN_LENGTH_AFTER_STRIP ? stripped : base;

  return kept
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleHash(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function wordSet(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}

/** タイトル（正規化済み）の類似度をJaccard係数（0〜1）で返す */
export function titleSimilarity(a: string, b: string): number {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 誤って別ニュースを統合しないよう、閾値はやや高めに設定する。要調整（docs/SPEC.md 8-2参照） */
export const SIMILARITY_THRESHOLD = 0.7;

/**
 * 語数がこれ未満の見出しは類似度判定に使わない（完全一致のみで判定する）。
 * 2〜3語しかない見出しは1語一致しただけで閾値を超えてしまい、別ニュースを誤って統合するため。
 * 日本語の見出しは空白で分かち書きされないため実質ここに該当し、完全一致のみで判定される
 * （言語をまたぐ・語順が異なる重複の検出は docs/SPEC.md 8-2 の段階③以降で対応する）。
 */
const MIN_WORDS_FOR_SIMILARITY = 4;

function isSimilar(a: string, b: string): boolean {
  if (wordSet(a).size < MIN_WORDS_FOR_SIMILARITY || wordSet(b).size < MIN_WORDS_FOR_SIMILARITY) {
    return false;
  }
  return titleSimilarity(a, b) >= SIMILARITY_THRESHOLD;
}

/**
 * 実質同じ記事（通信社の配信記事など）に同じ dedupKey を割り当てる。
 * 正規化タイトルの完全一致、またはJaccard類似度が閾値以上のものを同一クラスタとみなす。
 * 各項目は最初に見つかった一致クラスタに所属し、代表タイトルのハッシュを dedupKey として共有する。
 */
export function assignDedupKeys<T extends { key: string; title: string }>(
  items: T[],
): Map<string, string> {
  const clusters: { normalizedTitle: string; dedupKey: string }[] = [];
  const result = new Map<string, string>();

  for (const item of items) {
    const normalized = normalizeTitle(item.title);
    // 正規化した結果が空（記号のみの見出し等）の場合はクラスタリングせず単独扱いにする
    const match =
      normalized === ""
        ? undefined
        : clusters.find(
            (c) => c.normalizedTitle === normalized || isSimilar(c.normalizedTitle, normalized),
          );
    if (match) {
      result.set(item.key, match.dedupKey);
    } else {
      const dedupKey = titleHash(normalized || item.key);
      clusters.push({ normalizedTitle: normalized, dedupKey });
      result.set(item.key, dedupKey);
    }
  }

  return result;
}
