# Pomo 🍅

**A floating flowtime/pomodoro timer for macOS that never gets in your way — and never disappears.**
作業画面を一切邪魔しない。でも、ちゃんとそこにいる。フローティング・ポモドーロタイマー。

- **Flowtime mode** — work as long as you're in flow, counting *up*. Stop when you're done: your break is auto-calculated from how long you worked (default 1/5 — work 45 min, rest 9 min). The banked break is shown live while you work.
- **Follows you everywhere** — the frosted-glass panel floats above every Space *and* other apps' fullscreen windows (NSPanel + `.fullScreenAuxiliary`, no private APIs), without ever stealing keyboard focus.
- **Three-stage presence** — hover: full controls / idle: just the digits / focused: fades to 30% so it melts into your screen. Hover brings it back instantly.
- **Fullscreen break mode** — when a break starts, all displays dim with a slow breathing glow and a countdown. Skip has a 3-second cooldown (evidence-based friction); it auto-defers while your mic is in use so it never crashes your meeting.
- **Records, not judgement** — sessions land in a plain JSONL file with optional memos. A simple dashboard shows today's timeline and a 7-day chart. No streaks, no scores, no guilt.
- **An API your AI can use** — a token-authenticated localhost HTTP API (`127.0.0.1:51766`). Claude Code (or any script) can start sessions, attach memos like "implemented the parser", and read your stats. See [CLAUDE.md](CLAUDE.md).
- **Local only** — no account, no subscription, no telemetry, no network egress. Free.

## Install

Requires macOS 14+ and Xcode command line tools (`xcode-select --install`).

```sh
git clone https://github.com/imutaakihiro/pomo.git
cd pomo
./scripts/install.sh   # builds and installs to /Applications, then launches
```

Pomo lives in your menu bar (🍅). There is no Dock icon by design.

## Use

| Action | How |
|---|---|
| Start working | Click ▶ on the panel, menu bar 🍅 → 作業を開始, `⌃⌥P`, or `./scripts/pomo start` |
| End work → start break | Click the ☕️ pill on the panel (it shows the break you've banked) |
| Show / hide the panel | `⌃⌥T` |
| Attach a memo | 🍅 → この作業にメモを付ける…, or `./scripts/pomo memo "writing docs"` |
| See your records | 🍅 → きろくを開く |

Settings (mode, break ratio, focus opacity, fullscreen break, sounds, launch at login) all live in the 🍅 menu.

## Data

One line per session, yours to analyze:

```
~/Library/Application Support/Pomo/sessions.jsonl
```

The format is BigQuery-loadable newline-delimited JSON as-is.

## License

[MIT](LICENSE)
