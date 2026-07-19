#!/usr/bin/env node

import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { maybeMigrateFromRepo, ensureDataHome, resolveAppRoot, resolveDataHome } from "./lib/data-home.mjs";

const APP_ROOT = resolveAppRoot();

export function parseCliArgs(argv) {
  let command = "serve";
  let commandSet = false;
  const options = { home: undefined, dev: false, host: "127.0.0.1", port: 8080, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--dev") {
      options.dev = true;
      continue;
    }
    if (arg === "--home" || arg === "--port" || arg === "--host") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (arg === "--home") options.home = value;
      if (arg === "--host") options.host = value;
      if (arg === "--port") {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error("--port must be an integer from 1 to 65535");
        }
        options.port = port;
      }
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
    if (commandSet) throw new Error(`unexpected argument: ${arg}`);
    command = arg;
    commandSet = true;
  }

  return { command, options };
}

function printHelp() {
  console.log("heatfolio: local-only portfolio treemap dashboard");
  console.log("Usage: heatfolio [serve|fetch|path|open] [options]");
  console.log("  serve             start the local dashboard (default)");
  console.log("  fetch             fetch prices into the user data home");
  console.log("  path              print the absolute user data home");
  console.log("  open              open the local dashboard in a browser");
  console.log("Options: --home <dir>  --dev  --host <addr>  --port <n>");
  console.log("Data stays local in ~/.heatfolio unless --home or HEATFOLIO_HOME is set.");
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function prepareDataHome(options) {
  const home = resolveDataHome({
    home: options.home,
    dev: options.dev,
    appRoot: APP_ROOT,
  });
  const repoDataDir = options.dev || process.env.HEATFOLIO_DEV === "1"
    ? join(APP_ROOT, "data")
    : join(process.cwd(), "data");
  const repoHoldings = join(repoDataDir, "holdings.json");
  if (await fileExists(repoHoldings)) await maybeMigrateFromRepo(home, repoDataDir);
  await ensureDataHome(home, APP_ROOT);
  return { home, appRoot: APP_ROOT };
}

function openBrowser(url) {
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], { detached: true, stdio: "ignore" });
  child.unref();
}

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseCliArgs(argv);
  if (options.help || command === "help") {
    printHelp();
    return;
  }
  if (command === "path") {
    console.log(resolveDataHome({ home: options.home, dev: options.dev, appRoot: APP_ROOT }));
    return;
  }
  if (command === "open") {
    const host = options.host === "localhost" ? "127.0.0.1" : options.host;
    openBrowser(`http://${host}:${options.port}/`);
    return;
  }
  if (command === "serve") {
    const { home, appRoot } = await prepareDataHome(options);
    const { startServer } = await import("./serve-local.mjs");
    await startServer({ appRoot, home, host: options.host, port: options.port });
    return;
  }
  if (command === "fetch") {
    const { home } = await prepareDataHome(options);
    const { runFetch } = await import("./fetch-prices.mjs");
    await runFetch({ home });
    return;
  }
  printHelp();
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(`heatfolio: ${error.message}`);
    process.exitCode = 1;
  });
}

export { main };
