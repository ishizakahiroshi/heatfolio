import { createServer } from "node:http";
import { access, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, extname, relative, resolve, sep, join, isAbsolute } from "node:path";

const MAX_BODY = 1_000_000;
/** Yahoo chart 向けのゆるいティッカー字形（9432.T / AAPL / ^N225 / JPY=X） */
const SYMBOL_RE = /^[A-Za-z0-9^._=\-]{1,32}$/;
const BLOCKED_SEGMENTS = new Set([
  ".git",
  ".env",
  ".claude",
  ".codex-tmp",
  ".hg",
  ".svn",
  "__pycache__",
  "node_modules",
]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

let writeQueue = Promise.resolve();

function withWriteLock(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => undefined);
  return run;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateHoldings(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "top-level must be an object";
  const holdings = obj.holdings;
  if (!Array.isArray(holdings) || holdings.length === 0) return "holdings must be a non-empty array";

  for (let i = 0; i < holdings.length; i += 1) {
    const holding = holdings[i];
    if (!holding || typeof holding !== "object" || Array.isArray(holding)) {
      return `holdings[${i}] must be an object`;
    }
    if (typeof holding.name !== "string" || !holding.name.trim()) {
      return `holdings[${i}].name is required`;
    }
    if (!finiteNumber(holding.baseValue)) {
      return `holdings[${i}].baseValue must be a finite number`;
    }
    const mode = holding.mode ?? "market";
    if (!(mode === "market" || mode === "proxy" || mode === "manual")) {
      return `holdings[${i}].mode must be market/proxy/manual`;
    }
    const currency = holding.currency ?? "JPY";
    if (!(currency === "JPY" || currency === "USD")) {
      return `holdings[${i}].currency must be JPY/USD`;
    }
    if ((mode === "market" || mode === "proxy") &&
        (typeof holding.symbol !== "string" || !holding.symbol.trim())) {
      return `holdings[${i}].symbol is required for ${mode}`;
    }
    if ((mode === "market" || mode === "proxy") && holding.symbol != null &&
        !SYMBOL_RE.test(String(holding.symbol).trim())) {
      return `holdings[${i}].symbol has invalid characters`;
    }
    if (mode === "market" && !finiteNumber(holding.quantity)) {
      return `holdings[${i}].quantity must be a finite number for market`;
    }
    if (mode !== "market" && holding.quantity !== undefined && holding.quantity !== null &&
        !finiteNumber(holding.quantity)) {
      return `holdings[${i}].quantity must be a finite number or null`;
    }
    const links = holding.links;
    if (links != null) {
      if (typeof links !== "object" || Array.isArray(links)) {
        return `holdings[${i}].links must be an object`;
      }
      for (const key of ["yahoo", "tradingview"]) {
        if (links[key] != null && links[key] !== "" && !isSafeHttpUrl(links[key])) {
          return `holdings[${i}].links.${key} must be http(s) URL`;
        }
      }
    }
  }
  return null;
}

/** Collapse ./ and empty segments; reject .. and NUL. */
export function normalizePathname(pathname) {
  if (typeof pathname !== "string" || pathname.includes("\0")) return null;
  const parts = [];
  for (const part of pathname.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  return `/${parts.join("/")}`;
}

function parseRequestUrl(req) {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = normalizePathname(decodeURIComponent(url.pathname));
    if (!pathname) return null;
    return { pathname };
  } catch {
    return null;
  }
}

function isBlockedPath(pathname) {
  const parts = pathname.split("/").filter((part) => part && part !== ".");
  return parts.some((part) =>
    BLOCKED_SEGMENTS.has(part) ||
    part.startsWith(".env") ||
    part.endsWith(".local.md") ||
    part.endsWith(".local.json") ||
    part === "AGENTS.local.md" ||
    part === "CLAUDE.local.md"
  );
}

function isInsideRoot(root, filePath) {
  const rel = relative(root, filePath);
  if (!rel || rel === "") return true;
  if (isAbsolute(rel)) return false;
  if (rel === ".." || rel.startsWith(`..${sep}`)) return false;
  return true;
}

function sendJson(res, status, payload, head = false) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
  });
  if (!head) res.end(body);
  else res.end();
}

function sendText(res, status, message, head = false) {
  const body = Buffer.from(`${message}\n`, "utf8");
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
  });
  if (!head) res.end(body);
  else res.end();
}

async function sendDataFile(res, filePath, label, head) {
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": body.length,
    });
    if (!head) res.end(body);
    else res.end();
  } catch {
    sendText(res, 404, `${label} is not initialized. Start heatfolio serve first.`, head);
  }
}

/** Package static surface is intentionally tiny (UI shell only). */
function isAllowedStaticPath(pathname) {
  return pathname === "/" || pathname === "/index.html";
}

async function sendStaticFile(res, appRoot, pathname, head) {
  const root = resolve(appRoot);
  // User data lives in the data home, never under package static /data/*
  if (pathname === "/data" || pathname.startsWith("/data/")) {
    sendText(res, 404, "Not Found", head);
    return;
  }
  if (!isAllowedStaticPath(pathname)) {
    sendText(res, 404, "Not Found", head);
    return;
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(root, relativePath);
  if (isBlockedPath(pathname) || !isInsideRoot(root, filePath)) {
    sendText(res, 404, "Not Found", head);
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": body.length,
    });
    if (!head) res.end(body);
    else res.end();
  } catch {
    sendText(res, 404, "Not Found", head);
  }
}

/** Read current meta.rev (missing/legacy file → null). */
async function readHoldingsRev(holdingsPath) {
  try {
    const current = JSON.parse(await readFile(holdingsPath, "utf8"));
    const rev = current?.meta?.rev;
    return typeof rev === "number" && Number.isFinite(rev) ? rev : null;
  } catch {
    return null;
  }
}

async function readRequestBody(req) {
  const declaredLength = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY) {
    throw new Error("invalid body size");
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("invalid body size");
    chunks.push(chunk);
  }
  if (size <= 0) throw new Error("invalid body size");
  return Buffer.concat(chunks).toString("utf8");
}

async function writeHoldingsAtomic(filePath, value) {
  const tempPath = join(dirname(filePath), `.holdings-${randomBytes(8).toString("hex")}.tmp`);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(tempPath, body, { encoding: "utf8", flag: "wx" });
    await rename(tempPath, filePath);
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // The rename normally removes the temporary path.
    }
  }
}

async function handlePost(req, res, pathname, holdingsPath) {
  if (pathname !== "/api/holdings") {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    sendJson(res, 415, { ok: false, error: "content-type must be application/json" });
    return;
  }

  let value;
  try {
    value = JSON.parse(await readRequestBody(req));
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message.startsWith("invalid body") ? error.message : `invalid JSON: ${error.message}` });
    return;
  }

  const validationError = validateHoldings(value);
  if (validationError) {
    sendJson(res, 400, { ok: false, error: validationError });
    return;
  }

  let nextRev;
  try {
    await withWriteLock(async () => {
      const serverRev = await readHoldingsRev(holdingsPath);
      const clientRev = value?.meta?.rev;
      const clientRevNum = typeof clientRev === "number" && Number.isFinite(clientRev) ? clientRev : null;

      // Optimistic concurrency: once the file has a rev, client must send the same rev.
      // Legacy files without rev accept the first write and stamp rev=1.
      if (serverRev != null && clientRevNum !== serverRev) {
        const err = new Error(
          "conflict: holdings were updated elsewhere; reload and try again"
        );
        err.code = "CONFLICT";
        err.serverRev = serverRev;
        throw err;
      }

      if (!value.meta || typeof value.meta !== "object" || Array.isArray(value.meta)) {
        value.meta = {};
      }
      nextRev = serverRev == null ? 1 : serverRev + 1;
      value.meta.rev = nextRev;
      await writeHoldingsAtomic(holdingsPath, value);
    });
  } catch (error) {
    if (error && error.code === "CONFLICT") {
      sendJson(res, 409, {
        ok: false,
        error: error.message,
        rev: error.serverRev,
      });
      return;
    }
    sendJson(res, 500, { ok: false, error: `write failed: ${error.message}` });
    return;
  }
  sendJson(res, 200, { ok: true, rev: nextRev });
}

function bindHost(host) {
  if (host === "localhost") return "127.0.0.1";
  if (host === "127.0.0.1" || host === "::1") return host;
  throw new Error("--host must be localhost, 127.0.0.1, or ::1; external bind is disabled");
}

export async function startServer({ appRoot, home, host = "127.0.0.1", port = 8080 }) {
  const bind = bindHost(host);
  const root = resolve(appRoot);
  const holdingsPath = resolve(home, "holdings.json");
  const historyPath = resolve(home, "prices", "history.json");

  const server = createServer(async (req, res) => {
    const parsed = parseRequestUrl(req);
    if (!parsed) {
      sendText(res, 400, "Bad Request", req.method === "HEAD");
      return;
    }
    const { pathname } = parsed;
    if (req.method === "POST") {
      await handlePost(req, res, pathname, holdingsPath);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method Not Allowed");
      return;
    }
    const head = req.method === "HEAD";
    if (isBlockedPath(pathname)) {
      sendText(res, 404, "Not Found", head);
      return;
    }
    if (pathname === "/data/holdings.json") {
      await sendDataFile(res, holdingsPath, "holdings.json", head);
      return;
    }
    if (pathname === "/data/prices/history.json") {
      await sendDataFile(res, historyPath, "history.json", head);
      return;
    }
    await sendStaticFile(res, root, pathname, head);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, bind, () => {
      server.removeListener("error", rejectListen);
      resolveListen();
    });
  });
  const shownHost = bind === "::1" ? "[::1]" : bind;
  console.log(`heatfolio serve: http://${shownHost}:${port}/ (data: ${resolve(home)})`);
  return server;
}
