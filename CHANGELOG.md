# Changelog

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
