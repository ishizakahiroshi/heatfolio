# import-samples

証券会社の CSV を `data/holdings.json` に変換する Node.js サンプルスクリプト置き場です。

heatfolio 本体は CSV import を実装していません。証券会社ごとにフォーマットが違うためです。代わりに、ここに証券会社別の変換スクリプトを積み上げます。自分の使う証券会社の CSV に合わせて 1 本書けば十分です。

## 使い方

```powershell
node scripts/import-samples/<broker>.mjs <input.csv> > data/holdings.json.new
# 内容を確認したら data/holdings.json.new を data/holdings.json に置き換える
```

標準出力には保有情報が含まれます。コマンドの出力をチャットや公開場所に貼り付けないでください。

## 現在のサンプル

- `sbi.mjs`: SBI 証券の「保有証券一覧」CSV 想定のサンプル

想定する列は `銘柄コード,銘柄名,保有株数,平均取得単価,現在値` です。

## 他の証券会社の追加

1. 該当証券会社の CSV の列名とエンコーディングを確認する
2. `sbi.mjs` を雛形に `<broker>.mjs` を作る
3. 列名と行の変換処理を調整する
4. 実データではない架空値の CSV でテストする
