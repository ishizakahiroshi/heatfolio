# heatfolio v0.1.0 リリース [準備]

> 最終更新: 2026-07-07(火) 01:10:00

## リリース引数

| key | value | 備考 |
|---|---|---|
| repo | heatfolio | 台帳 release-registry.csv の repo 列と一致 |
| version | v0.1.0 | タグ単一ソース（原則 P8）。ここ以外に版を手書きしない |
| channels | github-release | 静的 Web アプリで配布物なし。npm/crates/pypi は対象外 |
| mode | （空） | 通常 |
| dry-run | false | |
| secrets | （なし） | GHA/公開 secret は不要 |
| notes | 初回公開。実データ（holdings.json / history.json）は .gitignore 除外・合成サンプルのみ同梱。GHA が無いので GitHub Release は手動 `gh release create`。 |

## 実行計画

github-release のみ・GHA/ビルド無しの手動リリース。各段に verify を付ける。

1. 前提チェック → verify:
   - `LICENSE`（MIT・`Copyright (c) 2026 Hiroshi Ishizaka (ishizakahiroshi)`）が存在
   - 実データ 2 ファイルが追跡対象外（`git ls-files` に出ない・`git check-ignore` で確認済み）
   - secrets 監査 passed（本セッションで kb 由来固有名詞・個人パス・tailnet ホスト名の混入なしを確認。実額は gitignore 済みの holdings.json のみ）
   - `README` / `LICENSE` の自己表記が一致（MIT・プロジェクト名 heatfolio）
2. `CHANGELOG.md` に v0.1.0 節がある → verify: `Get-Content CHANGELOG.md`
3. 初回 commit → verify: `git log --oneline`
4. GitHub public リポ作成 + push → verify: `gh repo view ishizakahiroshi/heatfolio`
5. タグ `v0.1.0` を打って push → verify: `git tag` / `git ls-remote --tags origin`
6. `gh release create v0.1.0`（本文は CHANGELOG の v0.1.0 節）→ verify: `gh release view v0.1.0` で本文が空でない

## 申し送り

- secrets-scan: passed（2026-07-07・正典スキャナ `project-init/templates/secrets-scan/secrets-scan.mjs` を `--all-tracked` で実行。KB_ROOT=C:/dev/kb・FAMILY_ROOT 設定済み。12 ファイル・88 needles + 構造 regex 3 種、ヒット 0）
- 実データ 2 ファイル（holdings.json / history.json）は `.gitignore` 除外を `git ls-files` で確認済み
- （公開実行後に commit/タグ/Release の結果をここへ追記）
