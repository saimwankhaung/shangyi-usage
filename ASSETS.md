# ShanGyi mascot assets

The mascot in this build is the project owner's supplied ShanGyi 3D toon
animation, from `Mascot/3D/stickers_toon`. It is not newly generated art.

Seven transparent WebM reactions are included: Idle Happy, Hi Wave, Thinking,
Sleep, Celebrate, Confused, and Thumbs Up. The poster is a still frame from the
same supplied toon animation. The tray/window icon is rendered from the
owner's supplied lime ShanGyi vector logo, without changing the mark.

The MIT source-code license does not apply to these brand assets. They are
licensed under the [ShanGyi Brand Assets License 1.0](BRAND-ASSETS-LICENSE.md):
ordinary personal/internal app use and free non-commercial redistribution
are allowed. Commercial asset reuse or resale of a distribution containing
these assets is not allowed. Commercial versions must replace the ShanGyi
mascot, logo, icons, and branding. Source code remains MIT licensed.

The ShanGyi mark, `app/assets/logos/shangyi.svg`, comes from the owner's
`shan-gyi-secure-passage-transparent.svg`. Only the artboard whitespace is
tightened for use at icon size; the path and color are unchanged. It is covered
by the ShanGyi Brand Assets License.

## Provider names, no provider logos

Claude and Codex are identified by name, in plain text. Their logos are not
bundled: Anthropic's [trademark guidelines](https://www.anthropic.com/legal/trademark-guidelines)
and OpenAI's [brand page](https://openai.com/brand/) both require written
permission for logo use in third-party products. Each provider card instead
shows a neutral line icon drawn for this app (a chat bubble for Claude and a
terminal prompt for Codex). These icons are part of the MIT-licensed source.

Claude and Codex remain the names and marks of their respective owners.
ShanGyi Usage is an independent project and is not affiliated with, endorsed
by, or sponsored by Anthropic or OpenAI.

## README images

The images in `docs/images/` are rendered by `npm run docs:images`
([how they are made](docs/IMAGES.md)). The usage panel is captured from the
running app with example numbers; it is not live account data or a fixed
quota. The illustrations combine that capture with the ShanGyi mascot poster
and logo, so ShanGyi artwork in them follows the same Brand Assets License.
Commercial forks must replace these images as well as the application assets.

## Replacing assets for commercial distributions

Replace all seven WebM files and `poster.png` in `app/assets/mascot/` using the
same filenames. Use a character without the ShanGyi emblems on its clothing
or headphones. Also replace `app/assets/logos/shangyi.svg`, `app/assets/icon.png`,
and `app/assets/icon.ico`. Keep transparent backgrounds for the desktop
companion. Change the product name in `package.json`, the main process,
renderer, packaging metadata, and documentation; replace any bundled ShanGyi
marketing artwork, including `docs/images/`. Retain MIT code copyright notices.

Do not ship local asset source paths, private account data, or the original
Blender working directory.
