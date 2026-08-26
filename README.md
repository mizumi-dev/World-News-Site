# World News Site — 自分だけの全世界ニュースまとめサイト

見たい国を選ぶと、各国の主要メディアの新着ニュースが **AIによる日本語要約付き** で一覧できる個人用ニュースアグリゲータのプロトタイプ。

## ドキュメント

| ファイル | 内容 |
|---------|------|
| [AGENTS.md](AGENTS.md) | AIコーディングエージェント向けの前提知識（全体の流れ、設計上の制約、やってはいけないこと） |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 要件定義（MVPスコープ、受け入れ条件、非対象） |
| [docs/SPEC.md](docs/SPEC.md) | 技術仕様（スタック、ディレクトリ構成、API/データ設計、UI仕様） |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | 実装手順書（フェーズ分割とフェーズごとの完了条件） |
| [.env.example](.env.example) | 必要な環境変数の一覧 |

## 概要

- **対応国**: 9地域33カ国（`src/lib/config/countries.ts`）。地域別にグルーピングして選択できる
- **ニュース取得**: Google News RSS（総合＋トピック別フィードを統合。無料・APIキー不要）。`NewsData.io`/`World News API`にも切替可能
- **AI要約**: Qwen API（Alibaba Cloud、`qwen3.7-flash`、コスト最優先）で見出し・1〜2文要約・タグ付け。日本語と英語を1回のリクエストで同時生成し、画面上のトグルで表示言語を切り替えられる
- **タグ**: 12種の固定タグに色付き表示。Google Newsのトピック別フィード由来の記事はタグが確定し、AIの推測を使わない
- **検索**: 見出し・要約の全文検索。表示中の言語に関わらず、日本語・英語・原題のすべてを対象に検索する
- **設定の保持**: 選択中の国・レイアウト・タグ絞り込み・表示言語をブラウザのlocalStorageに保存し、次回アクセス時に復元する（ログイン機能は持たない）
- **レイアウト**: 新聞風／2chまとめ風をトグルで切替。新聞風は選択国数に応じて紙面割りが自動決定
- **技術**: Next.js (App Router, TypeScript) + Tailwind CSS
- **更新方式**: 収集と配信を分離。裏側でGitHub Actions（高頻度・シャード分割）とVercel Cron（1日1回の補修）が自動更新し、閲覧はISRキャッシュを読むだけ。手動更新ボタンは無い（`/api/refresh`は認証必須で、公開後の無制限なAI課金消費を防ぐため）
- **キャッシュ**: ローカル開発はファイル(`.cache/`)、Vercel等へのデプロイ時はUpstash Redis(永続化)を自動使用。要約は`dedupKey`単位で7日保持し、同じ記事の再要約を避ける
- **自己修復**: ニュース取得が失敗または記事数が少なすぎる場合は別プロバイダに自動フォールバックする。AI要約は件数ではなく時間予算で打ち切るため、要約しきれなかった記事は次回以降の実行で自動的に埋まる

## APIキーの取得方法

| サービス | 用途 | 取得先 | 備考 |
|---------|------|--------|------|
| NewsData.io | ニュース取得 | https://newsdata.io/register | 無料枠あり |
| Qwen (Alibaba Cloud) | AI要約 | https://home.qwencloud.com/api-keys | Pay-As-You-Go利用には支払い方法の登録が必要な場合がある |
| World News API（任意） | ニュース取得の代替 | https://worldnewsapi.com | `NEWS_PROVIDER=worldnewsapi` の場合のみ必要 |
| Upstash Redis（デプロイ時のみ） | 永続キャッシュ | https://upstash.com （またはVercel Marketplace経由） | ローカル開発では不要 |

## ローカルでの起動手順

```bash
git clone https://github.com/mizumi-dev/World-News-Site.git
cd World-News-Site
cp .env.example .env
# .env をエディタで開き、NEWSDATA_API_KEY と QWEN_API_KEY を入力する
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開く。ローカルでは手動更新ボタンが無いため、記事を取得するには
`/api/refresh` を直接叩く（`CRON_SECRET`未設定のローカルでは認証チェックがスキップされない点に注意し、
`.env`に適当な値を入れて同じ値をヘッダーに渡す）:

```bash
curl -X POST http://localhost:3000/api/refresh \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"countries":["jp","us","gb"]}'
```

## Vercelへのデプロイ

1. **Upstash Redisを用意する**（サーバーレス環境ではファイルキャッシュが使えないため必須）
   - Vercelダッシュボード → プロジェクト → Storage/Marketplace → 「Upstash for Redis」を追加すると、`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` が自動でプロジェクトの環境変数に設定される
   - または https://upstash.com で無料データベースを作成し、REST URL/TOKENを手動でコピーする
2. **Vercelにこのリポジトリを接続する**
   - Vercelダッシュボード → 「Add New...」→「Project」→ このGitHubリポジトリを選択してインポート
   - `main` ブランチへのpushで自動デプロイされる
3. **環境変数を設定する**（Vercelプロジェクト → Settings → Environment Variables）
   - `.env.example` に書かれている変数をすべて登録する
   - `CRON_SECRET` は必ずランダムな値を生成して設定する（`openssl rand -hex 32`）。未設定だと自動更新エンドポイントが常にUnauthorizedになる
   - Upstashを手動作成した場合は `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` も追加する
4. デプロイ完了後、発行されたURLにアクセスして動作確認する（この時点ではまだ記事が無いので、後述のGitHub Actionsを設定するか、`/api/cron/refresh-shard`を手動で1回叩く）

## 自動更新の設定（GitHub Actions）

Vercel Hobbyプランのcronは1日1回しか実行できないため、高頻度の自動更新は
GitHub Actions（`.github/workflows/scheduled-refresh.yml`）が担当する。15分毎に
`/api/cron/refresh-shard` を叩き、呼び出し時刻から自動計算される「担当国(シャード)」だけを
更新する。11シャード×15分間隔で、全33カ国を約2時間45分で一巡する。

シャード数や間隔を変える場合は、`src/app/api/cron/refresh-shard/route.ts` の
`SHARD_INTERVAL_MINUTES` / `NUM_SHARDS` と、ワークフローのcron式を**必ず対で**変更すること。

設定手順:

1. リポジトリの Settings → Secrets and variables → Actions で以下を登録する
   - `APP_URL`: デプロイ先のURL（例: `https://your-app.vercel.app`）
   - `CRON_SECRET`: Vercel側に設定した`CRON_SECRET`と同じ値
2. これだけで自動的に有効になる（`workflow_dispatch`で手動実行も可能）

Vercel Cron（`vercel.json`）による1日1回の全国更新は、GitHub Actions側の取りこぼしに対する
補修として引き続き動作する。

## CI（GitHub Actions）

`.github/workflows/ci.yml` で、`main` へのpush・PR作成のたびに `npm run lint` と `npm run build` が自動実行される。デプロイ自体はVercelのGit連携が担当するため、このワークフローはコード品質チェック専用。

## 今後の拡張ポイント

- **国を増やす**: `src/lib/config/countries.ts` に1行追加するだけでよい（`region`は選択UIのグルーピングに、`langHint`はGoogle News RSS/NewsData.ioの言語指定に使う）
- **タグを増やす**: `src/lib/config/tags.ts` に追加する。Google Newsのトピック別フィードに対応させる場合は `src/lib/news/googlenews.ts` の `TOPIC_TO_TAG` も更新する
- **要約モデルの変更**: `.env` の `QWEN_MODEL` を変更する（利用可能なモデル名はQwenCloudのコンソールで確認）
- **ニュース取得元の切り替え**: `.env` の `NEWS_PROVIDER` を `newsdata` / `worldnewsapi` に変更する（無料枠に制約があるため、`googlenews`のフォールバック用途を想定）
- **キャッシュの差し替え**: `src/lib/cache/` の `KeyValueBackend` インターフェースを実装すれば、Upstash以外のストアにも対応できる
- **更新頻度・シャード数の調整**: `src/app/api/cron/refresh-shard/route.ts` の `SHARD_INTERVAL_MINUTES` / `NUM_SHARDS` と、ワークフローのcron式を合わせて変更する
