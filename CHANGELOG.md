# Changelog

このプロジェクトの主な変更点を記録する。形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョニングは [SemVer](https://semver.org/lang/ja/) に従う。

## [0.1.0] - 2026-07-07

### Added
- 保有資産を treemap で俯瞰する静的ダッシュボード（面積 = 評価額 / 色 = 騰落率、前日 / 1W / 1M / 1Y 切替・基準日指定）
- 日次バッチ `scripts/fetch-prices.mjs`（Yahoo chart API から終値を取得し `data/prices/history.json` に追記）
- 完全ローカル運用: Windows タスクスケジューラ + ローカル配信サーバー `scripts/serve-local.pyw` + Tailscale serve による tailnet 限定アクセス
- 価格取得バッチのウィンドウ非表示ランチャー `scripts/run-fetch.vbs`（黒いコンソール窓を出さない）
- アプリ内編集: タイルクリックで数量・評価額の編集、銘柄の追加、二段階削除（保存は `POST /api/holdings` で JSON 検証 + 原子置換）
- タイルラベルの自動折り返し表示（長い銘柄名がはみ出さない）
- 米国株（ドル建て）対応: `currency: "USD"` の銘柄をその日の USD/JPY 始値で円換算
- 評価方法 3 種（`market` / `proxy` / `manual`）
- 合成サンプル `data/holdings.example.json` / `data/prices/history.example.json` を同梱。実データ（`holdings.json` / `history.json`）は `.gitignore` で公開対象外

[0.1.0]: https://github.com/ishizakahiroshi/heatfolio/releases/tag/v0.1.0
