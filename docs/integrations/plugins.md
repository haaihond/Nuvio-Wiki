# Plugins

Nuvio relies on two independent systems to find something for you to watch: addons and plugins. They solve overlapping problems — both can hand Nuvio a stream link for a title — but they're built differently, run in different places, and come from different ecosystems. This guide covers what a plugin actually is, how Nuvio loads and runs one, where people find them, and how to install one yourself.

> [!NOTE]
> It is important to note installing a plugin into the addons section in Nuvio will result in an error. Install plugins in the plugins section of Nuvio.
>
> Not all Nuvio versions support plugins. Due to platform store rules, the Nuvio versions downloaded from an app store do not support Plugins. **Only the sideloaded versions support plugins.**

---

## Plugins vs. addons

On the surface, both give you streams. Underneath, they're not the same kind of object at all:

| | addons | Plugins |
|---|---|---|
| **Protocol** | Stremio's addon protocol (`catalog`/`meta`/`stream` HTTP endpoints) | Nuvio's own plugin repository format |
| **Where the logic runs** | On the addon developer's remote server | Inside Nuvio, locally on your device |
| **What Nuvio actually does** | Sends an HTTP request, parses the JSON response | Downloads the plugin's code and executes it in a sandboxed QuickJS runtime |
| **Hosting** | Developer's infrastructure (Beamup, a VPS, Cloudflare Workers, ElfHosted) | A manifest file, typically hosted on GitHub |
| **Scope** | Catalogs, metadata, subtitles, live TV, and streams | Streams only |
| **Portability** | Works in any Stremio-protocol client (Stremio, Nuvio, others) | Nuvio-specific |

The structural difference is the one that matters most: an addon is a contract. Nuvio calls out to a URL and trusts the response to follow the Stremio schema — this is also why existing Stremio addons like AIOStreams, Torrentio, or MediaFusion work in Nuvio without modification, and why Nuvio can treat metadata addons, subtitle addons, and stream addons as the same basic object with different capabilities declared in the manifest.

A plugin is code. Nuvio doesn't ask a remote server for an answer — it pulls down a script and runs it locally. That's a meaningfully different trust boundary: an addon can only ever hand you data, while a plugin runs with whatever access Nuvio's plugin runtime grants it.

[Back to top](#Plugins)

---

## How Plugins Work

### Plugin Repositories

A plugin repository is a manifest file — not an app, not a package you download and unzip. The manifest lists one or more individual providers, and Nuvio stores the manifest's URL rather than a local copy of anything. You can have several repositories active simultaneously, and each repository can expose multiple providers that you enable or disable independently, so adding a repository doesn't mean every provider inside it starts running immediately.

### On-Device Execution

Enabled provider code runs inside an embedded QuickJS instance bundled into the app — a lightweight JavaScript engine, not a browser or webview. This is what actually separates a plugin from an addon at runtime: the provider's fetch/scrape logic executes on your device, inside that sandboxed JS environment, rather than on a server you'll never see.

### Request Flow

1. You open a title and Nuvio needs sources for it.
2. Nuvio invokes each enabled provider inside the QuickJS runtime, passing the title's identifiers — typically a TMDB or IMDb ID, media type, and season/episode for series.
3. The provider's own code makes whatever network requests it needs against its target source, then returns a normalized list of stream candidates (name, URL, quality, and similar metadata) back to Nuvio.
4. Nuvio merges those results with anything your active addons returned into a single source-selection list for playback.

### What Plugins Can and Can't Do

Because provider code runs inside a constrained script runtime rather than as a native module, a plugin is generally scoped to making network requests and returning structured stream data — it isn't a general-purpose extension with the same reach as the app itself. Treat a plugin as "fetches and parses," not "does anything Nuvio can do."

> [!WARNING]
> If you're writing or evaluating a provider, don't assume manifest formats or example code from before the Kotlin Multiplatform rewrite still apply — the runtime changed, and repositories built for the older app may fail to load or may load without any providers appearing. Check a repository's own documentation for the current schema rather than relying on older tutorials.

[Back to top](#Plugins)

---

## Where to Find Plugins

There's no in-app plugin store in the app-store sense — a plugin repository is just a manifest URL, so finding one means finding a URL from a source you're willing to trust. In practice, that comes from a few places:

- **Nuvio Streams Discord** - The best way to find plugins. [Join here](https://discord.gg/7C994hfSy).
- **Community-maintained repositories** - Shared on GitHub, usually as a public repo with a `manifest.json` you point Nuvio at directly.

> [!CAUTION]
> A plugin executes code on your device — that's a different risk profile than an addon, which only ever returns data. Only add repositories from sources you trust, and be aware that plugin availability and reliability change often as source sites and scrapers get blocked or shut down. Nuvio itself is a client only: it doesn't host, vet, or guarantee any third-party plugin, and you're responsible for using it in a way that complies with the laws in your jurisdiction.

[Back to top](#Plugins)

---

## Installing a Plugin

### Finding Plugins
The best way to find plugins is joining the Nuvio streams discord.

### Prerequisites

- Nuvio installed and updated to a current release
- A Nuvio account, if you want the plugin to sync across your devices (optional, but recommended — the same pattern used for collections and addons)
- The manifest URL of the plugin repository you want to add

### Via the Account Dashboard

This is the easier path for typing or pasting a long URL.

1. Log in at the Nuvio website and make sure you're on the **Account** tab.
2. In the left sidebar, select **Plugins**.
3. Select **Add Plugin** (or **Add Repository**).
4. Paste the repository's manifest URL, give it a name, and save.
5. The repository syncs to your devices the next time the app connects — no need to re-enter anything on-device.

### Directly in the App

1. Open **Settings** on your device.
2. Find the plugins section under **Settings > Content & Discovery > Plugins**.
3. Choose **Add Repository** and paste the manifest URL.
4. Refresh to fetch the provider list from that manifest.
5. Enable the individual providers you want — adding the repository alone doesn't turn any of them on.

### Verifying a Successful Install

- Open any title and check its source list — a working provider shows up by name alongside your addon sources.
- In Settings, the repository should show as enabled with a recent fetch/update timestamp rather than an error state.
- If no providers appear after adding a repository, re-check that you enabled at least one provider inside it — the repository and its providers are toggled separately.

[Back to top](#Plugins)

---

## Plugin Provider Settings

These toggles are found in the same plugin settings area under **Settings > Content & Discovery > Plugins** and control how enabled providers behave across the app.

- **Enable plugin providers globally:** A master toggle that activates or deactivates all installed plugin providers at once. When off, no plugin providers will be queried during source searches, regardless of individual provider toggles.
- **Group plugin providers by repository:** When enabled, the source-selection list groups results from each plugin repository together under its repository name, making it easier to identify which repository supplied each stream result.
