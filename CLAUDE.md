<!-- このファイルはプロジェクト固有ルールのみを書く。個人/グローバル AI ルール
（言語・確認スタイル・出力フォーマット等）は各 AI ツールのグローバル設定へ。 -->

# heatfolio 開発ガイド

## プロジェクト概要

保有資産を四角いタイル（treemap）で俯瞰する、口座連携なし・パスワード不要の自分専用ダッシュボード。
数量だけ一度登録しておけば、価格は日次バッチ（Windows タスクスケジューラ）が公開ソース（Yahoo chart API）から自動取得する。
面積 = 評価額 / 色 = 騰落率。証券口座の ID/PW は一切扱わず、DB も持たない。

**運用方針: 完全ローカル・非公開。** 保有データ（`data/holdings.json`）は実際の資産額を含むため、
GitHub / GitHub Pages / Cloudflare 等の外部には一切出さない。閲覧はこの PC 上のローカルサーバー経由で行い、
外部端末（スマホ等）からは Tailscale（tailnet 限定）越しにアクセスする。詳細は下記「ローカル運用構成」節。

## やらないこと（スコープ外）

- 証券口座 API 連携・自動残高取得（設計思想として ID/PW を扱わない）
- クラウドのサーバー/DB 導入（データはローカルの JSON ファイルで完結。保有編集用の最小ローカル保存 API `POST /api/holdings` は例外として持つ）
- **外部公開・GitHub Pages・Cloudflare 等へのデプロイ**（保有額の露出を避けるため意図的に不採用）
- FX 換算・厳密な基準価額取得（投信/DC は指数近似で割り切る）
- ビルドツール導入（`index.html` は単一ファイル・ノーバンドルを維持）

## 技術スタック

| 領域 | 採用技術 |
|---|---|
| フロント | 静的 HTML/CSS/JS（`index.html` 単一ファイル・ビルドなし） |
| 価格取得 | Node.js ESM（`scripts/fetch-prices.mjs`・Yahoo chart API・`fetchClose()` に集約） |
| データ保存 | JSON ファイル（`data/holdings.json` 手入力 / `data/prices/history.json` 自動追記・DB なし） |
| 価格の自動更新 | Windows タスクスケジューラ `heatfolio-fetch-prices`（平日16:05） |
| ローカル配信 | Python `http.server`（`scripts/serve-local.pyw`・`127.0.0.1:8080`） |
| 外部アクセス | Tailscale `serve` の `:8443`（tailnet 限定 HTTPS 中継・インターネット非公開） |
| ホスティング | なし（完全ローカル・非公開） |

## ディレクトリ構成

- `index.html` — 保有と価格履歴を読み、評価額を計算して treemap を描画する静的ページ
- `data/holdings.json` — 保有（銘柄・数量・評価方法 `market`/`proxy`/`manual`）を手入力
- `data/prices/history.json` — 価格履歴（日次バッチが自動追記）
- `scripts/fetch-prices.mjs` — Yahoo chart API から終値を取得し history に追記
- `scripts/run-fetch.vbs` — 上記バッチをウィンドウ非表示で起動する launcher（タスクスケジューラ用・ShotTTL の `run-hidden.vbs` に準拠）
- `scripts/serve-local.pyw` — ローカル配信サーバー＋保有編集の保存API（`POST /api/holdings`）。tailscale serve のバックエンド

## 主要コマンド

- 価格取得（履歴に追記）: `node scripts/fetch-prices.mjs`
- ローカルサーバー手動起動: `pythonw scripts/serve-local.pyw`（通常はログオン時に自動起動）
- 外部共有の状態確認: `tailscale serve status`
- 外部共有の（再）有効化: `tailscale serve --bg --https=8443 8080`
- 外部共有の停止: `tailscale serve --https=8443 off`
- アクセス URL（tailnet 内）: `https://<このマシン>.<tailnet>.ts.net:8443/`

## ローカル運用構成（このマシンでの実体）

閲覧・更新の仕組みは以下の3つで成り立っている。いずれもこの PC 上で完結し、外部へ出ない。

1. 価格の自動更新: タスクスケジューラ `heatfolio-fetch-prices` が平日16:05に `wscript.exe scripts\run-fetch.vbs`
   （node をウィンドウ非表示で起動）を実行し、`data/prices/history.json` に当日分を追記する。node を直接叩くと
   ログイン中に黒いコンソール窓が一瞬出るため、VBS ランチャーで非表示化している（ShotTTL の `run-hidden.vbs` 準拠：
   node 絶対パス＋PATH フォールバック・同期実行で exit code をタスクへ伝播・欠落時は `%APPDATA%\heatfolio\logs` へ記録）。
   `StartWhenAvailable`＝PCが落ちて逃した回は次回起動時に追いつく。
2. ローカルサーバー: `scripts/serve-local.pyw` が `127.0.0.1:8080` で本ディレクトリを静的配信し、
   加えて保有編集の保存API `POST /api/holdings` を提供する（JSON 検証 → 同ディレクトリの一時ファイルへ書き →
   `os.replace` で原子置換。検証落ち・書き込み失敗時も既存 `holdings.json` は壊れない）。
   ログオン時に自動起動する（HKCU `...\Run` の `heatfolio-server`）。`pythonw` はコンソールが無く
   `http.server` の既定ログが stderr で落ちるため、`serve-local.pyw` は `log_message` を無効化している。
3. 外部アクセス: `tailscale serve --bg --https=8443 8080` が上記ポートを tailnet 内へ HTTPS 中継する（**tailnet only**）。
   アクセスは `https://<このマシン>.<tailnet>.ts.net:8443/`。Tailscale に参加している自分の端末だけが到達でき、認証は Tailscale が担う。

**serve ポートを 443 でなく 8443 にしている理由（重要）**: このマシンでは many-ai-cli のダッシュボードが
`tailscale serve` の `:443` パス `/` を使っている。tailscale serve の衝突は backend ポートではなく
「公開マウント点（serve ポート + パス）」で起きるため、heatfolio を `:443` `/` に置くと**ダッシュボードを蹴り落とす**（逆も同様）。
別ポート `:8443` に分けることで両者が共存する（HTTPS で使える serve ポートは 443 / 8443 / 10000）。
もし many-ai-cli 側の操作で heatfolio の共有が消えたら、上記「外部共有の（再）有効化」コマンドで戻す。

注意: この構成は「PC の電源が入っている間」だけ価格取得と閲覧が動く（個人用途では許容）。

## 保有の編集（アプリ内 UI）

`holdings.json` は手で編集してもよいが、画面からも編集できる（`index.html`）:

- タイルをクリック → 数量・評価額・銘柄名・評価方法(mode)・シンボルを編集
- 「＋ 銘柄を追加」ボタン → 新規追加
- 編集パネルの「この銘柄を削除」（誤操作防止で二段階クリック）
- 「保存」で `POST /api/holdings` に書き戻し → 即再描画。スマホからも tailnet 経由で編集可

編集時は既存銘柄の未知フィールド（`proxyNote` / `manualNote` / `code` 等）を保持したまま該当項目だけ更新する。
保存は上記「ローカル運用構成」の原子置換で行うため、途中失敗でファイルが壊れることはない。

## 通貨（米国株＝ドル建て）対応

合計は円建て。ドル建ての米国株は「その日の USD/JPY 始値」で円換算する。

- `market` 銘柄に `currency: "USD"` を付けると、評価額 = 数量 × ドル株価 × その日の USD/JPY 始値（円建ては `currency` を省略＝既定 JPY）
- `fetch-prices.mjs` は USD 建て保有があるときだけ USD/JPY の**始値(open)**を取得し、`history.json` に `"JPY=X"`（Yahoo の USD/JPY）として日次保存する。個別株は従来どおり終値
- `index.html` の `valueAt()` は USD 銘柄を `fxAt(date)`（その日の `JPY=X`）で円換算する。USD/JPY 未取得の間は `baseValue` で表示
- 編集画面の「通貨」で 円/米ドル を選ぶ（`market` の時のみ表示）
- `proxy`（DC の S&P500 等）は設計どおり FX 無視の近似のまま据え置き（`currency` は使わない）
- 日本株のシンボルは `.T` サフィックスが必要（例: 太陽誘電＝`6976.T`）。`.T` 無しだと Yahoo が 404 になり価格が取れず baseValue 表示のままになる

## AI 作業共通ルール

ビルド・コミット禁止、plan/bugfix/pending md の作成ルール等の AI 作業共通ルールは、各利用者のグローバル AI 設定に従う（作者環境の例: `~/.claude/CLAUDE.md` および `~/.claude/guides/`）。

このリポジトリ固有:

- `data/holdings.json` は実際の保有額を含む機微データ。外部（GitHub/クラウド/チャット出力等）へ絶対に出さない
- 外部公開・デプロイの提案はしない（意図的に完全ローカル運用）
- 価格取得ロジックは `fetchClose()` に一点集約する（データ源が塞がれたらここだけ差し替える）

## 関連ドキュメント

| 項目 | パス |
|---|---|
| ユーザー向け README | `README.md` |
| Codex/他 AI 用入口 | `AGENTS.md` |
