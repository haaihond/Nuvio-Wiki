# Debrid Integration

Nuvio utilizes a centralized architecture for debrid integration. Instead of passing personal API keys to individual P2P scraping addons, accounts are linked directly within the core Nuvio Android and TV application. Nuvio intercepts the raw P2P hashes from your configured addons, verifies cache availability, and handles the link resolution natively by wrapping the addon in your debrid service.

> [!IMPORTANT]
> Nuvio's debrid integration (TorBox or Premiumize) only resolves links — it cannot generate them on its own. You must have at least one **P2P-capable** scraper addon (such as AIOStreams, Comet, or Torrentio) installed and configured correctly, or Nuvio has nothing to wrap and resolve.

>[!NOTE]
>Reminder: This project is not official. Do not contact Nuvio developers regarding issues with this wiki.

---

### Step 1: Accessing Connected Services
To begin configuring your debrid provider, open the application and navigate to **Settings** > **Integrations** > **Connected Services**. This menu manages accounts for links and library access.

### Step 2: Linking an Account & Initial Toggles
By default, your debrid providers will show as unlinked, and core features will be disabled. 

1. Under the **Accounts** section, select either **Torbox** or **Premiumize**. Nuvio will prompt you to complete the account authorization via a browser window.
2. Once authenticated, the status will shift to **Connected**.
3. Under the **Connected Services** section, toggle **Cloud library** to **On** if you wish to browse and play media files already stored directly within your cloud provider's storage.
4. Toggle **Resolve playable links** to **On**. This allows Nuvio to actively request playable streaming links from your provider when scraping results.

[Back to top](#debrid-integration)

---

### Step 3: Configuring AIOStreams & P2P Addons
Nuvio first needs a source to scrape the magnet links. You must configure your scraper addons **without** a Debrid API key and strictly in **P2P mode**. 

* [Detailed instructions on configuring a p2p Addon are located here](../addons/index.md)

[Back to top](#debrid-integration)

---

### Step 4: Optimizing Link Preparation & Performance
When a provider is active, a **Link Preparation** section becomes available. 

* **Prepare links**: Toggle this **On** to resolve playable streams immediately before you hit playback, minimizing buffer delays.
* **Links to prepare**: Clicking this opens a configuration overlay. You can select between **1, 2, 3, or 5 links** to resolve concurrently. 

> [!WARNING]
> **Important Rate-Limit Advisory:** 
> It is highly recommended to use a lower link count (such as 2 links). Debrid providers strictly rate-limit how many resolution requests can be processed in a given timeframe. Simply opening a movie or episode details page pulls headers and counts toward those limits—even if you do not press "Watch"—because the links are actively prepared ahead of time.

[Back to top](#debrid-integration)

---

### Step 5: Granular Result Management
Nuvio provides deep filtering and sorting configurations under the **Result Management** section to control exactly how scraped streams are indexed and presented:

#### Scraping & Capacity Limits
* **Max results**: Limits the total number of entries displayed (e.g., *All results*).
* **Sort results**: Dictates the primary arrangement hierarchy (e.g., *Original order*).
* **Per resolution / quality limit**: Caps repeating variants (e.g., duplicate 2160p or REMUX results) to clean up long scrape lists.
* **Size range**: Filters out files that fall outside specific file size thresholds.

#### The Three-Tier Filtering Architecture
For almost every media metric, Nuvio employs a strict prioritizing system split into **Preferred** (sorted to the top), **Required** (mandatory to display), and **Excluded** (hidden entirely). These settings are found directly under the capacity limits in the **Result Management** section:

| Metric | Configuration Scope |
| :--- | :--- |
| **Resolutions** | 4K (2160p), 1080p, 720p, etc. |
| **Qualities** | BluRay, WEB-DL, REMUX, HDTV, etc. |
| **Visual Tags** | Dolby Vision (DV), HDR, 10bit, IMAX, SDR, 3D. |
| **Audio Tags** | Atmos, TrueHD, DTS, AAC, etc. |
| **Channel Layouts** | 7.1, 5.1, Stereo, etc. |
| **Encodes** | AV1, HEVC (H.265), AVC (H.264). |
| **Languages & Groups** | Audio language tracks and specific release group tags. |

[Back to top](#debrid-integration)

---

### Step 6: Metadata & UI Formatting
At the bottom of the Connected Services menu, the **Formatting** section allows you to customize the layout of the scraper results using variables:

* **Name template**: Customizes how the title and main text of the stream results appear. Leaving this blank defaults to the raw name provided by the scraper.
* **Description template**: Controls the structural display of metadata (bitrate, size, codec tags) displayed beneath each result.

[Back to top](#debrid-integration)

---

## Debrid Service Guide

Debrid services are high-speed downloaders that fetch files from hosters and torrents, then stream them to you via a secure, high-bandwidth connection.

#### 1. TorBox (TB)
A fast-growing service that excels in Usenet support (pro tier only) alongside traditional torrent debrid.
* **Pros:** No limit on IP usage, Native Usenet support (pro tier), fast caching, modern API.
* **Cons:** Newer service, can have stability issues.
* **Plans & Pricing:** 
  * **Essential:** ~$3.00/month or ~$33.00/year: Recommend for most users
  * **Standard:** ~$5.00/month or ~$55.00/year
  * **Pro:** ~$10.00/month or ~$110.00/year: Provides access to Usenet
* **Deals & Discounts:** Users can receive a referral bonus on their first purchase, adding 7 days of extra free time per month purchased. Annual plans combined with coupon codes and cryptocurrency payments can significantly lower the monthly equivalent cost. Torbox typically offers Black Friday sales for 30% off. 
* **Setup:** [torbox.app/settings](https://torbox.app/subscription?referral=41d1ac85-ee5e-4699-9f0a-92e67cbc2fb2)

#### 2. Premiumize (PM)
A premium all-in-one service that includes a personal cloud and a built-in VPN.
* **Pros:** Personal cloud storage, 1TB limit, built-in VPN, allows multiple IPs.
* **Cons:** More expensive than RD/AD. Has a points system that equates to about 1 TB a month.
* **Plans & Pricing:**
  * **1 Month:** 9.99 EUR (approx. $11.99 USD)
  * **3 Months:** 24.99 EUR (approx. $29.99 USD)
  * **1 Year:** 69.99 EUR (approx. $79.99 USD)
* **Deals & Discounts:** Premiumize typically runs significant sales around Black Friday and Cyber Monday. They often offer 2-year or 3-year bulk packages at steep discounts, such as $109 or $139 USD.
* **Setup:** [premiumize.me/device](https://premiumize.me)

#### 3. OffCloud
Uses PM Cache but without the extra PM services.
* **Pros:** Uses PM's cache, more affordable than PM, no IP limit.
* **Cons:** Has a 1 TB monthly usage limit.
* **Plans & Pricing:** 
  * **Early Access Monthly:** $4.99/month
  * **Early Access Yearly:** $39.99/year
  * **Standard Monthly:** $9.99/month
  * **Standard Yearly:** $79.99/year
* **Deals & Discounts:** Historically, OffCloud frequently sold a "Lifetime Subscription" for approximately $39.99 through third-party platforms like StackSocial. Following an ownership change, lifetime subscriptions are no longer offered, and legacy lifetime accounts were capped at a maximum of one year.
* **Setup:** [offcloud.com](https://offcloud.com/#pricing)

#### 4. Real-Debrid (RD)

> [!WARNING]
> Real Debrid has recently faced legal issues and a large amount of files are now being blocked. Your mileage may vary based on usage of this service.

* **Pros:** Affordable, high-speed servers.
* **Cons:** Strict 1 IP rule (cannot use on two different internet connections at once), varying blocking of content.
* **Plans & Pricing:** 
  * **15 Days:** 3.00 EUR
  * **30 Days:** 4.00 EUR
  * **90 Days:** 9.00 EUR
  * **180 Days:** 16.00 EUR
* **Deals & Discounts:** Real-Debrid does not offer any free trials, promotions, seasonal deals, or discounts.
* **Setup:** [real-debrid.com/device](https://real-debrid.com/)

#### 5. AllDebrid (AD)
A highly reliable alternative to Real-Debrid with excellent customer support and browser extensions.
* **Pros:** Great reliability, high speeds, supports many hosters.
* **Cons:** Smaller cache than other services. 1 IP at once.
* **Plans & Pricing:** 
  * **Free Trial:** 7 Days (requires phone verification)
  * **30 Days (Recurring):** 2.99 EUR/month
  * **30 Days (One-Time):** 3.99 EUR
  * **90 Days:** 8.99 EUR
  * **180 Days:** 15.99 EUR
  * **300 Days:** 24.99 EUR
* **Deals & Discounts:** They offer occasional seasonal sales, such as during Black Friday and Christmas. Paying with Bitcoin permanently secures a 10% discount.
* **Setup:** [alldebrid.com/pin](https://alldebrid.com)

[Back to top](#debrid-integration)

### Why use Debrid?
1. **No Buffering:** Streams are served from high-speed data centers, not peer-to-peer.
2. **Quality:** Access to massive 4K/Remux files (60GB+) that are impossible to stream via standard public links.
3. **Safety:** The debrid service downloads the torrent on their servers; you only download/stream a private encrypted file from them.

> [!IMPORTANT]
> It is highly recommended that you use a debrid service for safety and the best experience.

[Back to top](#debrid-integration)

### Setup Steps
1. **Get an Account:** Sign up on the respective website.
2. **Retrieve API Key/Authorize:** Follow the individual provider's authorization steps.
3. **Configure Addons:** Most Nuvio addons will automatically detect your Debrid service once linked.

[Back to top](#debrid-integration)

### Troubleshooting
* **"No Streams Found":** Check if your subscription has expired or if the addon supports your specific service.
* **"Authorization Failed":** Ensure you are logged into the website on your browser before entering the device code.

[Back to top](#debrid-integration)
