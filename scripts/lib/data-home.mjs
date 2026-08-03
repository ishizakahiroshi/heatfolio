import { access, copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** Return the package/repository root containing index.html and data/. */
export function resolveAppRoot() {
  return resolve(MODULE_DIR, "../..");
}

/**
 * Resolve the user data home in the locked order:
 * --home, HEATFOLIO_HOME, --dev/HEATFOLIO_DEV=1, then ~/.heatfolio.
 */
export function resolveDataHome(opts = {}) {
  const appRoot = resolve(opts.appRoot ?? resolveAppRoot());
  const explicitHome = typeof opts.home === "string" ? opts.home.trim() : "";
  if (explicitHome) return resolve(explicitHome);

  const envHome = process.env.HEATFOLIO_HOME?.trim();
  if (envHome) return resolve(envHome);

  const dev = opts.dev === true || process.env.HEATFOLIO_DEV === "1";
  if (dev) return resolve(appRoot, "data");

  return resolve(homedir(), ".heatfolio");
}

export function paths(home) {
  const root = resolve(home);
  const pricesDir = join(root, "prices");
  return {
    home: root,
    holdings: join(root, "holdings.json"),
    pricesDir,
    history: join(pricesDir, "history.json"),
  };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a user data home and seed only missing files from package examples.
 * Existing holdings and history are never overwritten.
 */
export async function ensureDataHome(home, appRoot = resolveAppRoot()) {
  const target = paths(home);
  const root = resolve(appRoot);
  await mkdir(target.pricesDir, { recursive: true });

  let created = false;
  const holdingsExists = await exists(target.holdings);
  if (!holdingsExists) {
    await copyFile(join(root, "data", "holdings.example.json"), target.holdings);
    created = true;
  }

  if (!(await exists(target.history))) {
    await copyFile(join(root, "data", "prices", "history.example.json"), target.history);
    created = true;
  }

  if (!holdingsExists) {
    console.error(`Initialized heatfolio data home: ${target.home}`);
    console.error("Sample holdings were copied. Edit them in the browser to use your own data.");
  }

  return { created, home: target.home };
}

/**
 * One-shot: copy repository data into a missing user home holdings file only.
 * Never overwrites an existing home holdings/history (sample note was a footgun).
 * The repository files are intentionally retained and never deleted.
 */
export async function maybeMigrateFromRepo(home, repoDataDir) {
  if (!repoDataDir) return { migrated: false, home: resolve(home) };

  const target = paths(home);
  const source = paths(repoDataDir);
  if (target.home === source.home || !(await exists(source.holdings))) {
    return { migrated: false, home: target.home };
  }

  // Existing home holdings (including still-sample meta.note) are never overwritten.
  if (await exists(target.holdings)) {
    return { migrated: false, home: target.home };
  }

  await mkdir(target.pricesDir, { recursive: true });
  await copyFile(source.holdings, target.holdings);

  if (await exists(source.history) && !(await exists(target.history))) {
    await copyFile(source.history, target.history);
  }

  console.error(`Migrated repository data: ${source.holdings} -> ${target.holdings}`);
  return { migrated: true, home: target.home };
}
