# Daywise – Structure Your Daily Notes in Obsidian

Daywise is an open‑source Obsidian plugin that converts freeform daily notes into a consistent, readable Markdown table. It supports two providers:

- Local: an offline parser requiring no API key
- Gemini: higher‑quality formatting via Google Generative Language API (user‑supplied API key)

The plugin is designed for users who keep daily logs for journaling, time tracking, or productivity and want a structured summary without changing how they write.

---

## Features

- Convert unstructured logs into a Markdown table: `Time | Activity | Notes`
- Detect times, time ranges (e.g., “till 5:20 PM”), and simple durations (e.g., `[2hrs]`)
- Two processing modes: Local (offline) or Gemini (cloud)
- Append the generated summary to the end of the current note
- Configurable header before the summary
- Clear error messages and retry handling for transient Gemini API errors

---

## Example

Input (freeform):

```
Awake at 7:30
Classes till 3:30 PM
In Library till 5:20 PM - Arranged ARC browser tabs! [2hrs]!!!
Then went to mess
Then in room rn at 7 PM
```

Output (generated summary appended to the note):

```markdown
---
### Daily Summary

| Time        | Activity         | Notes                     |
|-------------|------------------|---------------------------|
| 7:30 AM     | Wake Up          | -                         |
| 8:00–3:30 PM| Classes          | -                         |
| 3:30–5:20 PM| Library          | Arranged ARC browser tabs |
| 5:30 PM     | Dinner (Mess)    | -                         |
| 7:00 PM     | In Room          | -                         |
```

---

## Installation

### Method 1: Manual

1. Download or clone this repository.
2. In the plugin folder, install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
4. Copy the following files to your vault:
   ```
   <your-vault>/.obsidian/plugins/daywise/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```
5. Enable Daywise in Obsidian → Settings → Community Plugins.

### Method 2: Development

If you want hot‑reload during development:

```bash
npm install
npm run dev
```

Load the plugin as a development plugin from your local folder. Obsidian will rebuild and reload on file changes.

---

## Usage

1. Open a daily note containing raw, freeform entries.
2. Run the command: “Generate Daily Summary from Note”.
3. A summary table is appended at the end of the note. You can optionally include a header via settings.

---

## Settings

- Provider: Local or Gemini
- Gemini API Key: Your key from Google AI Studio (required only for Gemini)
- Model: Defaults to `gemini-1.5-flash`. You can set another available model
- Add header before table: Toggle whether to insert a “Daily Summary” heading before the output

Notes:
- Local mode works offline and requires no configuration.
- Gemini mode sends the note content to Google’s Generative Language API over HTTPS.

---

## Providers

### Local (offline)
- Heuristic parser for common patterns in daily logs
- Detects times, ranges (“till / to”), and bracketed durations (e.g., `[2hrs]`)
- Produces a Markdown table immediately on‑device

### Gemini (cloud)
- Endpoint: `https://generativelanguage.googleapis.com/v1/models/{model}:generateContent`
- Requires your own API key from Google AI Studio
- Retries on 429/503, surfaces HTTP and safety‑block errors in Obsidian notices

---

## Privacy

- Local provider: no network calls; all processing occurs locally.
- Gemini provider: note content is sent to Google’s API via HTTPS. Your API key is stored locally in your vault. No analytics or telemetry are collected by this plugin.

---

## Project Structure

```
my-daily-summary-plugin/
├── main.ts              # Plugin logic (command, settings, providers, local fallback)
├── manifest.json        # Obsidian plugin manifest
├── styles.css           # Optional styling
├── esbuild.config.mjs   # Bundler configuration
├── package.json         # Build and dependency config
├── tsconfig.json        # TypeScript config
└── README.md            # This file
```

---

## Contributing

Contributions are welcome. To work on the plugin:

1. Fork the repository
2. Create a feature branch
3. Ensure the plugin builds successfully:
   ```bash
   npm run build
   ```
4. Open a pull request with a clear description of the change

Please review the Obsidian plugin development documentation and follow TypeScript best practices.

---

## License

This project is licensed under the MIT License.
