# heatfolio

[日本語](README.md) | **English**

A privacy-first personal asset dashboard. View your holdings as a treemap **without linking any brokerage account**.
Register just the quantities once; prices auto-update daily from a public source (Yahoo chart API).
**Runs entirely on your own machine.** No cloud DB, no GitHub Pages deployment, no external hosting of your data.

- Area = valuation / Color = daily/weekly/monthly/yearly return (togglable)
- Never handles brokerage IDs or passwords. Update quantities only when you buy or sell (via the in-app editor)
- No DB. Price history accumulates in a local JSON file, which itself becomes your time series

![heatfolio screenshot](docs/images/screenshot.png)

(The Apple 5-share tile in the screenshot is a demo. Each tile shows the ticker code and quantity, plus one-click Y / TV badges to Yahoo Finance / TradingView.)

## Who this is for

For those who understand that MoneyForward and similar account-linking tools are convenient, **but who still can't shake the discomfort of handing brokerage credentials to a third-party app**.

Even large aggregator services have had data-leak incidents in the past. If security-conscious companies can be breached, smaller no-name SaaS offering "trust us" claims have even less basis for that trust. This isn't about which vendor to trust; it's about **whether to accept the premise of putting your household finance data in someone else's hands at all**.

In return, you accept these trade-offs:

- **Enter quantities yourself, once per trade** (edit them only on the day you buy or sell)
- **Price auto-fetch depends only on a public source (Yahoo chart API)** — swappable if it ever breaks
- **Viewing is restricted to your own PC, or your own Tailscale devices**
- **Mobile access requires installing Tailscale and joining your own tailnet**

If you can treat those steps as "the cost of peace of mind," heatfolio should feel natural. Conversely, if "typing in quantities is too much friction, I want full auto" is a legitimate personal choice for you, existing account-linking tools serve that need better — that's a valid decision.

## Current scope and limits

- **Optimized for Japanese markets**: Yahoo Finance JP tickers (e.g., `9432.T` for NTT), Japanese fund proxies (`2559.T` for MAXIS All-World), Japanese-language in-app UI
- **US-listed stocks are supported** in USD with automatic conversion via the daily USD/JPY opening rate (`JPY=X`)
- **The in-app UI is Japanese-only for now.** If you need an English UI, please [open a GitHub issue](https://github.com/ishizakahiroshi/heatfolio/issues) — I'll prioritize based on demand rather than proactively translating everything

## Full documentation

See the Japanese [README.md](README.md) for:

- Data files and directory layout
- Mode explanations (`market` / `proxy` / `manual`)
- Windows Task Scheduler + Tailscale operational setup
- How to bootstrap on a fresh machine

## Viewing from other devices

Run exactly one heatfolio server on this PC, then open its URL from a browser on your other devices. With Tailscale installed, your phone or another PC can reach `https://<this-machine>.<tailnet>.ts.net:8443/`.

Do not run independent heatfolio installations on several devices and manually synchronize `data/holdings.json`. heatfolio deliberately does not resolve write conflicts, so a later write can overwrite an earlier one. Use JSON or CSV export when you need to carry data elsewhere.

## Exporting and importing data

- **JSON export**: Use the `JSON` button at the top of the page to download `holdings-YYYY-MM-DD.json`. It is equivalent to `data/holdings.json` and is suitable for backups, migration to another PC, or use in another tool.
- **CSV export**: The `CSV` button downloads holdings, quantities, valuations, and returns for analysis in Excel or Google Sheets.
- **CSV import**: This is intentionally not a heatfolio feature because every brokerage uses a different CSV format. Instead, `scripts/import-samples/` contains examples that convert broker CSV files into heatfolio JSON. Write one small Node.js script for your own broker.

## Related article

"[Designing a local-only asset dashboard: a treemap-based tool that never touches brokerage APIs](https://qiita.com/ishizakahiroshi/items/b5da260733e416085421)" (Japanese, published on Qiita)

## License

MIT (see `LICENSE`). Your holdings data (`data/holdings.json`) should stay on your local machine only; don't upload it anywhere.
