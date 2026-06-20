# Nuvio Integrations Overview

Nuvio supports a modular integration system designed to handle link resolution, metadata enrichment, and watch state syncing natively within the application by centralizing these connections.

This directory contains the documentation for configuring and optimizing all external services supported by Nuvio.

>[!NOTE]
>Reminder: This project is not official. Do not contact Nuvio developers regarding issues with this wiki.

---

## Integration Categories

### 1. Debrid Services (Link Resolution)
Nuvio intercepts raw P2P hashes from your configured keyless addons and uses your connected debrid provider to securely resolve, cache, and stream high-bandwidth files.
- **Supported Providers:** TorBox, Premiumize.
- **Key Features:** Native cache checking, concurrent link preparation, and granular filtering by resolution, quality, and audio/video tags.
- **[Read the Debrid Integration Guide](./debrid.md)**

### 2. Metadata Enrichment
Enhance the default scraping results with high-quality visual assets and aggregated rating scores.
- **TMDB:** Supplies Nuvio with high-resolution artwork, episode titles, cast details, trailers, and localized descriptions.
- **MDBList:** Aggregates critic and audience scores from external platforms (IMDb, Rotten Tomatoes, Metacritic, Letterboxd) directly onto Nuvio's detail pages.
- **[Read the Metadata & Tracking Guide](./tmdb-mdblist-trakt.md)**

### 3. Watch Tracking & Syncing
Keep your viewing history and custom lists synchronized across all your devices.
- **Trakt (In-App):** Natively syncs your watch progress, scrobbles, and custom lists. Can be configured to run alongside or independently of Nuvio's internal sync engine. *Provides More Like This*.
- **[Read the Metadata & Tracking Guide](./tmdb-mdblist-trakt.md)**
