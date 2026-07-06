// 日次バッチ：holdings.json に載っている symbol の終値を Yahoo Finance chart API から取得し、
// data/prices/history.json に「その日の分」として追記する。
// Node 20+ （グローバル fetch 使用）。ローカル実行: node scripts/fetch-prices.mjs
//
// 【壊れたときの差し替えポイント】
//   価格取得は fetchClose() に集約してある。Yahoo が塞がれたら、この関数だけを
//   Alpha Vantage 等に差し替えれば復旧できる（他は触らなくてよい）。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOLDINGS = join(ROOT, "data", "holdings.json");
const HISTORY = join(ROOT, "data", "prices", "history.json");
const FX_SYMBOL = "JPY=X"; // Yahoo の USD/JPY（1ドル=約150円）。USD建て保有の円換算に使う

// JST の当日日付（YYYY-MM-DD）。GitHub Actions は UTC で動くため +9h して日付を出す。
function todayJST() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

// Yahoo chart から指定フィールド（"close" or "open"）の直近の非null値を取る。
async function fetchQuote(symbol, field = "close") {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=5d`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (portfolio-heatmap batch)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const r = json?.chart?.result?.[0];
      const series = r?.indicators?.quote?.[0]?.[field] ?? [];
      // 直近の非nullな値を採用
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i] != null) return Number(series[i]);
      }
      throw new Error(`no ${field} data`);
    } catch (e) {
      console.warn(`  [${symbol}] attempt ${attempt} failed: ${e.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return null; // 取得失敗は null（その日は欠測扱い。表示側は直近値でフォールバック）
}

// 個別株は終値を使う。
async function fetchClose(symbol) {
  return fetchQuote(symbol, "close");
}

async function main() {
  const holdings = JSON.parse(await readFile(HOLDINGS, "utf8"));
  // 履歴が無い fresh clone でも動くよう、無ければ空で開始する
  let history;
  try {
    history = JSON.parse(await readFile(HISTORY, "utf8"));
  } catch {
    history = { prices: {} };
  }
  if (!history.prices) history.prices = {};

  // 取得対象の symbol を重複なく集める（manual や symbol なしは除外）
  const symbols = [
    ...new Set(
      holdings.holdings
        .filter((h) => h.mode !== "manual" && h.symbol)
        .map((h) => h.symbol)
    ),
  ];

  const date = todayJST();
  const row = { ...(history.prices[date] || {}) };

  console.log(`Fetching ${symbols.length} symbols for ${date} ...`);
  for (const sym of symbols) {
    const close = await fetchClose(sym);
    if (close != null) {
      row[sym] = close;
      console.log(`  ${sym} = ${close}`);
    } else {
      console.log(`  ${sym} = (取得失敗・スキップ)`);
    }
    await new Promise((r) => setTimeout(r, 400)); // 軽いレート対策
  }

  // USD 建て保有（market・symbol あり）があれば、USD/JPY の「始値」も取得して円換算に使う
  const needsFx = holdings.holdings.some(
    (h) => h.currency === "USD" && h.mode !== "manual" && h.symbol
  );
  if (needsFx) {
    const fx = await fetchQuote(FX_SYMBOL, "open");
    if (fx != null) {
      row[FX_SYMBOL] = fx;
      console.log(`  ${FX_SYMBOL} (USD/JPY 始値) = ${fx}`);
    } else {
      console.log(`  ${FX_SYMBOL} = (取得失敗・スキップ)`);
    }
  }

  if (Object.keys(row).length === 0) {
    console.log("No prices fetched. Nothing to write.");
    return;
  }

  history.prices[date] = row;
  await writeFile(HISTORY, JSON.stringify(history, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(row).length} prices to history for ${date}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
