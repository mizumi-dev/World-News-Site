# World News Site

見たい国を選ぶと、各国の新着ニュースが **AIによる日本語/英語の要約付き** で読める個人用ニュースアグリゲータ。
Next.js (App Router) + TypeScript + Tailwind CSS。Vercelにデプロイして運用している。

作者は非エンジニアで、コストと運用の手間を強く嫌う。**サービスやインフラを増やす提案は歓迎されない**
（過去にPostgresの追加を検討して却下した経緯がある）。まず既存の仕組みの中で解決できないかを考えること。
コメントとドキュメントは日本語で書く。

## ブランチ運用（誰が書いたか分かるようにする）

複数のAIコーディングエージェントで並行して開発する。**「どの変更がどのエージェント由来か」を
ブランチ名だけで判別できるようにする**ため、作業を始める前に必ず担当エージェント名を
プレフィックスにしたブランチを切ること。`main`に直接コミットしない。

- Claude Codeが作業する場合 → `claude/機能名`
- OpenCode + DeepSeekが作業する場合 → `deepseek/機能名`

```bash
git checkout -b deepseek/機能名
```

こうすることで、気に入らない変更が入ったPRはマージしない、あるいはマージ後でも
`git revert <マージコミット>`で個別に打ち消せる。過去の状態に丸ごと戻したい場合は、
`main`の任意のコミットハッシュに`git reset --hard <ハッシュ>`すればよい
（未保存の変更を消す破壊的操作なので、実行前に`git status`で確認すること）。

## 全体の流れ

収集と配信を分離しているのが、このプロジェクトで最も重要な設計判断。

```
GitHub Actions (15分毎)
  └→ POST /api/cron/refresh-shard   ← 時刻から担当国を自動計算する。状態を持たない
       └→ pipeline.ts
            ├→ ニュース取得   (Google News RSS。失敗/記事不足ならNewsData.ioに自動フォールバック)
            ├→ 重複排除      (dedup.ts。dedupKey単位。任意で埋め込みベクトルも使える)
            ├→ AI要約        (summarize.ts。Qwen経由でja/enを1回のリクエストで同時生成)
            └→ キャッシュ保存 (Upstash Redis。ローカルは .cache/ に自動フォールバック)

閲覧者 → / (page.tsx) → キャッシュを読むだけ。AI呼び出しは発生しない
```

閲覧時にAIを呼ばないので、アクセスが増えても課金は増えない。**この性質を壊す変更をしないこと。**

## ディレクトリ

| パス | 役割 |
|------|------|
| `src/lib/pipeline.ts` | 中心。取得→重複排除→要約→保存を束ねる。時間予算の制御もここ |
| `src/lib/summarize.ts` | Qwen (OpenAI互換API) を呼ぶ。プロンプトとJSONパースとリトライ |
| `src/lib/news/` | ニュース取得元ごとの実装。`index.ts`がプロバイダを選ぶ |
| `src/lib/cache/` | `KeyValueBackend`インターフェースとUpstash/ファイルの実装 |
| `src/lib/config/countries.ts` | 対応国の定義。国を増やすのはここに1行足すだけ |
| `src/lib/config/tags.ts` | 12種の固定タグ |
| `src/app/api/cron/refresh-shard/` | GitHub Actionsが叩く高頻度更新（シャード分割） |
| `src/app/api/refresh/` | 手動更新。認証必須 |
| `src/components/` | UI。`NewspaperLayout`(新聞風)と`MatomeLayout`(2chまとめ風)の2種 |

## 触る前に知っておくべき制約

**Vercelの実行時間上限(60秒)** — 要約は件数ではなく**時間予算**で打ち切る設計
(`SUMMARIZE_TIME_BUDGET_MS`、既定25秒)。打ち切られた分は次回の実行で処理される。
過去にja/en同時生成を入れた際、この余裕が足りず`FUNCTION_INVOCATION_TIMEOUT`を起こした。
1リクエストあたりの応答が重くなる変更をするときは、`SUMMARIZE_CHUNK_SIZE`(6)と
`REQUEST_TIMEOUT_MS`(20秒)も合わせて見直すこと。

**Upstash Redisの無料枠(256MB)** — 要約は`dedupKey`単位で**7日間**キャッシュする。
以前は1年保持だったが、記事量を150件/国に増やしja/en両方を保存するようになって容量が厳しくなり、
7日に短縮した。TTLを伸ばす提案をするなら容量の試算を添えること。

**要約は必ずしも全記事に付かない** — 時間予算で打ち切られた記事は要約なしで返る。
UIは要約が`null`でも壊れないようにすること（原題を出すなどのフォールバックが`news/display.ts`にある）。

**シャードは時刻から計算される** — `refresh-shard`は`SHARD_INTERVAL_MINUTES`(15)と
`NUM_SHARDS`(11)から担当国を決める。ワークフローのcron式(`*/15`)と必ず対で変更すること。
11シャード×15分で全国を約2時間45分で一巡する。

**更新エンドポイントは全て`CRON_SECRET`で保護されている** — `Authorization: Bearer <値>`の
完全一致。公開後に誰でもAI課金を消費できてしまうのを防ぐため。手動更新ボタンをUIに付けてはいけない。

## 開発

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # push前に必ず通す
npm run build    # push前に必ず通す (CIがmainへのpush/PRで同じものを実行する)
```

`.env`は`.env.example`をコピーして作る。ローカルでは`UPSTASH_*`は不要（`.cache/`が使われる）。
ローカルで記事を取得するには`/api/refresh`を叩く（`.env`の`CRON_SECRET`と同じ値をヘッダに渡す）。

## 進行中の実験

`experiment/entertainment-and-country-score`ブランチで2つの機能を試している。
気に入らなければブランチごと捨てられるよう、あえて`main`に入れていない。

- `SUMMARY_STYLE` — 要約の文体を切り替える。キャッシュキーが`summary:{style}:{dedupKey}`に
  なるので、文体ごとにデータが分離され、混ざらない
- `countryScore` — 「その国固有のニュースらしさ」をAIが0〜100で採点し、
  `COUNTRY_SPECIFICITY_THRESHOLD`未満を表示から除外できる

詳細は`docs/ARCHITECTURE_REVIEW.md`の追記を参照。

## ドキュメント

| ファイル | 内容 |
|---------|------|
| `README.md` | セットアップとデプロイ手順 |
| `docs/REQUIREMENTS.md` | 要件定義 |
| `docs/SPEC.md` | 技術仕様（データ設計、UI仕様） |
| `docs/ARCHITECTURE_REVIEW.md` | 設計レビューと、その後の変更の追記 |
| `docs/IMPLEMENTATION_PLAN.md` | 初期の実装手順書（歴史的資料） |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
