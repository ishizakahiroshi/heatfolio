# heatfolio

[日本語](README.md) | **English**

A local-only treemap dashboard for viewing your holdings without linking a brokerage account or handling passwords.
You enter quantities yourself, while prices are fetched daily from the public Yahoo chart API.
Your holdings stay on your own machine.

![heatfolio screenshot](docs/images/screenshot.png)

The Apple 5-share tile in the screenshot is synthetic sample data.

## Quick start

The general user path requires only Node.js 20 or newer. After the npm package is published:

\`\`\`powershell
npx --yes heatfolio@latest
\`\`\`

Or install the command globally:

\`\`\`powershell
npm install --global heatfolio
heatfolio
\`\`\`

Open http://127.0.0.1:8080/ in your browser and edit the tiles. The first start creates sample data automatically.
Use the in-app save button to replace it with your own holdings.

Before npm publication, run the repository version with Node.js 20 or newer:

\`\`\`powershell
git clone https://github.com/ishizakahiroshi/heatfolio.git
cd heatfolio
node scripts/heatfolio.mjs serve
\`\`\`

### User data home

The app package and user data are separate:

\`\`\`text
%USERPROFILE%\\.heatfolio\\
  holdings.json
  prices\\history.json
\`\`\`

On macOS and Linux the default is ~/.heatfolio/. Run heatfolio path to print the absolute location.
Set HEATFOLIO_HOME or use --home <dir> to choose another location. --home has priority.
Use --dev or HEATFOLIO_DEV=1 when developing with repository-local data/ files.

## Updating prices

Run the following whenever you want to fetch prices:

\`\`\`powershell
heatfolio fetch
\`\`\`

The history is written to prices/history.json inside the user data home. On Windows, Task Scheduler can run
the repository's scripts\\run-fetch.vbs through wscript.exe. It starts the Node CLI without a console window
and writes data to the user home.

## Other devices

Run one heatfolio server on the PC that owns the data, then connect from your other Tailscale devices.

\`\`\`powershell
tailscale serve --bg --https=8443 8080
tailscale serve status
\`\`\`

Use the tailnet-only URL shown by Tailscale. heatfolio is not intended for public internet hosting.
Do not run independent servers on several devices and manually synchronize holdings JSON, because a later save can overwrite an earlier one.

## Developer notes

Use repository-local data while developing:

\`\`\`powershell
node scripts/heatfolio.mjs serve --dev
node scripts/heatfolio.mjs fetch --dev
\`\`\`

If repository data/holdings.json exists and the user home is empty or still contains the sample, the Node CLI copies it once.
The repository files are never deleted. scripts/serve-local.pyw remains as a legacy Python server; new users should use heatfolio serve.

## Scope and privacy

- No brokerage IDs, passwords, broker API, database, cloud sync, or external hosting
- market uses quantity times symbol price, proxy tracks an index or fund proxy, and manual keeps the base value fixed
- USD market holdings can use currency: "USD"; the daily USD/JPY opening rate is stored as JPY=X
- Japanese stock symbols need the .T suffix, for example 9432.T
- Only synthetic examples are tracked. Real holdings.json and history.json files are ignored and stay local
- JSON and CSV export buttons are available in the UI; broker CSV import is intentionally left to small scripts in scripts/import-samples/

For the design background, see the Japanese [Qiita article](https://qiita.com/ishizakahiroshi/items/b5da260733e416085421).

## License

MIT. See [LICENSE](LICENSE).
