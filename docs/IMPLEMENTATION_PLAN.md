# 実装手順書 — タスク分割と受け入れ条件

実装担当AIへの指示書。各フェーズを順に実施し、**フェーズ2完了時点で一度動作確認を依頼者に求める**こと（依頼者の指定した進め方）。要件は `docs/REQUIREMENTS.md`、設計は `docs/SPEC.md` に従う。設計と矛盾する実装上の都合が生じた場合は、勝手に仕様を変えず選択肢を提示する。

## フェーズ1: プロジェクト基盤

1. `create-next-app`（TypeScript, App Router, Tailwind, ESLint, `src/` ディレクトリ）でリポジトリ直下に初期化する。
2. SPEC 2 のディレクトリ骨格、SPEC 6 の `.env.example`、`.gitignore` への `.cache/` と `.env*` 追加。
3. `src/lib/config/countries.ts` と `src/types` / `src/lib/news/types.ts` の型定義。

**完了条件**: `npm run dev` で雛形ページが表示され、`npm run build` と `npm run lint` が通る。

## フェーズ2: 1カ国分のパイプライン（縦に貫通させる）

対象は日本(jp)のみ。ここが最重要フェーズ。

1. NewsData.io アダプタ（SPEC 4.1）。
2. Qwen 要約ラッパー（SPEC 4.2）。バッチ1コールでJSONを受け取り、パース失敗時のリトライとフォールバックを実装。
3. ファイルキャッシュ（SPEC 4.4）とパイプライン（SPEC 4.3）。
4. `/api/refresh` と `/api/news`（SPEC 4.5）。
5. 最小UI: 国固定(jp)・更新ボタン・素朴なカードリスト表示のみ。レイアウト2種はまだ作らない。

**完了条件**: `.env` に実キーを入れた状態で、更新ボタン→日本のニュースが日本語見出し+AI要約付きで最大10件表示される。キーが無い場合は画面にエラーメッセージが出る。2回目の更新（15分以内）はキャッシュが使われ外部APIを叩かない。

**→ ここで依頼者に動作確認を求め、OKが出てからフェーズ3へ。**

## フェーズ3: 全国対応 + UI本実装

1. `CountrySelector`（複数選択、localStorage 保存）。8カ国対応の動作確認。
2. `MatomeLayout`（SPEC 5.3）→ 先に単純な方を作る。
3. `NewspaperLayout`（SPEC 5.2）: 国数別グリッド、セクションヘッダの国差し替えドロップダウン。
4. `LayoutToggle` と共通ヘッダ、エラー/空状態（SPEC 5.4）、レスポンシブ調整（375px確認）。
5. World News API アダプタ（`NEWS_PROVIDER` 切替の動作はキー保有時のみ確認、コードレビューレベルでよい）。

**完了条件**: REQUIREMENTS 3 の受け入れ条件 1〜6 をすべて満たす。

## フェーズ4: ドキュメント

README.md を全面書き換え:

- プロジェクト概要とスクリーンショット（任意）
- APIキー取得手順（NewsData.io / World News API / Alibaba Cloud (Qwen)、それぞれ無料枠の注意）
- ローカル起動手順（`cp .env.example .env` → キー記入 → `npm install` → `npm run dev`）
- 設定項目一覧（env 変数の表）
- 拡張ポイント: 国の増やし方（`countries.ts`）、cron化（`POST /api/refresh` を叩く。Vercel Cron 設定例を記載）、要約モデルの変更（`QWEN_MODEL`。コンソールで利用可能なモデル名を確認）

**完了条件**: REQUIREMENTS 3 の受け入れ条件 7。

## 実装上の禁止事項

- 記事本文の保存・表示（要約入力に使ったら破棄する）
- APIキーのクライアントサイドへの露出（`NEXT_PUBLIC_` プレフィックスのキー禁止）
- 記事1件ごとの Qwen API 個別コール（必ず国単位バッチ）
- 仕様外のライブラリ追加（UIコンポーネント集、状態管理、ORM等）
- モデルIDの創作（`QWEN_MODEL` はコンソールで確認できるモデル名をそのまま使う）
