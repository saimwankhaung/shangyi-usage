# Security

## Reporting a vulnerability

Please report security problems privately through GitHub:
open the repository's **Security** tab and choose **Report a vulnerability**.
Do not open a public issue for a vulnerability. Include the version, what you
did, and what happened. You should get a first reply within a week.

Only the latest release receives fixes.

## What the app touches

ShanGyi Usage runs locally. It has no server, analytics or telemetry, and it
never sends an AI prompt to read usage.

- **Codex:** starts the Codex CLI's `app-server` and reads account and rate
  limit data over its JSON-RPC interface. The CLI keeps its own sign-in.
- **Claude (VS Code source):** starts the Claude Code CLI in config-only mode
  and asks for account usage and the plan name. Account identifiers and
  authentication data in the reply are discarded.
- **Optional VS Code bridge:** sets `claudeCode.claudeProcessWrapper` in your
  VS Code user settings to `ShanGyiClaudeBridge.exe`, which forwards Claude
  Code's input and output unchanged and saves only quota fields.
- **Optional terminal bridge:** sets Claude Code's `statusLine` to a local
  PowerShell script that saves only quota fields, the model name and a time.

Saved data lives in `%APPDATA%\ShanGyi Usage`: settings, quota snapshots,
reminder history and backups of the settings it replaced. The app does not
read OAuth tokens, cookies, passwords, prompts or chat transcripts.

## Hardening in place

- The renderer runs with `sandbox`, `contextIsolation`, no Node integration, a
  strict Content Security Policy (`connect-src 'none'`), blocked navigation and
  new windows, and all permission requests denied.
- Provider text is inserted as text, never as HTML.

## Known limits

- The Windows executables are not code-signed.
- Electron fuses are left at their defaults. `RunAsNode` is needed by
  `Setup VS Code Bridge.cmd`, which runs the bundled setup script with
  `ELECTRON_RUN_AS_NODE=1`.
- Anyone who can run programs as your Windows user can also change the files
  the app reads and writes; the app does not defend against that.
