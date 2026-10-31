# Changelog

## 0.1.7 — 2026-11-01

- macOS: the widget now stays on top of full-screen apps and on every Space
  (desktop) while "Always on top" is on. It is a floating panel there, so a
  full-screen app no longer hides it.
- The usage panel prefers to open above or below the mascot. On laptop-height
  screens, where the full panel does not fit there, it opens a little shorter
  (and scrolls) instead of jumping to the side; it only goes beside the mascot
  when there is really no room above or below. The mascot still never moves.
- macOS builds (Apple Silicon and Intel) are attached as a preview. They are not
  signed by Apple yet: the first time, allow the app in System Settings →
  Privacy & Security → Open Anyway.

## 0.1.6 — 2026-10-15

First public release.

- The mascot stays where you put it when the usage panel opens or closes.
  The panel opens above the mascot, or below or beside it when there is no
  room, so a mascot near the top of the screen no longer drops down.
- Opening and closing the panel is animated: it grows out of the mascot with a
  gentle spring and shrinks back into it. Reduced-motion settings turn this off.
- With the panel open, dropping the mascot keeps the panel on its side while
  it still fits and moves it to another side when it does not.
- The compact-mode button moved into the panel header.
- Provider logos are removed. Claude and Codex are shown by name with neutral
  icons, and the README images are re-rendered from the app without logos
  (`npm run docs:images`).
- Burmese: reset countdowns and "updated … ago" are now in Burmese, and the
  Settings button label is translated.
- Copyright holder is "ShanGyi". The executable and the VS Code helper carry
  version, company and copyright details.
- Docs: independence notice, SmartScreen and checksum notes, a warning to keep
  the app folder while the VS Code bridge is connected, removal steps, and
  SECURITY.md / CONTRIBUTING.md.

## 0.1.5

- Larger text and logo padding.
- Small pointer movement still counts as a mascot click.
- The compact mascot responds to quick clicks.
- The panel renders before preferences finish saving.
- Illustrated instructions are included in every build.
