# GhostTerm

[繁體中文](README.zh-TW.md)

Control [Claude Code](https://docs.anthropic.com/en/docs/claude-code) from your phone. A mobile-optimized web terminal that connects to your PC over [Tailscale](https://tailscale.com/).

No cloud relay, no port forwarding, no account needed. Your terminal stays on your machine — your phone just drives it.

<p align="center">
  <img src="screenshots/terminal.jpg" width="270" alt="Terminal view">
  <img src="screenshots/claude-menu.jpg" width="270" alt="Claude menu">
  <img src="screenshots/pixel-office.jpg" width="270" alt="Pixel office">
</p>

## Why

Claude Code is a CLI tool. If you're away from your desk — on the couch, in bed, commuting — you can't use it. GhostTerm gives you a full terminal on your phone with controls designed for touch.

**The killer feature**: tap the `claude` button to launch Claude Code with `--dangerously-skip-permissions`, so it runs fully autonomously — no permission prompts to tap through. You're remote-controlling an AI agent from your phone while it codes on your PC.

## Features

- **Full terminal** — xterm.js with touch-friendly D-pad, quick buttons (y/n/Enter/Tab/Esc), and text input
- **Claude Code integration** — one-tap launch with `--dangerously-skip-permissions` toggle for fully autonomous coding sessions
- **Multi-session** — up to 4 Claude Code sessions running simultaneously, switch instantly
- **Smart reconnect** — delta sync on reconnect, no screen flicker (switch apps on your phone, come back, everything's still there)
- **File upload** — take a photo or pick a file from your phone, it lands on your PC. Paste the path into Claude Code with one tap
- **Screenshot** — capture the terminal to your PC
- **Pixel office** — cute ghost animations that show what each session is doing (idle, busy, waiting, error)
- **PWA** — add to home screen for a native app feel
- **iOS keyboard handling** — solved all the Safari viewport quirks so the keyboard just works

<p align="center">
  <img src="screenshots/ghost-celebrate.jpg" width="400" alt="Ghost party celebration">
</p>

## Prerequisites

1. **[Tailscale](https://tailscale.com/)** on both your PC and phone (free for personal use)
2. **Node.js** 18+ on your PC
3. **Claude Code** on your PC (`npm install -g @anthropic-ai/claude-code`)

## Tailscale setup (if you haven't used it before)

Tailscale creates a private encrypted network between your devices. No port forwarding, no firewall config needed.

1. **Sign up** at [tailscale.com](https://tailscale.com/) (free for personal use, up to 100 devices)

2. **Install on your PC**
   - Windows: download from [tailscale.com/download](https://tailscale.com/download) and run the installer
   - macOS: `brew install tailscale` or download from the website
   - Linux: `curl -fsSL https://tailscale.com/install.sh | sh`

3. **Install on your phone**
   - iOS: [App Store](https://apps.apple.com/app/tailscale/id1470499037)
   - Android: [Google Play](https://play.google.com/store/apps/details?id=com.tailscale.ipn)

4. **Log in on both devices** with the same account (Google, Microsoft, or GitHub)

5. **Verify** — on your PC, run:
   ```bash
   tailscale ip
   ```
   You should see an IP like `100.x.x.x`. This is your Tailscale IP. Your phone can reach this IP from anywhere — home WiFi, mobile data, coffee shop, doesn't matter.

That's it. Your phone and PC are now on the same private network.

## Setup

```bash
git clone https://github.com/chengwaye/ghostterm.git
cd ghostterm
npm install
npm start
```

On startup you'll see:

```
=================================
  Claude Remote Control
=================================
  Local:  http://localhost:3777
  Mobile: http://100.x.x.x:3777
=================================

Scan with your phone:
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
█ ▄▄▄▄▄ █ █ ...
```

Scan the QR code with your phone, or type the Mobile URL into your phone's browser.

> **Tip**: On iOS, tap Share > Add to Home Screen to use it as a full-screen app.

## Using Claude Code with GhostTerm

1. Tap the **`claude`** button at the bottom-left — a menu pops up:
   - **`--dangerously-skip-permissions: ON/OFF`** — toggle at the top. When ON, Claude Code runs without asking for permission on every file edit, command, etc. This is the recommended mode for remote use, since tapping "y" on every prompt from your phone gets tedious fast.
   - **New Session** — start a fresh Claude Code session
   - **Resume** — resume your last conversation
   - **Continue** — continue with previous context

2. Type your prompt in the input bar at the bottom and tap **Send**

3. Use **y** / **n** buttons for quick confirmation, **↑↓←→** for navigation, **Tab** and **Shift+Tab** to cycle through Claude Code's UI

4. You can run **up to 4 sessions** simultaneously — each one gets its own ghost in the pixel office header. Tap the `+` buttons at the top to create new sessions.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3777` | Server port |
| `ACCESS_CODE` | _(none)_ | Optional passcode to protect access |

```bash
ACCESS_CODE=mysecret npm start
```

## How it works

```
Phone (Safari/Chrome)          Tailscale VPN           Your PC
┌─────────────────┐      ┌──────────────────┐    ┌──────────────┐
│  xterm.js +     │◄────►│  Encrypted       │◄──►│  server.js   │
│  touch controls │      │  WireGuard tunnel│    │  + node-pty  │
│  (Socket.IO)    │      │                  │    │  + Express   │
└─────────────────┘      └──────────────────┘    └──────────────┘
```

- `server.js` spawns real PTY sessions via `node-pty`
- Socket.IO streams terminal I/O between phone and PC
- Delta sync: on reconnect, only the missed bytes are sent (no full refresh)
- Server auto-detects your Tailscale IP and binds only to it

## Security

- **LAN only** — binds to Tailscale IP, not `0.0.0.0`. Not accessible from the public internet
- **No cloud** — direct encrypted connection via WireGuard (Tailscale)
- **Optional passcode** — set `ACCESS_CODE` to require a code on connect
- **No data leaves your network** — terminal I/O stays between your phone and PC

## Platform support

- **Server**: Windows, macOS, Linux (anywhere `node-pty` works)
- **Client**: iOS Safari, Android Chrome, any mobile browser
- Best tested on iOS Safari — all viewport/keyboard quirks are handled

## License

MIT
