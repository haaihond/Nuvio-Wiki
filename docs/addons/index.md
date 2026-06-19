# Addons Guide

Addons are the heart of the Nuvio experience. They provide the content and functionality that make the app useful.

>[!WARNING]
>The naming, identifying, linking, or describing specific addons will not be covered in this Wiki. This Wiki does not condone the use of any unlicensed copyrighted material.

## Types of Addons

There are 3 main types of addons for Nuvio:
  - **Content Providers:** These fetch streams for movies, shows, or anime.
  - **Metadata Providers:** Enhance the UI with posters, ratings, and synopses.
  - **Utility Addons:** Provide extra features like subtitles or playback sync.


## How to add an addon

To add an addon, you typically need a manifest URL obtained from the addon
- These will be generated when configuring the addon.
- The manifest generated will be pasted into the addons tab of Nuvio.

---

## Configuring an Addon for use with Nuvio Debrid Integration

---

### Configuring AIOStreams & P2P Addons
For Nuvio to resolve anything, it first needs a source to scrape the magnet links. You must configure your scraper addons **without** a Debrid API key and strictly in **P2P mode**. If a scraper addon resolves links itself (because a Debrid key was entered into it), Nuvio never sees a hash to wrap, and your TorBox/Premiumize linking in Steps 1-2 is effectively bypassed.

#### Instant P2P Setup Generator

<P2PGenerator />

> [!TIP]
> The generator above resolves the full **Tam-Taro Complete SEL (TAMS)** template for P2P mode — no debrid services, P2P set to Required, debrid stream types excluded, and a curated set of P2P scrapers. It can either download a config JSON to import, or push straight to your instance to produce a manifest URL you paste into Nuvio. Use **Simple mode** for recommended defaults, or switch to **Advanced mode** for full control.

#### Configuring AIOStreams for P2P (Manual)
1. **Pick an instance.** Open the configuration page of the AIOStreams instance you intend to use (a self-hosted instance, or a public instance that explicitly allows P2P). The official public ElfHosted instance disables P2P and HTTP streams by default for liability reasons, so it will not work for this setup — you'll need a private/self-hosted instance or an alternate public instance that permits P2P.
2. **Skip the Services menu.** Click through to the **Services** menu and leave it empty — do not add or enable credentials for TorBox, Premiumize, Real-Debrid, or any other debrid service here. Entering a key in AIOStreams itself causes it to return already-resolved/cached debrid links instead of raw P2P hashes, which both defeats Nuvio's own resolution logic and can burn through your provider's rate limits outside of Nuvio's control.
3. **Enable P2P in Stream Types / Filters.** Navigate to the Stream Types (or Filters) menu and make sure **P2P** is toggled on and set to at least **Preferred**, ideally **Required**. In the same menu, disable or exclude **Cached** and **Uncached** debrid stream types so AIOStreams only returns magnet results.
4. **Save and generate your manifest.** Use the Save & Install (or equivalent) menu to generate your keyless AIOStreams manifest URL.
5. **Install into Nuvio.** Add the generated manifest URL as an addon inside Nuvio the same way you would any other addon source.

#### Other Addons (e.g., Comet, Torrentio)
If you're running a Comet instance, Torrentio, or a similar scraper natively alongside or instead of AIOStreams:
1. Open that addon's own configuration/settings page.
2. Ensure no Debrid service field, API key field, or "cached" stream option is filled in or enabled.
3. Confirm the addon's mode is set to output raw P2P links (this is sometimes labeled "P2P" or simply the default state when no debrid credentials are present).
4. Install the resulting keyless addon URL into Nuvio.

Once a working P2P addon is installed, selecting a title causes the addon to find P2P swarms, and Nuvio automatically wraps those raw hashes through your linked Torbox or Premiumize account to stream securely.

> [!NOTE]
> **P2P Availability Advisory:** 
> Not all instances or addons provide access to P2P. Many public hosted instances explicitly block P2P scraping (including AIOStreams' own official public ElfHosted instance). Ensure the AIOStreams or Comet instance you are utilizing allows P2P connections so Nuvio receives the necessary hashes.
