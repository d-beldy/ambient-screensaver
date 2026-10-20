import asyncio
import glob
import json
import os
import random
import subprocess

import aiohttp
import decky  # type: ignore

# Decky's backend runs as root, so HOME doesn't point at /home/deck — hardcode the path.
STEAM_ROOT = "/home/deck/.local/share/Steam"
USERDATA_ID = "124072891"
GRID_DIR = f"{STEAM_ROOT}/userdata/{USERDATA_ID}/config/grid"
LIBRARYCACHE_DIR = f"{STEAM_ROOT}/appcache/librarycache"
SCREENSAVER_DIR = f"{STEAM_ROOT}/config/uioverrides/screensavers/ambient"
CACHE_DIR = f"{SCREENSAVER_DIR}/cache"
MANIFEST_PATH = f"{SCREENSAVER_DIR}/manifest.js"
SETTINGS_SCRIPT_PATH = f"{SCREENSAVER_DIR}/settings.js"
SETTINGS_FILE_PATH = f"{decky.DECKY_PLUGIN_SETTINGS_DIR}/settings.json"

RECENT_MAX_GAMES = 20
ALL_MAX_GAMES = 500  # library-wide scope — just a sanity ceiling, not a real target count.

DEFAULT_SETTINGS = {
    "mode": "ambient", "scope": "recent", "duration": 12, "transitionDuration": 1.5,
    "logoAlign": "left",  # matches the default screensaver's own logo placement
}

# appid -> (hero mtime, "rgb(r,g,b)") — avoids re-running ffmpeg every tick for unchanged art.
_color_cache = {}


def load_settings():
    try:
        with open(SETTINGS_FILE_PATH, encoding="utf-8") as f:
            return {**DEFAULT_SETTINGS, **json.load(f)}
    except (OSError, json.JSONDecodeError):
        return dict(DEFAULT_SETTINGS)


def save_settings(settings):
    os.makedirs(os.path.dirname(SETTINGS_FILE_PATH), exist_ok=True)
    with open(SETTINGS_FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(settings, f)
    write_settings_script(settings)


def write_settings_script(settings):
    os.makedirs(SCREENSAVER_DIR, exist_ok=True)
    with open(SETTINGS_SCRIPT_PATH, "w", encoding="utf-8") as f:
        f.write(f"const AMBIENT_SETTINGS = {json.dumps(settings)};\n")


# Collection id for each scope — same system collections the Steam UI itself uses.
SCOPE_COLLECTION = {"recent": "recent", "all": "all-apps-alpha"}


async def fetch_appids(session, scope):
    """Steam's own collections — unlike localconfig.vdf's LastPlayed, these also include
    non-Steam shortcuts. app_type 1 is a real game, 1073741824 is a non-Steam shortcut;
    everything else (2=application, 4=tool like Proton, 8=demo, ...) gets filtered out."""
    collection_id = SCOPE_COLLECTION.get(scope, "recent")
    async with session.get("http://127.0.0.1:8080/json", timeout=aiohttp.ClientTimeout(total=3)) as resp:
        targets = await resp.json()
    target = next((t for t in targets if t.get("title") == "SharedJSContext"), None)
    if not target:
        return None

    async with session.ws_connect(target["webSocketDebuggerUrl"], timeout=5) as ws:
        await ws.send_json({"id": 1, "method": "Runtime.evaluate", "params": {
            "expression": (
                f"JSON.stringify(window.collectionStore.GetCollection({json.dumps(collection_id)})"
                ".visibleApps.filter(a => a.app_type === 1 || a.app_type === 1073741824)"
                ".map(a => a.appid))"
            ),
            "returnByValue": True,
        }})
        async with asyncio.timeout(5):
            async for msg in ws:
                data = json.loads(msg.data)
                if data.get("id") == 1:
                    return json.loads(data["result"]["result"]["value"])
    return None


def find_asset(appid, kind):
    """Prefers the user's own grid/ overrides (set via "Edit Steam Artwork" or a tool like
    SteamGridDB) — matching what the default screensaver itself shows — and falls back to
    Steam's own downloaded library cache for games the user never customized. grid/ is also
    the only source for non-Steam shortcuts, which have no store page to download from.

    Steam sometimes stores the library-cache asset flat (<appid>/logo.png) and sometimes
    nested under a content-hash folder (<appid>/<hash>/logo.png, the same hash the default
    screensaver's own <img> src uses) — check both."""
    filename = "library_hero.jpg" if kind == "hero" else "logo.png"
    grid_path = f"{GRID_DIR}/{appid}_{kind}.png"
    if os.path.isfile(grid_path):
        return grid_path

    flat_path = f"{LIBRARYCACHE_DIR}/{appid}/{filename}"
    if os.path.isfile(flat_path):
        return flat_path

    nested = glob.glob(f"{LIBRARYCACHE_DIR}/{appid}/*/{filename}")
    return nested[0] if nested else None


def symlink_into_cache(appid, kind, src):
    # Clear any stale link for this appid+kind under a different extension — otherwise a
    # source flip (e.g. grid/ override added after librarycache was already picked) leaves
    # two symlinks around and main.js keeps using whichever one manifest.js names.
    for ext in (".png", ".jpg"):
        stale = f"{CACHE_DIR}/{appid}_{kind}{ext}"
        if os.path.lexists(stale) and (not src or os.readlink(stale) != src):
            os.remove(stale)

    if not src:
        return None
    link_name = f"{appid}_{kind}{os.path.splitext(src)[1]}"
    link = f"{CACHE_DIR}/{link_name}"
    if not os.path.islink(link):
        os.symlink(src, link)
    return f"cache/{link_name}"


def average_color(appid, path):
    mtime = os.path.getmtime(path)
    cached = _color_cache.get(appid)
    if cached and cached[0] == mtime:
        return cached[1]

    # Downscaling to 1x1 is the cheapest way to get an average color without a Pillow
    # dependency — ffmpeg is already present on SteamOS.
    raw = subprocess.run(
        ["ffmpeg", "-y", "-i", path, "-vf", "scale=1:1:flags=area",
         "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, timeout=10, check=True,
    ).stdout
    r, g, b = raw[:3]
    color = f"rgb({r},{g},{b})"
    _color_cache[appid] = (mtime, color)
    return color


async def build_manifest(session, settings):
    scope = settings.get("scope", "recent")
    appids = await fetch_appids(session, scope)
    if not appids:
        return  # Steam not ready yet (or query failed) — keep the last known-good manifest.

    if scope == "all":
        # Alphabetical order would otherwise bias the cap toward "A"-titles — shuffle before
        # truncating so every game has an equal chance of making the cut.
        random.shuffle(appids)
    max_games = RECENT_MAX_GAMES if scope == "recent" else ALL_MAX_GAMES
    os.makedirs(CACHE_DIR, exist_ok=True)

    games = []
    for appid in appids[:max_games]:
        appid = str(appid)
        hero_src = find_asset(appid, "hero")
        if not hero_src:
            continue
        try:
            ambient = average_color(appid, hero_src)
        except Exception as e:
            decky.logger.error(f"[ScreensaverAmbientColor] color sample failed for {appid}: {e}")
            ambient = None

        games.append({
            "appid": appid,
            "hero": symlink_into_cache(appid, "hero", hero_src),
            "logo": symlink_into_cache(appid, "logo", find_asset(appid, "logo")),
            "ambient": ambient,
        })

    # Deliberately not pruning cache/ symlinks for games that drop out of rotation: an
    # already-running screensaver session keeps its own manifest.js snapshot in memory and
    # would 404 on art deleted out from under it, desyncing hero/logo pairing mid-rotation.
    # The symlinks are a few bytes each — leaving stale ones costs nothing.
    tmp_path = MANIFEST_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(f"const AMBIENT_GAMES = {json.dumps(games)};\n")
    os.replace(tmp_path, MANIFEST_PATH)


class Plugin:
    async def _main(self):
        self._running = True
        self._settings = load_settings()
        write_settings_script(self._settings)
        self._wake = asyncio.Event()
        self._task = asyncio.create_task(self._loop())

    async def _unload(self):
        self._running = False
        task = getattr(self, "_task", None)
        if task:
            task.cancel()

    async def get_settings(self) -> dict:
        return self._settings

    async def set_settings(self, settings: dict) -> None:
        self._settings = {**self._settings, **settings}
        save_settings(self._settings)
        self._wake.set()  # rebuild now instead of waiting out the rest of the 60s tick

    async def _loop(self):
        async with aiohttp.ClientSession() as session:
            while self._running:
                try:
                    await build_manifest(session, self._settings)
                except Exception as e:
                    decky.logger.error(f"[ScreensaverAmbientColor] manifest build failed: {e}")
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=60)
                except asyncio.TimeoutError:
                    pass
                self._wake.clear()
