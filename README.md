# World News Site — 自分だけの全世界ニュースまとめサイト

見たい国を選ぶと、各国の主要メディアの新着ニュースが **AIによる日本語要約付き** で一覧できる個人用ニュースアグリゲータのプロトタイプ。

現在は **要件定義・仕様策定フェーズ** です。実装は以下のドキュメントに沿って進めます。

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
- **AI要約**: Google Gemini API（`gemini-2.5-flash-lite`、コスト最優先）で日本語1〜2文の要約+文脈補足
- **レイアウト**: 新聞風／2chまとめ風をトグルで切替。新聞風は選択国数に応じて紙面割りが自動決定
- **技術**: Next.js (App Router, TypeScript) + Tailwind CSS、更新は手動リフレッシュ（将来cron化可能な構造）

セットアップ手順・APIキー取得方法は実装完了時（実装手順書フェーズ4）にこのREADMEへ記載されます。
