# Kimily

**Kimily** is a calm, customizable Dynamic Island & AI companion for Windows (built with Tauri, Rust, and Svelte 5).

It gathers everything that asks for your attention into one quiet place at the top of your screen — AI chat, focus timer, tasks, quick notes, clipboard history with secret protection, file shelf, live weather, music controls, calendar countdowns, and coding agents.

## Highlights

- **Dynamic Island for Windows** — sleek collapsible pill with live clock/date, weather, media controls & progress bar, active agent status, and upcoming calendar event countdowns.
- **Expressive Avatar & Island Themes** — animated orb with depth lighting, mood rings, accessories, sound effects, and 4 themes (*Obsidian*, *Smoked Glass*, *Tinted*, *Light*).
- **Focus & Pomodoro Timer** — presets (`5m`, `15m`, `25m`, `45m`), custom `MM:SS` countdown, optional focus goal, and live progress right in the closed pill.
- **Tasks (`Aufgaben`)** — quick task capture with due dates, overdue highlights, and completion animations.
- **Notes, Clipboard History & Pinned Snippets** — auto-saved scratchpad, 1-click pinned snippets, and background clipboard history with automatic password/API-key filtering and a pause toggle.
- **File Shelf (`Ablage`)** — drag-and-drop staging tray for files and images with 1-click "Ask Kimily".
- **Selectable Panel Sizes & Customizable Tabs** — pick Compact / Medium / Large / Full and toggle any Island tab on or off in Settings.
- **Multilingual UI** — English, German (`de`), Dutch (`nl`), French (`fr`), and Spanish (`es`).

## Building (Windows)

```powershell
cd apps/tauri
npm install
npm run build
cd src-tauri
cargo build --release --jobs 1
```

## License & Attribution

MIT License — see [`LICENSE`](LICENSE).  
Based on [Nook](https://github.com/IAMichan/Nook) by Michan van der Hoek.
