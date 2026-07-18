# Content Enrichment & Tracking Guide

### TMDB Enrichment

TMDB (The Movie Database) acts as the foundation for your metadata, pulling in high-quality artwork, episode details, and cast information.

**How to obtain a TMDB API Key:**
1. Create a free account at [themoviedb.org](https://www.themoviedb.org/).
2. Navigate to your Account Settings and select the API link from the left sidebar.
3. Request an API Key and select **Yes, this is for personal use**.
4. Fill out the form.
5. Copy the v3 API Key provided (do not use the v4 Read Access Token for this field).

**Nuvio Configuration:**
1. Navigate to **Integrations** > **TMDB Enrichment**.
2. Toggle **Enable TMDB Enrichment** to the on position.
3. Paste your v3 key into the **Personal API key** field and click Save.
4. Set your preferred **Language code** (e.g., `en` for English).
5. Toggle your desired metadata modules. Available modules include:
    - **Artwork** (Logos and backdrops)
    - **Basic Info** (Description, genres, ratings)
    - **Details** (Runtime, status, country, language)
    - **Credits** (Cast, director, writer)
    - **Productions** & **Networks**
    - **Episodes** (Titles, overviews, thumbnails, runtime)
    - **Season posters** & **Collections**
    - **More Like This** (Recommendation backdrops)

[Back to top](#table-of-contents)

---

### MDBList Ratings

MDBList aggregates rating scores from multiple platforms so you can see audience and critic scores directly on the metadata pages.

**How to obtain an MDBList API Key:**
1. Register for a free account at [mdblist.com](https://mdblist.com/).
2. Go to your account preferences to generate a free API key.
3. Make sure you copy only the API key string itself, not the full URL.

**Nuvio Configuration:**
1. Navigate to **Integrations** > **MDBList Ratings**.
2. Toggle **Enable MDBList Ratings** to the on position.
3. Paste your key into the **API Key** field and click Save.
4. Select the external rating providers you wish to display. Supported options include **IMDb**, **TMDB**, **Rotten Tomatoes**, **Metacritic**, **Trakt**, **Letterboxd**, and **Audience Score**.

[Back to top](#table-of-contents)

---

### Trakt Integration

Trakt syncs your watch history, progress, and personal lists across your devices. Nuvio supports both live syncing via the app and historical data importing via a web tool.

#### In-App Configuration

**How to Connect Trakt:**
You do not need to manually generate an API key for Trakt.
1. Navigate to **Integrations** > **Trakt**.
2. Click the **Connect Trakt** button.
3. This will prompt you to sign in to your Trakt account and authorize Nuvio to access your profile.
4. Once connected, your status will update to show your Trakt username.

**Library and Sync Options:**
After authenticating, customize your tracking features.

- **Library Source:** Choose which library to use for saving and viewing your collection. Options include **Trakt** or **Nuvio**.
- **Watch Progress:** Choose which progress source powers resume and continue watching. Options include **Trakt** or **Nuvio Sync**.

> [!NOTE]
> If you select **Nuvio Sync** as your primary watch progress source, Nuvio will still continue syncing your ongoing watch progress *to* Trakt in the background.

- **Continue Watching Window:** Define the Trakt history timeframe considered for continuing a show (e.g., 60 days).
- **Comments:** Toggle on to show Trakt user reviews on detail metadata pages.
- **More Like This source:** Choose where recommendations come from on detail pages (e.g., Trakt).

#### Sync Bridge

Use the web-based Sync Bridge to preview and transfer supported tracking data between **Simkl**, **Stremio**, **Trakt**, **Plex**, and **Nuvio**. Every source and destination pairing is available, including transfers between different accounts on the same service, different profiles within Nuvio, or different Plex servers on one account.

Plex connects through Plex's approval screen and lets you choose any reachable server on the account. The bridge can read watched items, resume points, and movie/show library membership from that server. As a destination, Plex accepts watched state and resume points only for media already present on the selected server; Sync Bridge cannot add media files or saved titles to a Plex server library.

<NuvioTraktBridge />

**How to use the Sync Bridge:**

1. Open the [Sync Bridge](/tools#sync-bridge).
2. Choose the **From** and **To** services.
3. Connect the source and destination separately. For a same-service transfer, use different accounts; for Nuvio, choose a different destination account or profile; for Plex, you can also choose a different server.
4. Select the data categories available for that pairing, such as watched history, playback progress, watchlist, or collection.
5. Run **Preview** first. Review matched items, automatic ID and episode remapping, skipped items, and any warnings before writing to the destination.
6. Once the preview looks right, start the sync and keep the page open until it finishes.

[Back to top](#table-of-contents)
