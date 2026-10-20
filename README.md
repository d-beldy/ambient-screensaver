# Ambient Screensaver

A custom Steam screensaver for the Steam Deck (and Big Picture mode) that cycles through your
library's banners — Steam games and non-Steam shortcuts alike — with a smoothed edge fade and a
background glow that matches each banner's colors. A companion [Decky Loader](https://decky.xyz)
plugin feeds it live data from Steam and exposes its settings in the Quick Access menu.

The screensaver, the plugin, and this README were written by [Claude Code](https://claude.com/claude-code),
directed by me (the repo owner) over a chat session — including the reverse-engineering of the
stock screensaver's layout/timing via Chrome DevTools Protocol described below.

It's two pieces that ship together:

- `screensaver/ambient/` — the screensaver itself. Plain HTML/CSS/JS, no build step, lives under
  `~/.steam/root/config/uioverrides/screensavers/`.
- `plugin/` — a Decky Loader plugin. Its Python backend queries Steam's own library data over
  the local CDP debug port and writes `manifest.js` / `settings.js` into the screensaver's
  folder; its frontend is a settings panel in the Decky quick-access menu.

## How it differs from the stock screensaver

- **Background glows with the banner's color** instead of plain black behind the edges.
- **Smoothed edge fade.** The stock screensaver's vignette is a sharp 4-stop gradient; this one
  uses a ~25-stop eased curve for a softer falloff.
- **Shows non-Steam shortcuts reliably.** Banner/logo art is resolved the same way Steam itself
  does — your own grid art overrides first, then Steam's downloaded library cache (including the
  content-hash-nested copies Steam sometimes uses) — so shortcuts with custom artwork show up
  correctly instead of being silently skipped.
- **Configurable.** The stock screensaver has no options screen at all. This one has a settings
  panel in Decky: ambient glow on/off, rotate only your 20 most recent games or your whole
  library, how long each banner stays up, crossfade duration, and which corner the logo sits in.
- **Actually randomized.** Rotation order is shuffled, reshuffled every lap instead of looping
  the same order forever, and guards against the same game repeating back-to-back across laps.
- **Settings apply live.** Change something in the Decky panel and the backend rebuilds its data
  immediately instead of waiting out a polling interval.

The letterboxed banner layout, logo size/position, and the zoom curve during each banner's
display were all measured live off the real stock screensaver (via Chrome DevTools Protocol) so
this one sits and moves the way the original does — the differences above are deliberate, not
places where it drifted from the original by accident.

## Install

Grab [**AmbientScreensaver.zip**](https://github.com/d-beldy/ambient-screensaver/releases/latest)
from the latest release and extract it — it contains two folders, already named and laid out
for where they need to go:

1. Copy `ambient/` to `~/.steam/root/config/uioverrides/screensavers/ambient/` on the Deck
   (create the `uioverrides`/`screensavers` folders if they don't exist yet).
2. Copy `ScreensaverAmbientColor/` to `~/homebrew/plugins/ScreensaverAmbientColor/` (Decky
   Loader's plugins folder). `plugin.json` and `package.json` need to end up owned by `root:root`
   — if a plain
   copy leaves them owned by your user, `sudo chown root:root` them, then
   `sudo systemctl restart plugin_loader.service`.
3. In Gaming Mode: Decky menu → Plugins → enable **Screensaver Ambient Color**, and separately
   pick **Ambient** under Settings → Customization → Screensaver.

## Settings

Open the Decky Loader quick-access menu → **Ambient Screensaver**:

| Setting | What it does |
|---|---|
| Ambient color | Background glow matches the banner, instead of plain black |
| Whole library | Rotate every game with cached art, instead of just the 20 most recent |
| Duration | Seconds each banner stays on screen |
| Transition | Crossfade duration between banners |
| Logo position | Left / center / right |

There's no manual config file to edit — these persist through the plugin and get pushed to the
screensaver automatically.

## How it works

The screensaver itself can't query Steam's library (no `SteamClient` API inside a custom
screensaver's isolated page), so the plugin's backend does it for it: it finds Steam's own CDP
debug target, asks `collectionStore` for the `recent` or full library collection (the same data
Steam's own UI uses — this is also how non-Steam shortcuts show up, since it's keyed by a
shortcut-specific `app_type` sentinel, not by launch history), resolves each game's banner/logo
art on disk, samples each banner's average color with `ffmpeg`, and writes the result as two
plain `<script>`-loaded files (`manifest.js`, `settings.js`) into the screensaver's own folder.
The screensaver just reads those at load time — it has no network access or Steam API of its own.

## Building the plugin frontend

```sh
cd plugin-src
pnpm install
pnpm run build
cp dist/index.js dist/index.js.map ../plugin/dist/
```

`plugin-src/` is a decky-plugin-template checkout; `plugin/` is the trimmed-down folder that
actually gets deployed to the Deck. Keep `plugin/main.py` and `plugin-src/main.py` identical —
only `plugin/` is copied over.
