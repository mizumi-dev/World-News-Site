# アーキテクチャ検討: 実運用のニュースアグリゲーターとの比較

一般的なニュースアグリゲーターがどう作られているかを調査し、本アプリの現状と突き合わせた記録。
調査日: 2026-08-24。出典は末尾。

## 現状の構成

```
ユーザーがページを開く   → GET  /api/news    → キャッシュを読む          → 表示
ユーザーが「更新」を押す → POST /api/refresh → NewsData.io から取得
                                             → 重複判定
                                             → Qwen で要約
                                             → キャッシュに保存
```

## 実運用のアグリゲーターの構成

調査した範囲では、規模を問わず共通していたのは **「収集」と「配信」を完全に分離する** という点だった。

```
[収集] スケジューラ → 各ソースをポーリング → 正規化 → 重複排除 → ランキング → DB
                     （媒体ごとに頻度を変える。主要紙は5分、小規模ブログは6時間など）
[配信] リクエスト → キャッシュ/DB を読むだけ（重い処理は一切しない）
```

大規模なものでは、収集をキュー（Kafka/RabbitMQ）に流し、重複排除に MinHash + LSH を使い、
PostgreSQL を正とし Redis 系のキャッシュから配信する、という構成が典型だった。

## 現状との差分と、効くと思われる改善

差分は4つあった。効果が大きい順に並べる。

### 1. 更新がユーザーのクリック契機になっている（最大の非効率）

**現状**: 「更新」を押した瞬間に、8カ国分の取得とAI要約が走る。つまり

- 押した人が数十秒待たされる
- 同時に複数人が押せば、同じ処理が重複して走る
- **APIコストが訪問者数に比例して増える**
- 誰も来なければデータは古いまま

**実運用**: 収集はスケジュール実行で、閲覧とは完全に切り離されている。閲覧側はDBを読むだけなので一瞬で返る。
コストは訪問者数ではなく更新回数だけで決まるので、予測可能になる。

**本アプリでの対応**: `POST /api/refresh` は最初から cron から叩ける設計にしてあるので、
**Vercel Cron を設定するだけ**で実現できる（`vercel.json` に `crons` を追加）。
その際、公開エンドポイントが誰でも叩ける状態は避けたいので `REFRESH_SECRET` による認証を足す必要がある
（これは `docs/SPEC.md` 7章に既に記載済みの拡張ポイント）。

cron化すると「更新」ボタンは、待たされる主機能ではなく、任意の手動トリガーという位置づけに変わる。

### 2. 閲覧のたびにサーバー処理が走っている

**現状**: ページを開くたびにブラウザから `GET /api/news` を呼び、
サーバーレス関数が起動して Upstash Redis を読んでいる。訪問者数ぶんだけ関数実行とRedisコマンドを消費する。

**実運用/Next.jsの定石**: ISR（Incremental Static Regeneration）でHTMLを静的生成し、CDNから配信する。
一定間隔での再生成（時間ベース）と、更新時に明示的に作り直す（オンデマンド）方式があり、
後者は cron から叩く更新処理と組み合わせるのが定番。

**効果**: 閲覧はCDNが返すので、**関数実行もRedis読み取りもゼロになる**。
無料枠（Upstash 月50万コマンド、Vercelの関数実行時間）の消費が、訪問者数と無関係になる。

### 3. ニュース取得元がAPIの無料枠に縛られている

**現状**: NewsData.io を使用。無料枠には日次のリクエスト上限があり、1回あたりの取得も10件に絞っている。

**実運用**: 多くのアグリゲーターは **RSSフィードを直接読む**。RSSは無料・APIキー不要で、
媒体ごとにポーリング頻度を変えて大量に集める。

調査で分かった具体的な選択肢として **Google News RSS** がある。本アプリの用途に非常に合う:

- APIキー不要・無料
- `hl`（言語）/ `gl`（国）/ `ceid`（エディション）で**国別・言語別のトップニュースが取れる**
  例: `https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja`
- `WORLD` `BUSINESS` `TECHNOLOGY` などのトピック別フィードもある
- 1回で最大100件程度

ただし**無視できない注意点**がある:

- **非公式**。Googleは公式のNews APIを提供しておらず、RSSが唯一の一次窓口。SLAもバージョニングも無く、
  フォーマットが予告なく変わりうる
- 検証記事によれば毎時100リクエスト程度までは制限に当たらないとされるが、公式な保証ではない
- 記事リンクがGoogleのリダイレクトURLになる
- 利用規約上の制約があり、特にRSSプロキシサービスの利用は規約違反にあたるとされる

**本アプリでの対応**: `NewsProvider` インターフェースを最初に切ってあるので、
`googlenews-rss.ts` を追加して `NEWS_PROVIDER=googlenews` で切り替えられる。既存構造を壊さずに追加できる。
非公式であることを踏まえ、NewsData.io を残したまま**併用/フォールバック**にするのが安全。

### 4. 重複判定の方式

**現状**: 正規化タイトル + Jaccard係数。全記事の総当たり（O(n²)）。

**実運用**: MinHash + LSH。1日150万記事といった規模で、総当たりを避けるために使われている。

**評価**: ここは**現状のままで問題ない**。総当たりが辛くなるのは数万件規模からで、
本アプリは1回あたり80件程度。MinHash/LSHは我々が抱えていない「規模」の問題を解く手法なので、
今入れても複雑さが増えるだけで速くならない。

本アプリの重複判定の弱点は速度ではなく**精度**の方にある。タイトルの単語一致に頼っているため、
言い回しが大きく異なる同一ニュースや、言語をまたぐ同一ニュース（日本語版と英語版）を検出できない。
これは `docs/SPEC.md` 8-2 の段階③（埋め込みベクトル）で対応する話であり、
RSS化して取得件数が増えるほど重要になる。

## 推奨する順序

1. **cron化 + 認証**（`REFRESH_SECRET`）— コストを訪問者数から切り離す。最も効果が大きく、実装も小さい
2. **ISR化** — 閲覧時のサーバー処理をゼロにする
3. **RSS取得の追加** — 取得量の上限を外す。非公式なので既存プロバイダと併用する
4. **埋め込みによる重複判定** — 3で取得量が増えてから効いてくる

1と2は既存の設計の延長で入る。3は新しいアダプタの追加で、既存を壊さない。

## 出典

- [System Design: News Aggregator (100K Sources, Dedup, Personalized Ranking)](https://crackingwalnuts.com/post/news-aggregator-system-design)
- [Google News System Design: A Complete Guide 2026](https://www.systemdesignhandbook.com/guides/google-news-system-design/)
- [Google News RSS Search Parameters: The Missing Docs (NewsCatcher)](https://www.newscatcherapi.com/blog-posts/google-news-rss-search-parameters-the-missing-documentaiton)
- [Google News RSS Feed: How It Works and Its Limits (cloro)](https://cloro.dev/blog/google-news-rss/)
- [Google News RSS Feed: Free URLs, No Tools Required](https://www.wprssaggregator.com/google-news-rss-feed/)
- [Incremental Static Regeneration (ISR) — Vercel](https://vercel.com/docs/incremental-static-regeneration)
- [Guides: ISR — Next.js](https://nextjs.org/docs/pages/guides/incremental-static-regeneration)
