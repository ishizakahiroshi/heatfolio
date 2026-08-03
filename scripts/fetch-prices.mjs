// 日次バッチ：holdings.json に載っている symbol の終値を Yahoo Finance chart API から取得し、
// ユーザーデータホームの prices/history.json に「その日の分」として追記する。
// Node 20+（グローバル fetch 使用）。通常は heatfolio fetch で実行する。
// 直接実行する場合も --home / --dev / HEATFOLIO_HOME を解釈する。
//
// 【壊れたときの差し替えポイント】
//   価格取得は fetchClose() に集約してある。Yahoo が塞がれたら、この関数だけを
//   Alpha Vantage 等に差し替えれば復旧できる（他は触らなくてよい）。

import { access, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  ensureDataHome,
  maybeMigrateFromRepo,
  paths,
  resolveAppRoot,
  resolveDataHome,
} from "./lib/data-home.mjs";

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
    "?interval=1d&range=5d";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (portfolio-heatmap batch)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      const series = result?.indicators?.quote?.[0]?.[field] ?? [];
      for (let i = series.length - 1; i >= 0; i -= 1) {
        if (series[i] != null) {
          const number = Number(series[i]);
          if (Number.isFinite(number)) return number;
        }
      }
      throw new Error(`no ${field} data`);
    } catch (error) {
      console.warn(`  [${symbol}] attempt ${attempt} failed: ${error.message}`);
      if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500 * attempt));
    }
  }
  return null;
}

// 個別株は終値を使う。
export async function fetchClose(symbol) {
  return fetchQuote(symbol, "close");
}

/** history.json を一時ファイル経由で原子置換する（途中 kill で壊さない） */
async function writeHistoryAtomic(historyPath, history) {
  const dir = dirname(historyPath);
  const tempPath = join(dir, `.history-${randomBytes(8).toString("hex")}.tmp`);
  const body = `${JSON.stringify(history, null, 2)}\n`;
  try {
    await writeFile(tempPath, body, { encoding: "utf8", flag: "wx" });
    await rename(tempPath, historyPath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors and preserve the original error.
    }
    throw error;
  }
}

export async function runFetch({ home }) {
  const dataPaths = paths(home);
  let holdings;
  try {
    holdings = JSON.parse(await readFile(dataPaths.holdings, "utf8"));
  } catch (error) {
    throw new Error(`failed to read holdings.json: ${error.message}`);
  }
  if (!Array.isArray(holdings?.holdings)) {
    throw new Error("holdings.json: top-level.holdings must be an array");
  }

  let history;
  try {
    history = JSON.parse(await readFile(dataPaths.history, "utf8"));
  } catch {
    history = { prices: {} };
  }
  if (!history.prices || typeof history.prices !== "object" || Array.isArray(history.prices)) {
    history.prices = {};
  }

  const SYMBOL_RE = /^[A-Za-z0-9^._=\-]{1,32}$/;
  const symbols = [
    ...new Set(
      holdings.holdings
        .filter((holding) =>
          holding && holding.mode !== "manual" &&
          typeof holding.symbol === "string" && holding.symbol &&
          SYMBOL_RE.test(holding.symbol.trim())
        )
        .map((holding) => holding.symbol.trim())
    ),
  ];

  const date = todayJST();
  const row = { ...(history.prices[date] || {}) };

  console.log(`Fetching ${symbols.length} symbols for ${date} ...`);
  for (const symbol of symbols) {
    const close = await fetchClose(symbol);
    if (close != null) {
      row[symbol] = close;
      console.log(`  ${symbol} = ${close}`);
    } else {
      console.log(`  ${symbol} = (取得失敗・スキップ)`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
  }

  const needsFx = holdings.holdings.some(
    (holding) =>
      holding && holding.currency === "USD" && holding.mode !== "manual" && holding.symbol
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
  await writeHistoryAtomic(dataPaths.history, history);
  console.log(`Wrote ${Object.keys(row).length} prices to history for ${date}.`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseDirectOptions(argv) {
  let home;
  let dev = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dev") {
      dev = true;
      continue;
    }
    if (argv[i] === "--home") {
      home = argv[++i];
      if (!home || home.startsWith("--")) throw new Error("--home requires a value");
      continue;
    }
    throw new Error(`unknown option: ${argv[i]}`);
  }
  return { home, dev };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseDirectOptions(argv);
  const appRoot = resolveAppRoot();
  const home = resolveDataHome({ home: options.home, dev: options.dev, appRoot });
  // Migration source is always package/repo appRoot/data (never ambient cwd).
  const repoDataDir = join(appRoot, "data");
  if (await exists(join(repoDataDir, "holdings.json"))) {
    await maybeMigrateFromRepo(home, repoDataDir);
  }
  await ensureDataHome(home, appRoot);
  await runFetch({ home });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
