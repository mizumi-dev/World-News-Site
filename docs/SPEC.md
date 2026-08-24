# 技術仕様書 — 全世界ニュースまとめサイト（プロトタイプ）

要件は `docs/REQUIREMENTS.md`、実装順序は `docs/IMPLEMENTATION_PLAN.md` を参照。

## 1. 技術スタック

| 領域 | 採用 | 理由 |
|------|------|------|
| フレームワーク | Next.js 15+（App Router, TypeScript） | フロント＋APIルートを単一アプリで完結、Vercel等へそのままデプロイ可 |
| スタイリング | Tailwind CSS | 新聞風/まとめ風の2テーマをユーティリティで素早く作れる |
| ニュース取得 | NewsData.io（第一候補） / World News API（代替） | どちらも無料枠あり。アダプタ層で差し替え可能にする |
| AI要約 | Qwen API（Alibaba Cloud、OpenAI互換エンドポイント、REST fetch呼び出し） | 要約・翻訳・文脈補足。コスト最優先で採用 |
| キャッシュ | ファイルベース（ローカル）/ Upstash Redis（デプロイ時） | env の有無で自動切替。ローカルはDB不要、本番はサーバーレスの永続化に対応 |
| 状態管理 | React state + localStorage | 認証なしの個人設定はクライアント保存で十分 |

Node.js 20+ を前提とする。追加のUIライブラリ・状態管理ライブラリは入れない（軽量維持）。

## 2. ディレクトリ構成

```
world-news-site/
├── .env.example
├── README.md
├── docs/                      # 本仕様書類
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           # メイン画面（クライアントコンポーネント中心）
│   │   ├── globals.css
│   │   └── api/
│   │       ├── news/route.ts      # GET: キャッシュ済みニュース返却
│   │       └── refresh/route.ts   # POST: 取得→要約→キャッシュ更新（将来のcronもここを叩く）
│   ├── components/
│   │   ├── CountrySelector.tsx    # 国の複数選択UI
│   │   ├── LayoutToggle.tsx       # 新聞風/まとめ風トグル
│   │   ├── RefreshButton.tsx
│   │   ├── ArticleCard.tsx        # 共通カード（見出し/要約/出典/時刻/リンク）
│   │   ├── NewspaperLayout.tsx    # 新聞風レイアウト
│   │   └── MatomeLayout.tsx       # まとめ風レイアウト
│   ├── lib/
│   │   ├── config/countries.ts    # 対応国マスタ（★国を増やす時はここだけ編集）
│   │   ├── news/
│   │   │   ├── types.ts           # NewsProvider インターフェース & 正規化記事型
│   │   │   ├── newsdata.ts        # NewsData.io アダプタ
│   │   │   ├── worldnewsapi.ts    # World News API アダプタ
│   │   │   └── index.ts           # env NEWS_PROVIDER でアダプタ選択
│   │   ├── summarize.ts           # Qwen API ラッパー（要約+見出し翻訳）
│   │   ├── cache/                 # キャッシュ（file/Upstash Redisをenvで自動切替。get/set, 記事ID単位の要約キャッシュ含む）
│   │   └── pipeline.ts            # 取得→要約→キャッシュ の一連処理
│   └── types/index.ts             # 共有型
└── .cache/                        # 実行時生成。gitignore する
```

## 3. データモデル

```ts
// src/lib/news/types.ts
export interface Article {
  id: string;              // URLのsha256先頭16文字などで生成（プロバイダ非依存）
  countryCode: string;     // ISO 3166-1 alpha-2 小文字 "jp" | "us" | ...
  originalTitle: string;   // 原文見出し
  titleJa: string | null;  // AI日本語見出し（要約時に生成）
  summaryJa: string | null;// AI日本語要約 1〜2文（+文脈補足）
  sourceName: string;      // メディア名
  url: string;             // 原文リンク
  publishedAt: string;     // ISO 8601
  imageUrl?: string | null;
}

export interface NewsProvider {
  /** 指定国の新着ヘッドラインを最大 limit 件返す（本文は返さない/破棄する） */
  fetchTopHeadlines(countryCode: string, limit: number): Promise<Article[]>;
}
```

```ts
// src/lib/config/countries.ts
export interface Country {
  code: string;      // "jp"
  nameJa: string;    // "日本"
  flag: string;      // "🇯🇵"
  langHint?: string; // プロバイダに渡す言語ヒント（例 NewsData.io の language パラメータ）
}
export const COUNTRIES: Country[] = [
  { code: "jp", nameJa: "日本", flag: "🇯🇵" },
  { code: "us", nameJa: "アメリカ", flag: "🇺🇸" },
  { code: "gb", nameJa: "イギリス", flag: "🇬🇧" },
  { code: "de", nameJa: "ドイツ", flag: "🇩🇪" },
  { code: "in", nameJa: "インド", flag: "🇮🇳" },
  { code: "br", nameJa: "ブラジル", flag: "🇧🇷" },
  { code: "ke", nameJa: "ケニア", flag: "🇰🇪" },
  { code: "kr", nameJa: "韓国", flag: "🇰🇷" },
];
```

## 4. サーバーサイド設計

### 4.1 ニュースプロバイダ・アダプタ

- `NEWS_PROVIDER` env（`newsdata` | `worldnewsapi`、デフォルト `newsdata`）で実装を選択。
- **NewsData.io**: `GET https://newsdata.io/api/1/latest?apikey=...&country={code}&size={limit}`。レスポンスの `results[]` から `title`, `link`, `source_name`（無ければ `source_id`）, `pubDate`, `image_url` をマップ。`content`/`description` は要約の入力にのみ使い、保存しない。
- **World News API**: `GET https://api.worldnewsapi.com/top-news?source-country={code}&language=...&api-key=...`。同様に正規化。
- どちらも HTTP エラー・レート制限（429）時は例外を投げず `{ articles: [], error: string }` 相当で呼び出し元に伝える（pipeline が国単位で握りつぶして続行できるように）。

### 4.2 AI要約ラッパー（`src/lib/summarize.ts`）

- Qwen（Alibaba Cloud）のOpenAI互換Chat Completions APIを `fetch` で直接呼び出す（追加SDK依存なし。NewsProviderアダプタと同じ設計思想）。エンドポイント: `POST {QWEN_BASE_URL}/chat/completions`（国際版デフォルト: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`。中国本土アカウントは `https://dashscope.aliyuncs.com/compatible-mode/v1`）。認証は `Authorization: Bearer {QWEN_API_KEY}` ヘッダ。
- モデルは env `QWEN_MODEL` で指定。**デフォルト `qwen3.7-flash`**（コスト最優先）。精度を上げたい場合はユーザー判断でコンソールで確認した別モデル名に変更できる旨を README に記載する。
- リクエストには `response_format: { type: "json_object" }` を指定し、JSON出力を安定させる（OpenAI互換仕様上、配列直返しではなく `{"results": [...]}` 形式のオブジェクトで受け取る）。
- **1リクエストで1国分（最大10記事）をまとめてバッチ要約**する（記事ごとに1コールしない。コストとレイテンシ削減）。
- 入力: 記事番号付きの `originalTitle`（+あれば description 冒頭200字）。出力はJSONで受け取る:

```
System prompt（固定文字列、要旨）:
あなたは国際ニュース編集者。各記事について
(1) 自然な日本語見出し titleJa
(2) 1〜2文の日本語要約 summaryJa。可能なら日本の読者向けに背景・重要性を一言補足する
を作成し、JSONオブジェクト {"results":[{"index":0,"titleJa":"...","summaryJa":"..."}]} のみを出力する。
原文の推測できない詳細を創作しない。
```

- 呼び出しは `fetch(`${QWEN_BASE_URL}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${QWEN_API_KEY}` }, body: { model, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: <記事リスト> }], response_format: { type: "json_object" } } })`。レスポンスは `choices[0].message.content` をJSONとしてパースし、`results` 配列を取り出す。パース失敗時は1回だけリトライし、それでも失敗したら該当国の記事は `titleJa/summaryJa = null`（原文見出しで表示）にして続行。
- 要約済み記事は記事 `id` 単位でキャッシュし、再要約しない。

### 4.3 パイプライン（`src/lib/pipeline.ts`）

```
refreshCountries(codes: string[]):
  Promise.all(codes.map(code =>（国ごとに並列実行）:
    articles = provider.fetchTopHeadlines(code, MAX_ARTICLES_PER_COUNTRY)
    未要約の記事のみ summarize.ts でバッチ要約
    cache.set(code, { articles, fetchedAt })
  )）
  return 国ごとの成否 { code, ok, error?, count, warning? }
```

国ごとに直列実行すると、8カ国分のニュース取得+AI要約で合計数十秒〜1分以上かかり、Vercelのサーバーレス関数のデフォルト実行時間(10秒)を超えて失敗する。そのため並列実行とし、`POST /api/refresh` には `export const maxDuration = 60`（秒）を設定して猶予を確保する。

- 国単位で失敗を捕捉し、他国の処理は継続する。

### 4.4 キャッシュ（`src/lib/cache/`）

- `KeyValueBackend`（`get`/`set`のみの最小インターフェース）を介して、国別の記事リスト+取得時刻（キー `news:{code}`）と記事ID→要約のマップ（キー `summaries`）を保存する。
- バックエンドは env `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` の有無で自動選択（`src/lib/cache/index.ts`）:
  - 未設定（ローカル開発）: `.cache/` フォルダにJSONファイルとして保存（`file-backend.ts`）
  - 設定あり（Vercel等へのデプロイ時）: Upstash RedisのREST APIを直接 `fetch` で呼び出す（`upstash-backend.ts`）。サーバーレス環境はファイルシステムが永続しないため必須
- `GET /api/news` はキャッシュのみ読む（外部APIを叩かない）。
- `POST /api/refresh` はキャッシュ取得時刻が `CACHE_TTL_MINUTES`（デフォルト15分）以内、かつ**全記事が要約済み**の場合のみスキップする（`?force=true` で無視）。要約が一部でも欠けているキャッシュは新鮮とみなさず再試行する。

### 4.5 APIルート

| ルート | メソッド | 入出力 |
|--------|---------|--------|
| `/api/news/{code}` | GET | `{ articles: Article[], fetchedAt: string \| null }`。国別のパスルート（クエリパラメータを使わない）にすることで `export const revalidate = 900` によるISRが効き、閲覧のたびにRedisを読みに行かない |
| `/api/refresh` | POST | body `{ countries: string[], force?: boolean }` → `{ results: { code, ok, count, error?, warning? }[] }`。手動更新ボタン用（常に `force: true` で呼ぶ） |
| `/api/cron/refresh` | GET | `Authorization: Bearer {CRON_SECRET}` で認証。全対応国を更新する。`vercel.json` の `crons` から起動 |

## 5. UI仕様

### 5.1 共通

- ヘッダ: サイトタイトル／`CountrySelector`／`LayoutToggle`／`RefreshButton`（更新中はスピナー+ボタン無効化）。
- 国選択・レイアウト選択・新聞風の手動国割当は `localStorage`（キー `wns:settings`）に保存し、初回訪問時のデフォルトは 国=jp,us,gb / レイアウト=新聞風。
- 記事カード共通表示: 日本語見出し（`titleJa`、無ければ原文）・AI要約・メディア名・相対時刻（「3時間前」）・原文リンク（新規タブ、`rel="noopener noreferrer"`）。AI要約には小さく「AI要約」バッジを付ける。

### 5.2 新聞風レイアウト（`NewspaperLayout`）

- 雰囲気: 明朝系フォント（`font-serif`）、罫線、紙面らしい多段組。デスクトップはCSS Grid、モバイルは1カラム。
- **紙面セクションへの国自動割当**: 選択国リスト（選択順）を以下のスロット構成に先頭から割り当てる。

| 選択国数 N | 紙面構成 |
|-----------|---------|
| 1 | 全面1カ国（トップ記事大 + 残り2段組） |
| 2 | 左2/3=1カ国目（トップ）、右1/3=2カ国目 |
| 3 | 上段2/3=1カ国目、上段右1/3=2カ国目、下段全幅=3カ国目 |
| 4 | 上段 2/3+1/3（1・2カ国目）、下段 1/2+1/2（3・4カ国目） |
| 5以上 | 上段 2/3+1/3（1・2カ国目）、下段は残りを等幅カラム（横スクロールではなく折返し） |

- 各セクションのヘッダに「🇯🇵 日本」のような見出しと国切替ドロップダウンを置き、**そのセクションに表示する国を手動で差し替え可能**（R7）。差し替えは localStorage に保存。トップセクションは記事1件を大きく（見出し大+要約全文）、残りを小さく表示する。

### 5.3 まとめ風レイアウト（`MatomeLayout`)

- 雰囲気: 2chまとめサイト風。サンセリフ、国ごとのカラーアクセント付きスレッドタイトル風ヘッダ（例「【速報】アメリカのニュースまとめ」）、記事は `>>1` 風の番号付きリストで見出し（太字リンク）+要約を軽い枠で並べる。
- 国ごとに1セクション、選択順に縦に並べる。

### 5.4 エラー・空状態

- キャッシュが空: 「まだニュースがありません。『更新』を押してください」。
- リフレッシュ失敗: 国ごとに失敗理由をトースト or セクション内バナーで表示（例「NewsData.io のAPIキーが未設定です」）。

## 6. 環境変数（`.env.example`）

```
NEWS_PROVIDER=newsdata            # newsdata | worldnewsapi
NEWSDATA_API_KEY=                 # https://newsdata.io で取得
WORLDNEWS_API_KEY=                # https://worldnewsapi.com で取得（worldnewsapi 使用時のみ）
QWEN_API_KEY=                     # Alibaba Cloud (Qwen) で取得
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-flash           # 要約に使うモデル。コスト最優先
MAX_ARTICLES_PER_COUNTRY=10
CACHE_TTL_MINUTES=15
```

## 7. 将来拡張の設計上の考慮（実装はしない）

- **国の追加**: `countries.ts` に1行追加するだけで動く。200カ国化はプロバイダの国コード対応表の拡充のみ。
- **cron化**: 対応済み。`GET /api/cron/refresh`（`vercel.json` の `crons` から起動、全対応国を更新）を `CRON_SECRET` で認証する。Vercelはcron実行時に `Authorization: Bearer {CRON_SECRET}` を自動送信するため、その値と一致するリクエストのみ許可する。Hobbyプランはcronの実行頻度が1日1回までのため、より高頻度にしたい場合はProプランへの変更が必要。
- **キャッシュ差し替え**: 対応済み（`src/lib/cache/`）。別のストアに変えたい場合は `KeyValueBackend` インターフェースを実装するファイルを追加し、`cache/index.ts` の `getBackend()` に分岐を足すだけでよい。

## 8. コスト設計と重複記事の扱い（検討中／未実装）

運用して判明した2つの課題への対応方針。8-1は結論が出ているため実装済み、8-2は方式を決めてから実装する。

### 8-1. 「毎回要約し直す」vs「要約を保存する」のコスト比較

**結論: 保存が圧倒的に安い。1記事あたり約300倍の差がある。** 迷う必要はなく、保存する。

前提（2026年8月時点の公開料金、32Kトークン未満のリクエスト）:

| 項目 | 単価 |
|------|------|
| Qwen3.7-Flash 入力 | $0.03 / 100万トークン |
| Qwen3.7-Flash 出力 | $0.13 / 100万トークン |
| Upstash Redis ストレージ | $0.25 / GB・月（1GBまで無料、無料枠は256MB） |
| Upstash Redis コマンド | $0.20 / 10万コマンド（無料枠は月50万コマンド） |

1記事あたりの試算:

- **再要約する場合**: 入力 約150トークン（システムプロンプトを10件でバッチ分割 + 見出し + 概要200字）、出力 約250トークン（日本語の見出し+要約）
  → `150 × $0.03/1M + 250 × $0.13/1M` ≈ **$0.000037**
- **保存する場合**: 日本語の見出し+要約 約140文字 = UTF-8で約420バイト、JSONのキー等を含めて約500バイト
  → `500バイト × $0.25/GB・月` ≈ **$0.000000125 / 月**

つまり **保存料は再要約の約1/300**。1記事を1回再要約するコストで、同じ記事を約300か月保存できる。

**ただし「保存の仕方」を誤ると逆転しうる。** 実際、当初の実装は全要約を1つのキーに巨大なJSONとして持ち、更新のたびに全件を読み書きしていた。この方式には2つの問題があった:

1. **並列更新で要約が消える**: 国ごとの更新を並列化した結果、各国が同時に「全体を読む→自分の分を足す→全体を書き戻す」を行い、最後に書いた国以外の要約が失われていた。次回の更新でそれらを再要約するため、保存しているのにトークンコストが繰り返し発生していた。
2. **転送量が履歴全体に比例する**: 要約が1万件（約5MB）貯まると、8カ国の更新1回で読み書き合計80MBに達し、無料枠の帯域（月10GB）を約125回の更新で使い切る。

対応（実装済み）:

- 要約は **1件=1キー**（`summary:{id}`）で保存し、書き込みを衝突させない
- 読み出しはその更新で必要なIDだけを **MGET** でまとめて取得する（転送量が履歴全体ではなくバッチサイズに比例する）
- 各キーに **TTL 30日** を設定し、ストレージが無制限に増えないようにする

これにより、更新1回あたりのコマンド数は「1 MGET + 要約した件数分のSET」程度に収まり、無料枠（月50万コマンド）で十分運用できる。

### 8-2. 異なるニュースサイトの実質同じ記事を重複して要約している問題

**現状の課題**: 記事の同一性を `sha256(URL)` で判定しているため、URLが違えば別記事として扱われる。通信社（Reuters等）の配信記事は複数の媒体が同じ内容を掲載するため、実質同じ記事を何度も翻訳・要約しており、トークンコストの無駄と、紙面に同じニュースが並ぶ読みにくさの両方を招いている。

**方針**: 記事を「クラスタ（同一ニュースのまとまり）」として扱う。判定方法は段階的に導入する。

| 段階 | 判定方法 | 追加コスト | 捕捉できる重複 |
|------|---------|-----------|--------------|
| ① | 正規化タイトルの完全一致 | なし（純粋な文字列処理） | 配信記事の転載（見出しがそのまま） |
| ② | タイトルの語の重なり（Jaccard係数など、閾値0.7程度） | なし（純粋な計算） | 見出しを少し変えた転載 |
| ③ | 埋め込みベクトルのコサイン類似度 | 埋め込みAPIの呼び出し + ベクトル保存 | 表現が大きく異なる同一ニュース |
| ④ | LLMにグルーピングさせる | 要約と同等以上のトークン | ほぼ全て |

MVPでは **①+② を採用**し、**③（埋め込みベクトル）はオプトイン機能として実装済み**（`ENABLE_EMBEDDING_DEDUP=true`、デフォルトはオフ）。①②は追加コストがゼロで、通信社の配信記事という最も多いケースを捕捉できる。③は言い回しが大きく異なる同一ニュースまで拾える一方、Qwenの埋め込みAPI（`text-embedding-v4`）の呼び出しが追加で発生するため、まず①②だけで運用し、効果を見てから有効化することを推奨する。④は未実装。

正規化の内容（①）:

- 小文字化、全角→半角の統一、記号・連続空白の除去
- 末尾の媒体名サフィックスを除去（例: `... - BigGo ファイナンス`、`... | ntt docomo`）
- 正規化した文字列のハッシュを `dedupKey` とする

**設計上の要点: `dedupKey` を要約キャッシュのキーに使う。** 現在は `summary:{URLのハッシュ}` で保存しているが、これを `summary:{dedupKey}` に変えると、**同じニュースは媒体や国をまたいでも1回しか要約されない**。表示上のふるまいを変えずにトークンコストだけを削減できるため、まずここから着手する。

**表示上の扱い（実装済み）**: 同じ国内で実質同じ記事が複数媒体から取れた場合、クラスタの代表1件（発行時刻が最も早い＝一次情報に近いもの）だけをカードとして表示し、他は表示しない。「他N媒体も報道」のような注記は付けない（MVPではシンプルさを優先）。

**国をまたぐ重複の扱い**: 同じReuters配信が日本欄と米国欄の両方に出るのは、その国のメディアが報じた事実として妥当なので、**表示のクラスタ化は国ごとに行う**。一方、**要約キャッシュは国をまたいで共有する**（上記の通り `dedupKey` で引くため自動的にそうなる）。

**段階③の実装（`src/lib/embeddings.ts` + `dedup.ts` の `mergeClustersByEmbedding`）**: 段階①②でクラスタ化した後、各クラスタの代表タイトルの埋め込みを取得し、コサイン類似度が閾値（デフォルト0.88、`EMBEDDING_SIMILARITY_THRESHOLD`）以上のクラスタ同士をUnion-Findでさらに統合する。埋め込み取得はクラスタ数ぶん（総記事数ではない）で済むため、①②で大半が既に統合された後は追加コストは小さい。埋め込みAPIが失敗しても①②の結果のみで処理を継続する（重複判定の追加精度であり必須機能ではないため）。日本語・英語など言語をまたいだ同一ニュースも、埋め込みモデルが多言語対応であれば検出できる可能性がある（未検証）。

**未確定事項**:

- ②のJaccard類似度の閾値（0.7）、③のコサイン類似度の閾値（0.88）が適切か。実データで運用して調整する
- ④（LLMによるグルーピング）は未実装。③で精度が足りない場合に検討する
