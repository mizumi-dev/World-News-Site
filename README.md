# World News Site — 自分だけの全世界ニュースまとめサイト

見たい国を選ぶと、各国の主要メディアの新着ニュースが **AIによる日本語要約付き** で一覧できる個人用ニュースアグリゲータのプロトタイプ。

## ドキュメント

| ファイル | 内容 |
|---------|------|
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 要件定義（MVPスコープ、受け入れ条件、非対象） |
| [docs/SPEC.md](docs/SPEC.md) | 技術仕様（スタック、ディレクトリ構成、API/データ設計、UI仕様） |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | 実装手順書（フェーズ分割とフェーズごとの完了条件） |
| [.env.example](.env.example) | 必要な環境変数の一覧 |

## 概要

- **対応国 (MVP)**: 日本・アメリカ・イギリス・ドイツ・インド・ブラジル・ケニア・韓国の8カ国
- **ニュース取得**: NewsData.io（または World News API）
- **AI要約**: Qwen API（Alibaba Cloud、`qwen3.7-flash`、コスト最優先）で日本語1〜2文の要約+文脈補足
- **レイアウト**: 新聞風／2chまとめ風をトグルで切替。新聞風は選択国数に応じて紙面割りが自動決定
- **技術**: Next.js (App Router, TypeScript) + Tailwind CSS、更新は手動リフレッシュ（将来cron化可能な構造）
- **キャッシュ**: ローカル開発はファイル(`.cache/`)、Vercel等へのデプロイ時はUpstash Redis(永続化)を自動使用

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

ブラウザで http://localhost:3000 を開き、国を選んで「更新」ボタンを押す。

## Vercelへのデプロイ

1. **Upstash Redisを用意する**（サーバーレス環境ではファイルキャッシュが使えないため必須）
   - Vercelダッシュボード → プロジェクト → Storage/Marketplace → 「Upstash for Redis」を追加すると、`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` が自動でプロジェクトの環境変数に設定される
   - または https://upstash.com で無料データベースを作成し、REST URL/TOKENを手動でコピーする
2. **Vercelにこのリポジトリを接続する**
   - Vercelダッシュボード → 「Add New...」→「Project」→ このGitHubリポジトリを選択してインポート
   - `main` ブランチへのpushで自動デプロイされる
3. **環境変数を設定する**（Vercelプロジェクト → Settings → Environment Variables）
   - `.env.example` に書かれている変数（`NEWSDATA_API_KEY` / `QWEN_API_KEY` など）をすべて登録する
   - Upstashを手動作成した場合は `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` も追加する
4. デプロイ完了後、発行されたURLにアクセスして動作確認する

## CI（GitHub Actions）

`.github/workflows/ci.yml` で、`main` へのpush・PR作成のたびに `npm run lint` と `npm run build` が自動実行される。デプロイ自体はVercelのGit連携が担当するため、このワークフローはコード品質チェック専用。

## 今後の拡張ポイント

- **国を増やす**: `src/lib/config/countries.ts` に1行追加するだけでよい（`langHint` にはNewsData.ioの[言語コード](https://newsdata.io/documentation)を ISO 639-1 で指定する）
- **cron化**: `POST /api/refresh` を Vercel Cron（`vercel.json` に `crons` を追加）やGitHub Actionsのスケジュール実行から叩けば、手動更新なしで自動更新できる
- **要約モデルの変更**: `.env` の `QWEN_MODEL` を変更する（利用可能なモデル名はQwenCloudのコンソールで確認）
- **ニュース取得元の切り替え**: `.env` の `NEWS_PROVIDER` を `worldnewsapi` に変更する
- **キャッシュの差し替え**: `src/lib/cache/` の `KeyValueBackend` インターフェースを実装すれば、Upstash以外のストアにも対応できる
