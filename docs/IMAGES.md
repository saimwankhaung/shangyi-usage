# README images

All four images in `images/` are rendered from this repository:

```sh
npm run docs:images
```

`scripts/render-docs-images.cjs` starts the app with a temporary demo profile,
opens the usage panel near the bottom of the screen, and fills it with example
numbers (Claude Pro: 0% and 97%; Codex plus: 51% and 27%; updated 51 seconds
ago). The demo banner is hidden for the capture. These are not live account
data. The capture is saved as `images/usage-panel.png`.

The three illustrations are plain HTML pages in `source/`
(`overview.html`, `mascot-controls.html` and `windows-quickstart.html`). The
script loads each page at 1600×900 in an offscreen window and saves a PNG. The
pages use `usage-panel.png`, the mascot poster
(`app/assets/mascot/poster.png`) and the ShanGyi logo. To change wording or
layout, edit the HTML and run the script again.

Run it on Windows with a display at least about 850px tall, so the panel opens
above the mascot. Fonts come from the system (Segoe UI Variable).

No provider logos appear in these images. ShanGyi artwork in them follows the
[Brand Assets License 1.0](../BRAND-ASSETS-LICENSE.md).
