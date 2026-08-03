# Agent Entry Point (heatfolio)

このリポジトリの運用ガイダンスは `CLAUDE.md` を正本とする。

- プロジェクト概要・ルール: `./CLAUDE.md`
- ユーザー向けドキュメント: `./README.md`
- ローカル/プライベート追記（存在する場合・コミットしない）: `./CLAUDE.local.md` / `./AGENTS.local.md` / `./docs/local/`

個人/グローバル AI ルールは意図的にこのリポジトリの外に置く。各 AI ツールの
グローバル設定を使うこと。本ファイルは fresh public clone でも有効に保つ。

## Non-negotiables (full detail in CLAUDE.md)

- **完全ローカル・非公開運用**。`data/holdings.json` は実際の保有額を含む機微データ。GitHub/クラウド/チャット出力等、外部へ絶対に出さない
- 外部公開・GitHub Pages・クラウドへのデプロイは提案しない（意図的にローカル完結）
- `index.html` は単一ファイル・ノーバンドルを維持する
- ビルド・コミット禁止、plan/bugfix/pending md の作成ルール等の AI 作業共通ルールは、各利用者のグローバル AI 設定に従う（作者環境の例: `~/.claude/CLAUDE.md` および `~/.claude/guides/`）

ローカル運用構成（タスクスケジューラ / ローカルサーバー / Tailscale 配信）の詳細は `CLAUDE.md` の「ローカル運用構成」節を参照。ガイダンス間で矛盾が出たら `CLAUDE.md` を優先する。
