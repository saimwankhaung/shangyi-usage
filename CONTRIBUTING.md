# Contributing

Thanks for helping. Bug reports, translations and pull requests are welcome.

## Before you start

- For a bug, say which version, which Claude source (VS Code extension or
  terminal), and what the panel showed. Never paste tokens, account emails or
  full settings files.
- For a larger change, open an issue first so we can agree on the approach.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Develop

Node.js 22.12 or newer on Windows:

```sh
npm ci
npm test          # unit tests
npm run smoke     # offscreen UI test with demo data and a temporary profile
npm run package   # portable build in dist/
```

`npm run smoke` must pass before a pull request is merged. If you change the
panel or the README illustrations, run `npm run docs:images` and commit the
new images (see [docs/IMAGES.md](docs/IMAGES.md)).

Keep the style of the surrounding code: CommonJS, no new runtime dependencies
unless there is no reasonable alternative, and text inserted with
`textContent`, never `innerHTML`.

## Rules for this project

- Never add an AI prompt or chat turn to read usage.
- Never read or store tokens, cookies, passwords, prompts or transcripts.
- Do not add Anthropic, OpenAI or other provider logos. Name providers in
  plain text only (see [ASSETS.md](ASSETS.md)).
- New UI text needs English, Burmese and Thai strings in
  `app/renderer/i18n.js`.

## Licensing of contributions

Code you contribute is released under the [MIT License](LICENSE). The ShanGyi
mascot, logo and icons are covered by the separate
[Brand Assets License](BRAND-ASSETS-LICENSE.md); please don't submit changes
to that artwork.
