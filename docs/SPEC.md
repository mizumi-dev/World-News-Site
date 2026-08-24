# 技術仕様書 — 全世界ニュースまとめサイト（プロトタイプ）

要件は `docs/REQUIREMENTS.md`、実装順序は `docs/IMPLEMENTATION_PLAN.md` を参照。

## 1. 技術スタック

| 領域 | 採用 | 理由 |
|------|------|------|
| フレームワーク | Next.js 15+（App Router, TypeScript） | フロント＋APIルートを単一アプリで完結、Vercel等へそのままデプロイ可 |
| スタイリング | Tailwind CSS | 新聞風/まとめ風の2テーマをユーティリティで素早く作れる |
| ニュース取得 | NewsData.io（第一候補） / World News API（代替） | どちらも無料枠あり。アダプタ層で差し替え可能にする |
| AI要約 | Qwen API（Alibaba Cloud、OpenAI互換エンドポイント、REST fetch呼び出し） | 要約・翻訳・文脈補足。コスト最優先で採用 |
| キャッシュ | ファイルベース（`.cache/` にJSON保存） | DB不要でローカル完結。将来 Redis/DB に差し替えられるようインターフェースを切る |
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
│   │   ├── cache.ts               # ファイルキャッシュ（get/set, 記事ID単位の要約キャッシュ含む）
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
  for code of codes（直列。無料枠のレート制限に配慮）:
    articles = provider.fetchTopHeadlines(code, MAX_ARTICLES_PER_COUNTRY)
    未要約の記事のみ summarize.ts でバッチ要約
    cache.set(code, { articles, fetchedAt })
  return 国ごとの成否 { code, ok, error?, count }
```

- 国単位で失敗を捕捉し、他国の処理は継続する。

### 4.4 キャッシュ（`src/lib/cache.ts`）

- `.cache/news-{code}.json` に国別の記事リスト+取得時刻、`.cache/summaries.json` に記事ID→要約のマップを保存。
- `GET /api/news` はキャッシュのみ読む（外部APIを叩かない）。
- `POST /api/refresh` はキャッシュ取得時刻が `CACHE_TTL_MINUTES`（デフォルト15分）以内の国をスキップする（`?force=true` で無視）。

### 4.5 APIルート

| ルート | メソッド | 入出力 |
|--------|---------|--------|
| `/api/news?countries=jp,us` | GET | `{ countries: { [code]: { articles: Article[], fetchedAt: string \| null } } }` |
| `/api/refresh` | POST | body `{ countries: string[], force?: boolean }` → `{ results: { code, ok, count, error? }[] }`。将来のcronはこのエンドポイントをそのまま叩く |

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
- **cron化**: `POST /api/refresh` を Vercel Cron / GitHub Actions / 任意のスケジューラから叩く。認証が必要になったら `REFRESH_SECRET` env + Bearer 検証を同ルートに足す。
- **キャッシュ差し替え**: `cache.ts` の get/set インターフェースを保ったまま Redis/SQLite 実装に置換。
