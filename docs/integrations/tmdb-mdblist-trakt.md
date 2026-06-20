# Content Enrichment & Tracking Guide

## Table of Contents
- [TMDB Enrichment](#tmdb-enrichment)
- [MDBList Ratings](#mdblist-ratings)
- [Trakt Integration](#trakt-integration)
  - [In-App Configuration](#in-app-configuration)
  - [Nuvio Trakt Bridge (Import Tool)](#nuvio-trakt-bridge-import-tool)

---

### TMDB Enrichment

TMDB (The Movie Database) acts as the foundation for your metadata, pulling in high-quality artwork, episode details, and cast information.

**How to obtain a TMDB API Key:**
1. Create a free account at [themoviedb.org](https://www.themoviedb.org/).
2. Navigate to your Account Settings and select the API link from the left sidebar.
3. Request an API Key and select **Yes this is for personal use**.
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

#### Nuvio Trakt Bridge (Import Tool)

If you are migrating to Nuvio and want to bring your existing Trakt history into Nuvio's native tracking system, use the web-based bridge tool.

**How to use the Trakt Bridge:**
1. Visit the [Nuvio Trakt Bridge](https://trakt-nuvio.duckdns.org/).
2. Under the **Connect Trakt** section, click the button to use Trakt OAuth to approve access in a pop-up window.
3. Under the **Connect Nuvio** section, enter the email address and password associated with your Nuvio account and click **Sign In**.
4. Select the specific **Nuvio profile** you want to import the data into from the dropdown menu.
5. In the **Import from Trakt** section, choose your sync scopes:
    - **Watched history:** Imports movies and watched episodes.
    - **Continue watching:** Imports playback progress.
    - **Library imports:** Expand to select specific library data.
6. Click **Preview** to review the data to be imported, and then click **Sync to Nuvio** to finalize the process.

[Back to top](#table-of-contents)
