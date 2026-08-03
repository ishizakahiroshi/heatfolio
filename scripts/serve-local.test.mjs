import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { normalizePathname, validateHoldings } from "./serve-local.mjs";

function isInsideRoot(root, filePath) {
  const rel = relative(root, filePath);
  if (!rel || rel === "") return true;
  if (isAbsolute(rel)) return false;
  if (rel === ".." || rel.startsWith(`..${sep}`)) return false;
  return true;
}

test("normalizePathname collapses dots and empty segments", () => {
  assert.equal(normalizePathname("/data/./holdings.json"), "/data/holdings.json");
  assert.equal(normalizePathname("/data//holdings.json"), "/data/holdings.json");
  assert.equal(normalizePathname("/./data/holdings.json"), "/data/holdings.json");
  assert.equal(normalizePathname("/"), "/");
});

test("normalizePathname rejects parent segments and NUL", () => {
  assert.equal(normalizePathname("/../etc/passwd"), null);
  assert.equal(normalizePathname("/data/foo/../../../x"), null);
  assert.equal(normalizePathname("/data/\0holdings.json"), null);
});

test("validateHoldings accepts a minimal market holding", () => {
  const err = validateHoldings({
    holdings: [{ name: "A", baseValue: 1, mode: "market", symbol: "AAPL", quantity: 1 }],
  });
  assert.equal(err, null);
});

test("validateHoldings rejects bad symbol and non-http links", () => {
  assert.match(
    validateHoldings({
      holdings: [{ name: "A", baseValue: 1, mode: "market", symbol: "http://evil", quantity: 1 }],
    }) || "",
    /symbol/
  );
  assert.match(
    validateHoldings({
      holdings: [{ name: "A", baseValue: 1, mode: "manual", links: { yahoo: "javascript:1" } }],
    }) || "",
    /links/
  );
});

test("validateHoldings rejects empty holdings", () => {
  assert.match(validateHoldings({ holdings: [] }) || "", /non-empty/);
});

test("isInsideRoot blocks cross-drive absolute relatives on Windows-style paths", () => {
  // Synthetic root. The assertion only needs a Windows-style absolute path,
  // so do not hardcode a real checkout location here.
  const root = resolve("D:/app/heatfolio");
  // Same-package file stays inside
  assert.equal(isInsideRoot(root, resolve(root, "index.html")), true);
  // Other-drive resolve yields absolute relative on Windows
  const other = resolve(root, "D:/secret.txt");
  assert.equal(isInsideRoot(root, other), false);
});
