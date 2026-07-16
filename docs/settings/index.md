# Settings Breakdown

Nuvio's settings allow for deep customization. Below is a detailed breakdown, noting differences between the **Mobile** and **Android TV** versions.

> [!IMPORTANT]
> Anything not labeled [Android TV Only] or [Mobile Only] is a feature of both versions.

## 1. General & UI
| Setting | Mobile | Android TV |
| :--- | :--- | :--- |
| **Theme** | Select custom accent color palettes (White, Crimson, Ocean, Violet, Emerald, Amber, Rose). Toggle **AMOLED Black** to use pure black backgrounds for OLED screens. | Select custom accent color palettes (White, Crimson, Ocean, Violet, Emerald, Amber, Rose). Toggle **AMOLED Mode** and **Pure Black Surfaces** to use pure black app backgrounds and card surfaces. |
| **Font & Language** | Adjust global App Language overrides. | Adjust global App Font family choices and App Language overrides. |
| **Layout / Home Shelf** | Toggle the **Show Continue Watching** shelf on the Home screen. Select a base home card type: **Card** (TV-style landscape card), **Wide** (info-dense horizontal card), or **Poster** (artwork-first poster card). Toggle **Resume prompt on launch** popups. | Switch home dashboards between Modern View (with dedicated hero panels), Grid View, or Classic View. Toggle Fullscreen Hero Backdrops. Configure auto-collapsing sidebars. |
| **Up Next Behavior** | Configure granular tracking rules: **Prefer Episode Thumbnails**, **Up Next From Furthest Episode** (disable for rewatches to use most recent), **Show Unaired Next Up Episodes**, and **Blur Unwatched** to avoid spoilers. | Configure series playback lines using *Prefer Binge Group* rules, *Reuse Binge Groups*, and variable *Next Episode Threshold Mode* percentages. |
| **Poster Card Style** | Fine-tune card **Width** (Compact, Dense, Standard, Balanced, Comfort, Large) and **Corner Radius** (Sharp, Subtle, Classic, Rounded, Pill) with a real-time pixel size **Live Preview**. Toggle **Landscape Posters** and **Hide labels**. | Fine-tune card Width metrics (Compact to Large), Corner Radius geometries (Sharp to Pill), and hover **Backdrop Expand Delay** timers. Toggle Landscape Posters. |

[Back to top](#settings-breakdown)

## 2. Playback: [View Playback Guide](player.md)
- **Internal Player:** Highly recommended for most users. Supports hardware decoding.
  - *Internal Engine:* Manually choose between ExoPlayer or libmpv as the primary background media core.
  - *Auto-switch engine on startup error* [Android TV Only]: Automatically falls back from ExoPlayer to libmpv for detected anime or if an initialization failure occurs.
- **External Player:** Useful if you encounter codec issues. Nuvio can pass the stream to VLC, MX Player, or JustPlayer.
- **Hardware Acceleration:** Toggle this if you experience stuttering on older devices.
- **Auto-Play Next:** Automatically start the next episode in a series.
- **Intro and Outro Skip:** Prioritizes segment database filters across IntroDB, AniSkip, and Anime Skip. Includes automated community timestamp submission tools [Mobile Only] alongside custom parental guidance Content Warnings and automated segment skipping filters [Android TV Only].
- **Stream Selection & Auto-Play:** Configures connection handshakes using *Reuse Last Link*, *Last Link Cache Duration* thresholds, explicit *Selection Modes* (Auto-play first source, Manual list, or custom Regex text matching), scraper *Timeout* settings, and granular *Filtering Scopes* for plugins/addons.
- **Binge Watching Options:** Customizes automated series playback chains via *Prefer Binge Group* rules, *Reuse Binge Groups*, variable *Next Episode Threshold Mode* percentages, and idle security prompts via *Are You Still Watching?* [Android TV Only].
- **Subtitle and Audio Preferences:** Locks primary and secondary multi-track audio/subtitle languages, filters out non-preferred tracking layers, uses a *Skip Silence* trigger, and offers an *Enable downmix* route to crush multichannel surround sound into clear stereo speaker arrays.
- **Subtitle Layout Adjustments:** Tailors caption scaling sizes, custom text/background color profiles, outline parameters, and *Vertical Offset*. Includes an experimental toggle to deploy the **libass rendering engine** for heavy ASS/SSA dynamic typesetting scripts.
- **Interface & Control Overlays:** Features standard *Loading Overlays* to hide network lag. Includes passive informational *Pause Overlays* [Android TV Only], *OSD System Clocks* [Android TV Only], touchscreen *Hold To Speed / Hold Speed* scaling multipliers, and sliding vertical *Gesture Controls* for volume/brightness [Mobile Only].

[Back to top](#settings-breakdown)

## 3. Account Integrations: [View Integrations Guide](/integrations/)
- **Trakt.tv:** Syncs your "Up Next" list and watch history across all Nuvio devices.
- **TorBox / Premiumize:**
  - Essential for high-quality, buffer-free 4K streams.
  - Requires an API Key or Device Code for authorization.
- **Plugins & Extensions:** Manages third-party scraper repositories globally, allowing integrations via direct URL inputs or mobile QR code syncing codes.
- **TMDB Enrichment Sourcing:** Pulls downstream artwork, textless backdrops, synchronized release countdown metrics, cast crew indices, production networks, and dedicated episode runtimes.
- **MDBList Ratings API:** Connects a custom key to fetch and layer platform rating scores (Trakt, IMDb, TMDB, Letterboxd, Rotten Tomatoes, Audience, and Metacritic) over title dashboard views.
- **Anime Skip Integration:** Authorizes account validation links via an external Client ID to activate accurate crowd-sourced timestamp skipping triggers.

[Back to top](#settings-breakdown)

## 4. Advanced [Android TV Only]: [View Playback Guide](player.md)
- **Decoder Priority:** Dictates processing priorities across *Device decoders only* (strict hardware parsing), *Prefer device decoders* (hardware priority with software fallbacks), or *Prefer app decoders (FFmpeg)* (software processing for legacy formats).
- **Advanced Display Formatting:** Uses standard *DV7 - HEVC Fallback* layers to fix distorted purple/green color rendering profiles. Adds options for *Preserve DV mapping (DV7 to DV8.1)* and *Convert DV5 to DV8.1* matrices.
- **Refresh Rate Switching (AFR):** Automatically matches your TV's refresh rate to the content (e.g., 24fps) to eliminate judder. Configurable as *Off*, *On start*, or *On start/stop* parameters.
- **Tunnelled Playback:** Improves synchronization and reduces overhead on supported Android TV hardware. It sends raw video streams directly to the display chips to optimize heavy 4K HDR playback rendering chains.
- **Force AC-3 Transcoding (Optical/SPDIF):** Live-transcodes heavy modern multichannel sound formats (TrueHD, DTS, AAC) into traditional compressed Dolby Digital 5.1 tracks to maintain output over bandwidth-limited digital optical audio connections.

[Back to top](#settings-breakdown)

## 5. Buffer and Network [Android TV Only]: [View Playback Guide](player.md#buffer-and-network-android-tv-only)
These configurations govern internal memory allocation thresholds, local system caching pools, and network data transit rules. Full detail lives under [Player Settings → Buffer and Network](player.md#buffer-and-network-android-tv-only).

- **ExoPlayer Native Memory:** Relocates the ready-ahead playback buffer into a more efficient area of device memory so high-bitrate streams can maintain larger ahead-buffers without exhausting the app's limited private memory share on TV sticks and boxes. Displays device RAM and a recommended safety limit.
- **Custom Playback Buffers:** Completely overrides stock Media3 parameters with specialized processing limits (works with or without Native Memory):
  - *Min / Max Buffer Duration:* Calibrates the safe minimum and maximum content duration thresholds to cache ahead of the active video cursor position.
  - *Initial Buffer & Buffer After Rebuffer:* Sets the precise buffering depth required before an initialized video stream boots, or when reclaiming feeds after a playback stall.
  - *Back Buffer Duration:* Holds already-viewed stream data inside local system memory arrays to enable instant seek-back actions without re-downloading source content.
  - *Target Buffer Allocations:* Manages device RAM footprints safely via an automated *Managed Memory Budget* filter, or overrides restrictions to unlock manual caching sliders up to 2GB via the *Allow Larger Target Buffer* toggle.
- **Disk Cache Performance:** Establishes fixed storage caching partitions:
  - *VOD Disk Cache:* Saves active downloaded file arrays directly onto internal storage to shield progressive media playback from momentary network drops.
  - *Auto Size:* Automates cache constraints targeting roughly 10% of total available free space, with manual overrides to maintain strict storage headroom margins.
- **Network & P2P Stream Filters:** Deploys a *Custom Network* filter to open parallel download connections for progressive links when a CDN throttles single-connection speed. Independent of Native Memory. Includes *HTTP/2*, *Connection Count*, and *Chunk Size* controls, plus *P2P Streaming* and *Hide torrent stats* overlays. Use **Settings → Advanced → Stream Throughput Diagnostics** to compare baseline vs parallel speeds before leaving multi-connection mode on — see [Stream Throughput Diagnostics](player.md#stream-throughput-diagnostics-advanced-parallel-test).

[Back to top](#settings-breakdown)

## 6. Customization & Management
- **Profiles:** Manage multiple users, watch histories, and recommendations separately. [View Profiles Guide](profiles.md)
- **Collections:** Create deep custom collections grouping media by genre, studio, or custom lists. [View Collections Guide](collections.md).
- **Backup & Synchronization:** Exports or imports compiled application configurations to instantly mirror visual formats, tracking scripts, and engine limits across backup hardware keys.

[Back to top](#settings-breakdown)
