#!/usr/bin/env node
import { readFileSync } from "node:fs";

const usage = `Usage: node scripts/import-samples/sbi.mjs <input.csv> [--encoding utf8|sjis]

Converts an assumed SBI Securities holdings CSV to heatfolio JSON on stdout.
Expected columns: 銘柄コード, 銘柄名, 保有株数, 平均取得単価, 現在値
The default encoding is sjis. Adjust the expected column names if your SBI CSV differs.`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage);
  process.exit(0);
}

let encoding = "sjis";
const encodingAt = args.indexOf("--encoding");
if (encodingAt !== -1) {
  encoding = args[encodingAt + 1];
  args.splice(encodingAt, 2);
}
if (args.length !== 1 || !["utf8", "sjis"].includes(encoding)) {
  console.error(usage);
  process.exit(1);
}

function parseCsv(text) {
  const rows = [[]]; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { rows.at(-1).push(field); field = ""; }
    else if (ch === "\n") { rows.at(-1).push(field); field = ""; rows.push([]); }
    else if (ch !== "\r") field += ch;
  }
  if (field || rows.at(-1).length) rows.at(-1).push(field);
  return rows.filter(row => row.some(cell => cell !== ""));
}
function number(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

const decoder = new TextDecoder(encoding === "sjis" ? "shift_jis" : "utf-8");
const rows = parseCsv(decoder.decode(readFileSync(args[0])));
const [header, ...data] = rows;
const index = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
const required = ["銘柄コード", "銘柄名", "保有株数", "平均取得単価"];
const missing = required.filter(name => index[name] == null);
if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);

const holdings = data.map((row, rowIndex) => {
  const code = String(row[index["銘柄コード"]] ?? "").trim();
  const name = String(row[index["銘柄名"]] ?? "").trim();
  const quantity = number(row[index["保有株数"]]);
  const averageCost = number(row[index["平均取得単価"]]);
  if (!code || !name || quantity == null || averageCost == null) {
    throw new Error(`Invalid row ${rowIndex + 2}: code, name, quantity, and average cost are required`);
  }
  return { name, code, type: "国内株", mode: "market", symbol: `${code}.T`, quantity, unit: "株", baseValue: quantity * averageCost };
});

console.log(JSON.stringify({
  meta: {
    baseCurrency: "JPY",
    note: "SBI 証券 CSV から変換（scripts/import-samples/sbi.mjs 経由）",
    baseDate: new Date().toISOString().slice(0, 10)
  },
  holdings
}, null, 2));
