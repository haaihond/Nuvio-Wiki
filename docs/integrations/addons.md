# Addons

Addons are the heart of the Nuvio experience. They provide the content, metadata, subtitles, and functionality that make the app useful. While Nuvio's [plugin](../plugins) system runs scraper Javascript directly on your device, addons are remote web services that communicate with Nuvio using the standard Stremio addon protocol. Nuvio also has its own native debrid integration — a built-in system that resolves torrent hashes through your debrid account without needing an external addon to do it.

>[!WARNING]
> This Wiki does not condone the use of any unlicensed copyrighted material.

>[!NOTE]
>Reminder: This project is not official. Do not contact Nuvio developers regarding issues with this wiki.

---

## addons vs. Plugins

On the surface, both give you streams. Underneath, they operate entirely differently:

| | addons | Plugins |
|---|---|---|
| **Protocol** | Stremio's addon protocol (`catalog`/`meta`/`stream` HTTP endpoints) | Nuvio's own plugin repository format |
| **Where the logic runs** | On the addon developer's remote server | Inside Nuvio, locally on your device |
| **What Nuvio actually does** | Sends an HTTP request, parses the JSON response | Downloads the plugin's code and executes it in a sandboxed QuickJS runtime |
| **Hosting** | Developer's infrastructure (Beamup, a VPS, Cloudflare Workers, ElfHosted) | A manifest file, typically hosted on GitHub |
| **Scope** | Catalogs, metadata, subtitles, live TV, and streams | Streams only |
| **Portability** | Works in any Stremio-protocol client (Stremio, Nuvio, others) | Nuvio-specific |

Addons are recommened to use over plugins.

[Back to top](#addons)

---

## How addons Work

An addon is a web server that responds to HTTP requests defined by the Stremio Addon Protocol.

### The Manifest
Every addon has a `manifest.json` that declares its `id`, `name`, `version`, supported `resources` (e.g., `catalog`, `meta`, `stream`, `subtitles`), and the content `types` it handles (e.g., `movie`, `series`). Nuvio fetches and stores this manifest when you install an addon. Nuvio parses this using its `AddonManifestDto` → `Addon` domain model pipeline, extracting fields like `catalogs`, `resources`, `types`, `idPrefixes`, `behaviorHints`, and an optional `stremioAddonsConfig` block.

### Request Flow
1. You browse to a catalog or open a specific movie/series.
2. Nuvio checks which of your installed addons declared they support that content type and resource.
3. Nuvio makes an HTTP `GET` request to the remote addon server (e.g., `/stream/movie/tt1234567.json`).
4. The addon server performs its own logic (scraping, database lookups, debrid resolution) and returns a JSON response.
5. Nuvio parses the response and merges the results with any plugin-sourced streams into a unified source-selection list.

[Back to top](#addons)

---

## Nuvio's Native Debrid Integration

This is a distinct, built-in system — not an addon. While addons like AIOStreams can resolve debrid links on their server, Nuvio has its own debrid engine that does this locally on your device. Understanding the difference is critical to setting up your addons correctly.

### What It Does
Nuvio's native debrid integration takes raw magnet links (from P2P addon results or plugin results) and resolves them through your linked debrid account directly. This means Nuvio itself calls the Torbox or Premiumize API to check the cache, create the torrent, select the file, and get a direct download link — all without an external addon touching your API key.

### Supported Providers
Nuvio's debrid integration currently supports two providers, **Torbox** and **Premiumize**.

### How to Link a Debrid Service
1. In Nuvio, go to **Settings > Integrations > Connected Services**.
2. Select your provider (Torbox or Premiumize).
3. Follow the on-screen Device Code authorization flow.
4. Once authorized, Nuvio will begin resolving raw torrent hashes from your P2P addons and plugins through your debrid account.

### Why This Matters for Addon Configuration
When you use Nuvio's native debrid integration, your scraper addons (like AIOStreams or Comet) must be configured **without** a debrid API key and in **P2P mode**. If the addon resolves debrid links itself, Nuvio never sees a raw hash to resolve, and your native integration is bypassed.

> [!WARNING]
> **Using Nuvio's native debrid? Your addons need P2P mode.**
> If you linked Torbox or Premiumize in **Settings > Integrations > Connected Services**, you **must** configure your scraper addons (AIOStreams, Comet, Torrentio, etc.) to return raw P2P hashes — not pre-resolved debrid links. Entering a debrid API key into the addon itself will bypass Nuvio's built-in resolver entirely.
>
> **→ [Jump to P2P addon generator and addon setup instructions](#configuring-addons-for-p2p-nuvio-debrid-mode)**

[Back to top](#addons)

---

## Addon Directory

Because Nuvio uses the standard Stremio addon protocol, the vast majority of Stremio addons work in Nuvio without modification. Below is a curated list of the most popular and useful addons, organized by category.

---

### Stream / Scraper Addons

These addons find streaming sources for your movies and shows.

#### AIOStreams

AIOStreams is the most popular "super-addon" — it aggregates results from multiple underlying scrapers (Meteor, Comet, Stremthru, and others) into a single, highly customizable feed. Because it is self-hostable, community members run their own instances:
  - [Yeb's Instance](https://aiostreams.fortheweak.cloud/stremio/configure)
  - [Wizaarrd's Instance](https://aiostreams.forthewizards.uk/configure)
  - [Kuu's Instance](https://aiostreams.stremio.ru/configure)
  - [Midnight's Instance](https://aiostreamsfortheweebsstable.midnightignite.me/configure)
  - [ElfHosted](https://aiostreams.elfhosted.com/configure) - **ElfHosted Disables P2P**.

> [!TIP]
> Many users use pre-made configuration templates (like the **Tamtaro / TAMS** templates) to quickly set up filtering, sorting, and scraper selection within their chosen AIOStreams instance. You can typically import these from the configuration page.

#### Other Scraper Addons

| Addon | Configure URL |
|---|---|
| **Torrentio** | [torrentio.strem.fun](https://torrentio.strem.fun) |
| **Comet** | [comet.feels.legal/configure](https://comet.feels.legal/configure) |
| **StremThru** | [stremthru.13377001.xyz](https://stremthru.13377001.xyz/) |
| **Meteor** | [meteorfortheweebs.midnightignite.me/configure](https://meteorfortheweebs.midnightignite.me/configure) |
| **MediaFusion** | [mediafusionfortheweebs.midnightignite.me](https://mediafusionfortheweebs.midnightignite.me/app/configure) |
| **Sootio** | [sootiofortheweebs.midnightignite.me/configure](https://sootiofortheweebs.midnightignite.me/configure) |

[Back to top](#addons)

---

### Metadata Addons

These addons provide rich metadata (posters, descriptions, ratings, cast information) and catalogs for your home screen.

#### AIOMetadata

AIOMetadata is the recommended metadata addon. It aggregates data from TMDB, TheTVDB, and MyAnimeList into a single addon, letting you pick which source provides metadata for movies, series, and anime separately. Like AIOStreams, it is self-hostable and has multiple community instances:
  - [Yeb's Instance](https://aiometadata.fortheweak.cloud/configure)
  - [Wizaarrd's Instance](https://aiometadata.forthewizards.uk/configure)
  - [Kuu's Instance](https://aiometadata.stremio.ru/configure)
  - [Midnight's Instance](https://aiometadatafortheweebs.midnightignite.me/configure)
  - [ElfHosted](https://aiometadata.elfhosted.com/configure)

**Configuration tips:**
- Provide your own TMDB and TheTVDB API keys for best results and to avoid shared rate limits.
- Once AIOMetadata is installed, consider disabling the default Cinemeta addon to avoid metadata conflicts.
- You can install multiple AIOMetadata instances as failovers.

> [!TIP]
> Nuvio also has a built-in **TMDB Enrichment** feature (found under **Settings > Integrations > TMDB Enrichment**) that enhances addon metadata with TMDB data natively. You can use this alongside or instead of a metadata addon.

#### Other Metadata Addons

| Addon | Configure URL |
|---|---|
| **TMDB Addon** | [tmdb.elfhosted.com/configure](https://tmdb.elfhosted.com/configure/) |
| **Anime Kitsu** | [anime-kitsu.strem.fun](https://anime-kitsu.strem.fun/) |
| **Cinemeta (v3)** | [v3-cinemeta.strem.io](https://v3-cinemeta.strem.io/) |
| **TMDB Discover+** | [tmdb-discover-plus.elfhosted.com](https://tmdb-discover-plus.elfhosted.com/) |

#### Rating Poster Database (RPDB)

RPDB overlays ratings badges onto your catalog posters. It requires an API key, which can be configured via [ratingposterdb.com](https://ratingposterdb.com/).

While RPDB is a paid Patreon service, the developer provides several free-tier keys for basic usage:
- **Dark Bar:** `t0-free-rpdb`
- **Blocks:** `t0-free-rpdb-blocks`
- **Rounded Blocks:** `t0-free-rpdb-rounded-blocks`
- **Boxes:** `t0-free-rpdb-boxes`

[Back to top](#addons)

---

### Subtitle Addons

These addons fetch subtitles for your content from various providers.

| Addon | Configure URL |
| --- | --- |
| **OpenSubtitles PRO** | [opensubtitlesv3-pro.dexter21767.com/configure/](https://opensubtitlesv3-pro.dexter21767.com/configure/) |
| **Stremio Community Subtitles** | [stremio-community-subtitles.top](https://stremio-community-subtitles.top/) |
| **SubSource** | [subsource.strem.top/configure](https://subsource.strem.top/configure) |
| **SubDL** | [subdl.strem.top/configure](https://subdl.strem.top/configure) |
| **SubSense** | [subsense.nepiraw.com/configure](https://subsense.nepiraw.com/configure) |
| **SubMaker** | [submaker.elfhosted.com/configure](https://submaker.elfhosted.com/configure?config=bedadbea77057c6e79adb38710386e3d) |
| **AIO Subtitles** | [aio-streaming.baby-beamup.club](https://3b4bbf5252c4-aio-streaming.baby-beamup.club/configure) |

> [!TIP]
> Nuvio has a dedicated **Addon Subtitle Startup** setting (under **Settings > Player**) that controls when subtitle addons are queried:
> - **Fast startup:** Skip automatic subtitle fetch. **Note: If this is on, these addons will not load right away and must be manually pulled in the player.**
> - **Preferred only:** Fetch subtitles but only show preferred-language matches.
> - **All subtitles:** Fetch and show every addon subtitle for the video.

[Back to top](#addons)

---

## Installing an addon

To install an addon, you need its manifest URL — obtained from the addon's configuration website by picking your settings and clicking "Install" or "Copy Link."

### Directly in the App
1. Open **Settings** on your device.
2. Navigate to the **Addons** management section.
3. Select **Add Addon** and paste the manifest URL into the **Addon URL** field.
4. Select **Install Addon** to fetch the manifest and add it to your installed list.
5. Nuvio will immediately begin querying this addon for relevant content based on its declared capabilities.

### Managing Installed Addons

> [!IMPORTANT]
> **Metadata First:** Nuvio processes metadata addons from top to bottom. To ensure rich posters and details are loaded properly, your metadata addons (like AIOMetadata or RPDB) **must be ordered at the top** of your installed addons list.

- **Reorder:** Move addons to change their priority — higher-priority addons appear first in stream results.
- **Enable/Disable:** Toggle individual addons on or off without removing them.
- **Settings:** Some addons expose custom settings (like language or quality preferences) accessible via the gear icon next to the addon name.
- **Refresh:** Pull to refresh or tap the refresh button to re-fetch addon manifests from their sources.

[Back to top](#addons)

---

## Configuring Addons for P2P (Nuvio Debrid Integration)

If you are using Nuvio's native debrid integration (Torbox or Premiumize linked in **Settings > Integrations > Connected Services**), your scraper addons must be configured to return raw P2P/torrent hashes instead of pre-resolved debrid links. If a scraper addon resolves links itself (because a debrid API key was entered into it), Nuvio never sees a hash to wrap, and your native integration is bypassed.

---

### Instant P2P Setup Generator

<P2PGenerator />

> [!TIP]
> The generator above resolves the full **Tam-Taro Complete SEL (TAMS)** template for P2P mode, with no debrid services, P2P set to Required, debrid stream types excluded, and a curated set of P2P scrapers. It can either download a config JSON to import, or push straight to your instance to produce a manifest URL you paste into Nuvio. Use **Simple mode** for recommended defaults, or switch to **Advanced mode** for full control.

### Configuring AIOStreams for P2P (Manual)
1. **Pick an instance.** Open the configuration page of an AIOStreams instance that explicitly allows P2P. The official ElfHosted instance disables P2P by default — use Midnight's, Kuu's, Yeb's, or a self-hosted instance instead.
2. **Skip the Services menu.** Leave it empty — do not enter credentials for TorBox, Premiumize, Real-Debrid, or any other debrid service. Entering a key here causes AIOStreams to return already-resolved debrid links, defeating Nuvio's own resolution logic.
3. **Enable P2P in Stream Types / Filters.** Make sure **P2P** is toggled on and set to at least **Preferred**, ideally **Required**. Disable or exclude **Cached** and **Uncached** debrid stream types so only magnet results are returned.
4. **Save and generate your manifest.** Use the Save & Install menu to generate your keyless AIOStreams manifest URL.
5. **Install into Nuvio.** Paste the generated manifest URL into Nuvio's **Add Addon** field.

### Other Addons (e.g., Comet, Torrentio)
If you're running Comet, Torrentio, or a similar scraper:
1. Open that addon's own configuration page.
2. Ensure no debrid service field or API key is filled in.
3. Confirm the addon's mode outputs raw P2P links (this is sometimes labeled "P2P" or is the default state when no debrid credentials are present).
4. Install the resulting keyless addon URL into Nuvio.

Once installed, selecting a title causes the addon to find P2P swarms, and Nuvio automatically wraps those raw hashes through your linked Torbox or Premiumize account to stream securely.

> [!NOTE]
> **P2P Availability Advisory:**
> Not all instances or addons provide access to P2P. Many public hosted instances explicitly block P2P scraping (including the official AIOStreams ElfHosted instance). Ensure the instance you are using allows P2P connections so Nuvio receives the necessary hashes.

[Back to top](#addons)
