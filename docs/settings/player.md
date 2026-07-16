# Nuvio Player Settings

Nuvio offers a variety of player settings to customize your experience.

> [!IMPORTANT]
> Anything not labeled [Android TV Only] or [Mobile Only] is a feature of both versions.

---

## Intro and Outro Skip

Nuvio uses three separate databases for intro and outro skipping, prioritized in this order: **IntroDB**, **AniSkip**, and **Anime Skip**.

- **IntroDB** and **AniSkip** can be toggled on or off directly.
- **Anime Skip** requires an ID and configuration to use.

**To toggle these features:**
1. Go to **Settings**.
2. Select **Playback**.
3. Select **Skip Segments**.

**To obtain a free Anime Skip Client ID:**
1. Go to [Anime Skip](https://anime-skip.com).
2. Create an account.
3. Once logged in, go to your profile.
4. Select **API Clients**.
5. Select **Add a New Client**.
6. Enter the app name "Nuvio" and a description of "Nuvio".
7. Select **Create**.
8. Copy the generated Client ID (a long string of numbers and letters).
9. Go back into Nuvio, paste the Client ID, and select **Save**.

**To submit Intros and Outros to IntroDB** [Mobile Only]:

Nuvio allows you to submit timestamps to IntroDB's community-sourced database. You will need an API key:
1. Go to [Intro DB](https://introdb.app).
2. Create an account.
3. Once logged in, go to **Account Settings**.
4. Select **Generate Key**.
5. Copy the key.
6. Go back into Nuvio, paste the API key, and select **Save**.

**Automatic Skipping & Content Warnings** [Android TV Only]:
- **Content Warnings:** Show parental guidance overlay when playback starts.
- **Automatic Skipping:** Choose which segments (intros/outros) skip automatically without prompting.

[Back to top](#Nuvio-player-settings)

---

## Stream Selection and Stream Auto Play

### Stream Selection

Stream selection includes two main options:

- **Reuse Last Link:** When resuming a title, Nuvio will attempt to use the exact same stream you selected during your previous session.
- **Last Link Cache Duration:** Determines how long Nuvio holds onto the last selected link. Options include 1, 6, and 12 hours, as well as 1, 2, 3, and 7 days.

> [!NOTE]
> Debrid service links are typically only valid for a specific time period. Selecting a duration that is too long can cause Nuvio to attempt playback on an expired, invalid link.

### Stream and Auto-Play

This section dictates how the application behaves when you select a media item, whether it automatically launches a stream or lets you choose your own link.

**Selection Mode**
Determines the logic used to handle available streams:
- **Auto-play first source:** Automatically scans for media streams and instantly plays the first valid source it encounters without prompting you.
- **Manual:** Displays a comprehensive list of all discovered streams, allowing you to manually review and select based on quality, file size, or source.
- **Regex (Regular Expression):** An advanced filtering mode that scans stream titles or metadata for specific text patterns (e.g., 1080p, 4K, HEVC, specific release groups) and prioritizes or filters matches based on your custom expressions.

**Stream Selection Timeout**
Sets the maximum duration the application will wait for addons or plugins to return their results before proceeding:
- **Options:** Instant, 5s to 30s (in 5-second increments), Unlimited.
- *How it works:* If a timeout is hit, Nuvio stops searching and plays the best option found so far (if auto-playing) or presents a partial list (if manual). Choosing **Unlimited** ensures the app waits until every provider has finished searching, regardless of the time it takes.

**Source & Addon Filtering**
These configurations control exactly which addons or plugins are allowed to search for and supply streams.

- **Auto-play Source Scope:** Narrows down the pool of providers when using an automated playback mode.
  - *Options:* All sources, Select addons, Plugins only.
- **Allowed Addons:** Provides granular control over installed extensions during the search process.
  - *Options:* All addons, Custom Selection.
- **Allowed Plugins:** Controls the plugins used during the search process.
  - *Options:* All enabled plugins, Custom Selection.

[Back to top](#Nuvio-player-settings)

---

## Next Episode

The Next Episode category includes several settings to optimize continuous viewing:

- **Auto-Play Next Episode:** When toggled on, Nuvio starts the source selection process as soon as the "next episode" prompt appears. This prompt is triggered by either:
  - An Outro skip is triggered.
  - If no Outro skip is present, the Next Episode Threshold is met.
- **Prefer Binge Group:** Nuvio will try to find the next episode using the same source profile before falling back to other options. For example, if you watched an episode via *AIOStreams*, Nuvio will attempt to find the next episode from *AIOStreams* in the same quality before trying other providers.
- **Reuse Binge Groups:** Ensures that when you return to a TV series, the app automatically remembers and prioritizes the exact same stream source or release group you were previously watching. If you selected a specific 1080p release group, your session anchors to that profile. When resuming from "Continue Watching," Nuvio will specifically look for that exact release group rather than auto-selecting a new source.
- **Next Episode Threshold Mode:** Used as a fallback if no outro skip is present. This can be set in 0.5% increments from 100% down to 97%.
  - *At 100%:* Nuvio will not begin the source selection process until the media is completely finished.
  - *At 97%:* Nuvio will begin the source selection process when the media is 97% complete (e.g., for a 30-minute show, selection begins at 29 minutes and 6 seconds).
- **Are You Still Watching?** [Android TV Only]: Prompts the user after a set number of consecutive auto-played episodes to prevent infinite playback if you fall asleep.

[Back to top](#Nuvio-player-settings)

---

## Subtitle and Audio

### Audio Settings
These settings determine the default spoken language tracks selected when a stream starts.
- **Preferred Audio Language:** The primary spoken language you want the application to automatically select if the media file contains multiple audio tracks.
- **Secondary Audio Language:** Your fallback audio track if the primary choice is unavailable.
- **Skip Silence:** Dynamically skips silent portions of audio during playback.
- **Enable downmix:** Uses the FFmpeg downmix path for audio processing. When disabled, audio follows the standard Android/device path.
  - "Downmixing" means taking a massive surround sound audio track (like 5.1 or 7.1 audio meant for 6 to 8 speakers) and squishing it down into just two channels (Left and Right) for a standard stereo setup.
  - If you are just using your built-in TV speakers or a basic 2.0 soundbar, your system physically cannot play the dedicated "center channel" where 90% of the dialogue comes from in modern movies. If you ever feel like the explosions are deafening but the actors' voices are whispering, it is because you are missing the center channel. Turning this on forces the app to correctly blend all those surround sound speakers into a stereo format so you can hear the voices clearly.

### Subtitle Preferences
These configurations control which text translations are displayed on screen and how menus are filtered.
- **Preferred Language:** The primary language for your subtitles.
- **Secondary Preferred Language:** Your fallback subtitle language.
- **Use Forced Subtitles (Toggle On/Off):** Prioritizes "forced" subtitles that match your preferred language. Forced subtitles translate foreign languages, alien dialogue, or on-screen text while the rest of the media remains in your primary spoken language.
- **Show Only Preferred Languages (Toggle On/Off):** Filters the subtitle menu to hide all tracks except those that exactly match your primary and secondary language preferences.
- **Subtitle Styling** [TV Optimized]: Offers granular control over subtitle aesthetics including **Size (Scaling)**, **Vertical Offset** (to accommodate letterboxing), **Text Color**, **Background Color**, and **Outline/Outline Color**.
- **Use libass for ASS/SSA subtitles:** An experimental toggle to use the advanced libass engine for rendering complex styles, positioning, and animations of ASS/SSA subtitles.
  - Turning this on tells the player to use a specialized graphics engine (libass) to draw complex subtitles perfectly. If left off, the player might strip out all the colors and placement formatting, or worse, crash trying to read the file.

### Addon Subtitle Startup
Controls how aggressively Nuvio searches for external subtitles when a video begins playing, balancing load times against availability.
- **Fast startup:** Prioritizes immediate video playback by skipping the automatic fetch of external addon subtitles. You must manually request them from within the player.
- **Preferred only:** A balanced approach. Fetches subtitles from addons during the initial load, but only pulls those matching your language preferences.
- **All subtitles:** Fetches and loads every available addon subtitle for the video, maximizing choice at the cost of slightly longer loading times.

[Back to top](#Nuvio-player-settings)

---

## Player and Decoder Options

### Video Player & Interface
Controls the visual experience and interactions within the media player.

- **Loading Overlay:** Displays a continuous loading screen or graphic to hide buffering, black screens, or transitions. The overlay remains visible until the first frame of the video is ready.
- **Pause Overlay** [Android TV Only]: Shows a details overlay after 5 seconds while playback is paused.
- **OSD Clock** [Android TV Only]: Shows the current time and estimated end time while the transport controls are visible on screen.
- **Player:** Dictates which video engine handles your streams.
  - *Internal:* Keeps you inside Nuvio using its native player.
  - *Internal Engine:* Choose between ExoPlayer or libmpv as the primary renderer.
  - *Auto-switch engine on startup error* [Android TV Only]: Automatically falls back from ExoPlayer to libmpv for detected anime or if a stream fails to initialize.
  - *External:* Passes the video link to a third-party application installed on your device (e.g., VLC, MX Player).
- **Hold To Speed** [Mobile Only]: A touch-screen shortcut for skimming. Pressing and holding anywhere on the video player temporarily increases playback speed. Normal playback resumes when released.
- **Hold Speed** [Mobile Only]: Configures the exact playback speed multiplier when using the "Hold To Speed" feature.
- **Gesture Controls** [Mobile Only]: Activates vertical touchscreen sliding regions on the left and right sides of the screen panel to quickly adjust local volume and brightness.

### Advanced Processing & Decoding
Technical settings that determine how your device's hardware and software process raw video and audio data.

- **Decoder Priority:** Controls whether hardware or software (FFmpeg) decoders are used for audio and video.
  - *Device decoders only:* Only use built-in hardware decoders. Most compatible but may not support all formats.
  - *Prefer device decoders:* Use hardware decoders when available, fall back to FFmpeg. Recommended for most devices.
  - *Prefer app decoders (FFmpeg):* Use FFmpeg decoders when available. Better format support but higher CPU usage.
- **DV7 - HEVC Fallback:** Dolby Vision Profile 7 (DV7) is a premium HDR format. Playing a DV7 file on unsupported hardware often results in distorted colors (e.g., a completely purple or green screen). Enabling this strips the unreadable Dolby Vision data and maps the video down to standard HEVC (H.265) for correct color playback.
- **Preserve DV mapping (DV7 to DV8.1)** [Android TV Only]: Keeps original creator-intended tone-mapping at the cost of slightly more processing power per frame.
- **Convert DV5 to DV8.1** [Android TV Only]: Signals Profile 5 streams as Profile 8.1 for HDR10-compatible output, helping correctly map colors on devices that lack a native DV5 decoder.
- **Auto Frame Rate & Resolution** [Android TV Only]: Dynamically adjusts your television hardware's refresh rate to natively match the source file frame pacing, eliminating panning judder. Options include:
  - *Off:* Don't change display refresh rate.
  - *On start:* Switch when playback starts.
  - *On start/stop:* Switch on start and restore on stop.
- **Tunneled Playback:** An advanced Android TV feature. It allows audio and video streams to bypass standard OS pathways and process directly at the hardware level. This improves audio/video synchronization (lip-sync) and ensures smoother playback for heavy 4K HDR files.
  - Normally, your TV's processor juggles everything at once: the video, the audio, the interface menus, and background apps. Tunneled Playback creates a fast lane that sends the raw video and audio straight to the TV's screen and speakers, completely bypassing the standard Android operating system.
  - Recommendation: Leave this off by default. You should only turn this on if you are experiencing "lip-sync" issues (where the audio doesn't match the actors' mouths) or if massive 4K HDR files are dropping frames and stuttering. Because this feature bypasses the normal TV operating system, it can cause very weird glitches if your TV hardware doesn't perfectly support it.
- **Force AC-3 Transcoding (Optical/SPDIF):** Transcodes multichannel formats (TrueHD, DTS, AAC, etc.) to Dolby Digital 5.1 in real-time for Optical/SPDIF connections.
  - Older optical audio cables (the ones with the glowing red light) have a strict bandwidth limit. They physically cannot transmit heavy, modern, uncompressed audio formats like TrueHD or DTS-HD. They max out at standard Dolby Digital 5.1 (also known as AC-3).
  - If you have an older AV receiver or soundbar hooked up to your TV via an optical cable, trying to play a modern 4K movie with a TrueHD track will result in dead silence or horrible static. This setting acts as a live translator. It grabs the heavy modern audio and instantly crushes it down into standard Dolby Digital 5.1 on the fly, ensuring your older sound system can actually play the movie.

[Back to top](#Nuvio-player-settings)

---

## Buffer and Network [Android TV Only]

These configurations govern internal memory allocation thresholds, local system caching pools, and network data transit rules on Android TV.

They live together under **Settings → Playback → Buffer & Network**, but they are **not all the same feature**:

- **ExoPlayer Native Memory:** Optional engine path for how the buffer is stored in RAM.
- **Custom Playback Buffers:** Time windows and target size for ahead-buffering. Works with or without Native Memory.
- **Disk Cache:** Optional on-disk progressive cache.
- **Custom Network / Parallel Connections:** Multi-connection downloads for progressive streams. Works with or without Native Memory.

> [!IMPORTANT]
> These options exist on the **Android TV** build of Nuvio only. They are not available on Mobile, iOS, or webOS.

---

### ExoPlayer Native Memory

During playback, Nuvio continuously caches upcoming media ahead of the active cursor position so short network interruptions do not stall the stream. That reserve is the **buffer**.

On many Android TV sticks and boxes, the application is constrained to a limited private memory footprint even when the device reports substantial total RAM. High-bitrate 4K and remux sources demand large ahead-buffers. When those buffers compete inside the app's restricted private share, users can encounter mid-playback stalls, laggy interface response, or process instability, even while free system memory still appears available.

**ExoPlayer Native Memory** relocates that ready-ahead buffer into a more efficient native memory region and enables a streamlined data path through the ExoPlayer engine. In practical terms, Nuvio can retain more upcoming content without colliding with the device's usual per-app memory ceiling.

When the mode is enabled, Nuvio also:

- Applies a tuned starter profile for buffer durations, target allocation size, and parallel download behavior
- Surfaces device memory detection and a **Recommended Safety Limit** beneath the toggle
- Unlocks extended buffer duration ranges under **Custom Playback Buffers** compared with stock mode

What Native Memory does **not** alter:

- Picture quality, HDR tone mapping, or decoder selection
- Network bandwidth itself. A source that exceeds your real download speed will still stall.
- Playback under the **libmpv** internal engine. This path applies only to **ExoPlayer**.
- Whether you *must* use Parallel Connections. Network settings remain independently configurable.

> [!NOTE]
> Devices must run **Android 8.0 (Oreo)** or newer. Older firmware displays a not-supported message under the toggle.

**Enable Native Memory when:**

- High-quality 1080p or 4K streams continue rebuffering despite a stable, sufficient connection
- Scrubbing inside an already-buffered range feels sluggish on TV hardware
- You routinely play debrid-backed remuxes or other large progressive sources on a stick or box

**Leave Native Memory disabled when:**

- Stock playback is already stable and you prefer default Media3 behavior
- Enabling the mode introduces instability on very low-memory hardware
- You are isolating a codec/renderer issue and want the simplest player memory path

**Recommended baseline after enabling:**

1. Enable **ExoPlayer Native Memory**.
2. Keep **Managed Memory Budget** active.
3. Leave remaining buffer sliders at the values Nuvio applies on enable.
4. Evaluate with a representative title before applying manual overrides.
5. Decide Parallel Connections separately via [Stream Throughput Diagnostics](#stream-throughput-diagnostics-advanced-parallel-test). Do not assume the starter network profile is ideal for every CDN.

When active, the settings surface presents a readout similar to:

> [!NOTE]
> **Device Memory:** 4 GB  
> **Recommended Safety Limit:** 1000 MB
>
> The safety limit is Nuvio's calibrated ceiling for target buffer allocations on the detected hardware tier. Remain at or below that threshold unless you intentionally accept elevated crash risk.

[Back to top](#nuvio-player-settings)

---

### Custom Playback Buffers

Completely overrides stock Media3 parameters with specialized processing limits. When off, the player uses stock Media3 buffer durations and target sizes, or the Native Memory starter profile when that mode is on.

These controls work **with or without** Native Memory. Native Memory changes *where* buffer data lives; Custom Playback Buffers change *how much time and RAM* the player targets.

- **Min / Max Buffer Duration:** Calibrates the safe minimum and maximum content duration thresholds to cache ahead of the active video cursor position. Higher ceilings reduce stall frequency on unstable links but increase memory pressure. Native Memory unlocks a substantially longer duration range than stock mode.
- **Initial Buffer:** Sets the precise buffering depth required before an initialized video stream boots. Lower values start faster but may cause initial stuttering on slow connections.
- **Buffer After Rebuffer:** Sets the buffering depth required when reclaiming feeds after a playback stall. Higher values reduce repeated buffering interruptions.
- **Back Buffer Duration:** Holds already-viewed stream data inside local system memory arrays to enable instant seek-back actions without re-downloading source content. Set to 0 to disable and save memory. The interface reports an estimated reserve held on top of Target Buffer.
- **Managed Memory Budget:** Caps the buffer to a safe share of this device's memory. Turn off to set the Target Buffer Size yourself (advanced: large values can crash low-memory devices).
- **Target Buffer Size:** Maximum RAM used for ahead-buffering. Calculated from your device's available memory. Requires turning off Managed Memory Budget. With Native Memory active, limits track total device memory tiers and the recommended safety limit.
- **Allow Larger Target Buffer:** Removes the device-memory cap on the Target Buffer Size slider, allowing values up to 2GB. May crash on devices with less than 2GB of RAM.

> [!WARNING]
> Elevated buffer allocations are not universally beneficial. On low-RAM sticks, oversized targets can thrash system memory and degrade interface responsiveness. If Target Buffer Size surfaces an **orange** or **red** warning, return toward the recommended safety limit.

Duration thresholds and target size interact: the player ceases loading when either the maximum duration window or the memory ceiling is reached. A long duration ceiling paired with a tiny target size still cannot retain substantial content.

[Back to top](#nuvio-player-settings)

---

### Disk Cache

Establishes fixed storage caching partitions that extend protection beyond pure in-memory buffering.

- **VOD Disk Cache:** Saves active downloaded file arrays directly onto internal storage to shield progressive media playback from momentary network drops. Extends instant seek-back beyond the in-memory back buffer. Only applies to progressive streams (no HLS/DASH).
- **Auto Size:** Automates cache constraints targeting roughly 10% of total available free space, with manual overrides to maintain strict storage headroom margins (about 1024MB headroom in manual mode).

[Back to top](#nuvio-player-settings)

---

### Network & P2P

Deploys download-path controls that determine how aggressively progressive and torrent-style sources are fetched. These options are **independent of Native Memory**. You can use Parallel Connections with Native Memory off, or leave parallel off while Native Memory is on.

- **Custom Network:** Master toggle for multi-connection progressive downloads. When off, the player uses a single connection for the stream.
- **Enable HTTP/2:** Enables HTTP/2 protocol handling for supported endpoints, allowing request multiplexing and faster handshake times.
- **Parallel Connections:** When Custom Network is on, downloads different byte ranges of a progressive file (MKV/MP4) across multiple TCP connections simultaneously. HLS/DASH already segment their own downloads and do not use this path.
- **Connection Count:** Number of concurrent range connections. Higher values can raise throughput on CDNs that throttle per connection, but also increase memory and connection overhead.
- **Chunk Size:** Size of each range request piece per connection. Larger chunks reduce request overhead; smaller chunks can adapt faster on some hosts.
- **P2P Streaming:** Enables or restricts direct processing configurations for raw peer-to-peer (torrent) streams.
- **Hide torrent stats:** Suppresses real-time peer connection logs, seed counts, and download speed overlays from appearing during loading and playback screens.

#### Why parallel connections exist

Many debrid and CDN hosts cap throughput on a **single** TCP connection (often in the tens to low hundreds of Mbps), even when your home link is much faster. Parallel range downloads open several connections and request different parts of the same file at once, so aggregate speed can climb closer to your real bandwidth.

That only works when the host supports **HTTP byte ranges** (`Accept-Ranges: bytes` / `Content-Range`). If the CDN does not support ranges, Nuvio automatically falls back to a single connection. Enabling Parallel Connections then adds overhead with little or no gain.

> [!TIP]
> Parallel connections are most useful when your **internet is fast**, the **source is progressive** (not HLS/DASH), and the **CDN throttles single connections**. They are not a fix for an undersized link or an expired stream URL. Do not leave them on blindly; verify with the diagnostic below.

[Back to top](#nuvio-player-settings)

---

### Stream Throughput Diagnostics (Advanced Parallel Test)

Nuvio includes an advanced diagnostic that measures whether **your last played stream's host/CDN** actually benefits from parallel range downloads. Use this before leaving Parallel Connections permanently on.

#### Where to run it

1. Play a representative progressive stream once (so Nuvio records the stream URL and headers).
2. Open **Settings → Advanced**.
3. Select **Run Last Played Stream Speed Test** under **Stream Throughput Diagnostics**.

If no playback has been recorded yet, the card shows that you must play a video first. Expired or unreachable links fail with a connection error. Play the title again and retest.

#### What the test measures

Each stage runs for about **8 seconds** against the last played stream host:

| Result row | What it measures |
| :--- | :--- |
| **Standard Single Connection (Baseline)** | One normal download path (the default player behavior) |
| **Parallel Connect (1 MB Chunks)** | Parallel range downloads with 1 MB pieces |
| **Parallel Connect (4 MB Chunks)** | Same with 4 MB pieces |
| **Parallel Connect (8 MB Chunks)** | Same with 8 MB pieces |
| **Parallel Connect (16 MB Chunks)** | Same with 16 MB pieces |

The parallel stages use the same multi-range pipeline as playback (multiple concurrent connections). When available, the card also shows **Average Video Bitrate** for the last stream so you can compare download speed against the file's needs.

#### How to read the results

Compare **Baseline** to the best **Parallel** row:


##### 📊 Outcome Scenarios

- **Scenario 1: Baseline is higher than (or roughly equal to) every Parallel result**
  - **What it means:** The CDN already feeds a single connection well, or range parallelism does not help this host.
  - **Recommendation:** Keep **Custom Network / Parallel Connections off**. Extra connections only burn memory and CPU.

- **Scenario 2: One or more Parallel rows clearly beat Baseline** (for example +20% or more)
  - **What it means:** The host/CDN benefits from multi-range fetching.
  - **Recommendation:** Turn **Custom Network** on, enable **Parallel Connections**, and set **Chunk Size** to the winning test (1 / 4 / 8 / 16 MB). Start with **Connection Count 3–4**.

- **Scenario 3: All Parallel rows are much lower than Baseline**
  - **What it means:** Range requests may be unsupported, rate-limited, or inefficient on this CDN.
  - **Recommendation:** Leave parallel **off**. Nuvio would also fall back to single-connection if ranges are rejected during real playback.

- **Scenario 4: Parallel wins, but still below Average Video Bitrate**
  - **What it means:** Network or host cannot sustain the file.
  - **Recommendation:** Lower stream quality / pick a better source; parallel alone will not fix an undersized link.

- **Scenario 5: Baseline already far above Average Video Bitrate**
  - **What it means:** Single connection already has headroom.
  - **Recommendation:** Prefer parallel **off** unless you still see rebuffers (then retest during a weaker evening network window).

**Practical examples:**

- Baseline **180 Mbps**, best Parallel **95 Mbps**, video bitrate **40 Mbps** → **leave parallel off**. Single connection is already plenty.
- Baseline **45 Mbps**, Parallel 8 MB **140 Mbps**, video bitrate **60 Mbps** → **enable parallel**, Chunk Size **8 MB**, Connection Count **4**.
- Baseline **30 Mbps**, all Parallel near **0 or failed** → host/link problem or expired URL; **do not** enable parallel; re-play and retest or change source.

#### Applying results in Buffer & Network

1. Go to **Settings → Playback → Buffer & Network**.
2. If parallel won: enable **Custom Network** → **Parallel Connections**, set **Chunk Size** to the winning size, set **Connection Count** conservatively (Native Memory starter uses **4 × 16 MB**; only keep 16 MB if that row actually won).
3. If baseline won: disable **Custom Network** or leave **Parallel Connections** off even if Native Memory turned parallel on as part of its starter profile.
4. Re-test after changing debrid providers or major CDN hosts. Different hosts behave differently.

> [!NOTE]
> The general Fast.com / latency speed test on the Advanced screen measures overall internet capacity. The **Stream Throughput** test is different: it measures the **last played stream's CDN**, which is what matters for Parallel Connections.

[Back to top](#nuvio-player-settings)

---

### Recommended Device Configurations

Nuvio detects physical device RAM and maps it to a **Recommended Safety Limit** for target buffer allocations. Use the readout under **ExoPlayer Native Memory** (for example Device Memory: 4 GB, Recommended Safety Limit: 1000 MB) to identify your tier, then apply the matching profile below.

> [!NOTE]
> Enabling Native Memory applies a starter profile automatically: **Min 200s**, **Max 280s**, **Initial 1.5s**, **After Rebuffer 1.5s**, **Back Buffer 12s**, **Target Buffer = safety limit**, **Parallel Connections 4 × 16 MB**. Low-RAM tiers should dial those durations down; higher-RAM tiers can keep or extend them. Always re-validate Parallel Connections with Stream Throughput Diagnostics. The starter network values are not CDN-aware.

#### Safety limits by device RAM

These are the same thresholds Nuvio uses internally when Native Memory is active:

| Detected device memory | Recommended safety limit (Target Buffer) | Warning zone begins around |
| :--- | :--- | :--- |
| ~1 GB | **150 MB** | 180 MB |
| ~1.5 GB | **200 MB** | 250 MB |
| ~2 GB | **250 MB** | 325 MB |
| ~3 GB | **500 MB** | 650 MB |
| ~4 GB | **1000 MB** | 1200 MB |
| ~6 GB | **1600 MB** | 2000 MB |
| 8 GB+ | **2000 MB** | 2500 MB |

Stay at or under the safety limit unless you intentionally accept elevated crash risk. **Allow Larger Target Buffer** can open the slider as high as **2 GB**, but that path is advanced-only.

#### Low-RAM sticks (~1–2 GB), Fire TV Stick class and similar

Typical devices: Fire TV Stick Lite / 4K (older), budget Android sticks, entry Chromecast-class hardware.

| Setting | Recommended value |
| :--- | :--- |
| **ExoPlayer Native Memory** | **On** |
| **Managed Memory Budget** | **On** |
| **Target Buffer Size** | Leave managed (**150–250 MB** by tier) |
| **Allow Larger Target Buffer** | **Off** |
| **Min Buffer Duration** | **60–90 s** (lower than the 200s starter if the UI feels laggy) |
| **Max Buffer Duration** | **90–120 s** |
| **Initial Buffer** | **1.5–3 s** |
| **Buffer After Rebuffer** | **1.5–3 s** |
| **Back Buffer Duration** | **5–12 s** (prefer **0–5 s** if memory is tight) |
| **Custom Network / Parallel Connections** | Prefer **Off** unless Stream Throughput Diagnostics shows parallel clearly beating baseline |
| **Chunk Size** | Only if parallel wins: prefer **4–8 MB** (avoid the 16 MB starter on weak sticks) |

**Guidance:** Native Memory remains useful on this tier because the safety limit stays modest, but the automatic **200s / 280s** duration profile can over-commit weak sticks. After enabling Native Memory, open **Custom Playback Buffers** and reduce Min/Max if menus stutter during playback. Prefer 1080p over heavy remuxes when the connection or chipset is limited. Run the Advanced stream speed test before keeping parallel on. Low-RAM devices pay more for multi-connection overhead.

#### Mid-range boxes (~3–4 GB)

Typical devices: many mid-tier Android TV boxes, Google TV streamers with 3–4 GB, stronger Fire TV / Nvidia-class entry units.

| Setting | Recommended value |
| :--- | :--- |
| **ExoPlayer Native Memory** | **On** |
| **Managed Memory Budget** | **On** |
| **Target Buffer Size** | Leave managed (**500 MB** on ~3 GB, **1000 MB** on ~4 GB) |
| **Allow Larger Target Buffer** | **Off** (unless deliberately testing) |
| **Min Buffer Duration** | **120–200 s** (starter **200 s** is usually fine) |
| **Max Buffer Duration** | **200–280 s** (starter **280 s** is usually fine) |
| **Initial Buffer** | **1.5 s** |
| **Buffer After Rebuffer** | **1.5–3 s** |
| **Back Buffer Duration** | **12 s** |
| **Custom Network** | **On only if** Stream Throughput Diagnostics shows parallel beating baseline |
| **Parallel Connections** | **3–4** when parallel wins |
| **Chunk Size** | Match the winning diagnostic row (**4 / 8 / 16 MB**) |

**Guidance:** This is the “leave the buffer starter profile alone” tier for most debrid-backed 1080p and many 4K streams. If high-bitrate remuxes still rebuffer, raise **Min / Max Buffer Duration** first (for example Min **200 s**, Max **320–400 s**) rather than pushing Target Buffer Size into the orange/red warning zone. Keep Managed Memory Budget on so Target stays at the safety limit (**500 MB** or **1000 MB**). For network: if baseline already exceeds video bitrate with headroom, leave parallel **off** even though Native Memory’s starter may enable it.

#### Higher-end boxes (~6 GB)

Typical devices: higher-spec Android TV / Google TV boxes with 6 GB RAM.

| Setting | Recommended value |
| :--- | :--- |
| **ExoPlayer Native Memory** | **On** |
| **Managed Memory Budget** | **On** (Target ≈ **1600 MB**) |
| **Allow Larger Target Buffer** | Optional; only if Managed Budget is off and you stay under **~2000 MB** warning |
| **Min Buffer Duration** | **200–300 s** |
| **Max Buffer Duration** | **280–480 s** |
| **Initial Buffer** | **1.5 s** |
| **Buffer After Rebuffer** | **1.5–3 s** |
| **Back Buffer Duration** | **12–30 s** |
| **Custom Network** | Confirm with Stream Throughput Diagnostics first |
| **Parallel Connections** | **4–8** when parallel clearly beats baseline |
| **Chunk Size** | Winning diagnostic size; **16 MB** only if that row wins |

**Guidance:** Extended duration windows are appropriate for heavy 4K remux binge sessions. Prefer duration headroom over crossing the warning limit (**~2000 MB**). On gigabit links, parallel often helps only when the CDN caps single-connection speed. Always compare against baseline before raising connection count.

#### Flagship / high-RAM boxes (8 GB+)

Typical devices: flagship Android TV boxes, mini PCs running Android TV builds, high-memory NVIDIA / Amlogic platforms.

| Setting | Recommended value |
| :--- | :--- |
| **ExoPlayer Native Memory** | **On** |
| **Managed Memory Budget** | **On** (Target ≈ **2000 MB**) or manual at the safety limit |
| **Allow Larger Target Buffer** | Optional advanced path up to **2 GB**; treat values above the safety limit as experimental |
| **Min Buffer Duration** | **200–400 s** |
| **Max Buffer Duration** | **280–600 s** (higher only if still rebuffering on very large remuxes) |
| **Initial Buffer** | **1.5 s** |
| **Buffer After Rebuffer** | **1.5–3 s** |
| **Back Buffer Duration** | **12–60 s** for frequent reverse seeks |
| **Custom Network** | Confirm with Stream Throughput Diagnostics first |
| **Parallel Connections** | **4–8** when parallel wins (higher counts only if tests keep scaling) |
| **Chunk Size** | Winning diagnostic size (**8–16 MB** typical) |

**Guidance:** This tier can sustain long ahead-buffers for pristine 4K/HDR remuxes. Still respect orange/red Target Buffer warnings. Larger is not automatically smoother once the safety limit is already filling the pipeline. Do not enable parallel solely because RAM is high. Enable it only when the Advanced stream test shows multi-range throughput beating baseline on that CDN.

#### Quick “I just want it to work” path

1. Enable **ExoPlayer Native Memory** (optional but recommended on TV hardware for large files).
2. Confirm the **Device Memory / Recommended Safety Limit** line matches your hardware class.
3. Keep **Managed Memory Budget** on.
4. On **~1–2 GB** devices only: open **Custom Playback Buffers** and lower Min/Max to roughly **60–120 s**.
5. On **3 GB+** devices: leave the buffer starter profile and test a representative stream before changing durations.
6. Play a progressive stream, then run **Settings → Advanced → Run Last Played Stream Speed Test**. If **Baseline ≥ best Parallel**, turn **Custom Network / Parallel Connections off** (even if Native Memory enabled them). If Parallel wins, keep it on with the winning chunk size.

[Back to top](#nuvio-player-settings)

---

### Buffer & Network tips

- **Resolve source and network constraints first.** A high-bitrate remux on an undersized connection will stall regardless of buffer ceilings. Align stream quality with measured bandwidth and prefer cached debrid sources when available. See [Troubleshooting](../troubleshooting.md#11-video-stutters-or-buffers).
- **Treat Native Memory and Parallel Connections as separate decisions.** One optimizes buffer storage. The other optimizes the download path to a specific CDN.
- **Do not push every slider to the maximum.** Remember that Nuvio TV is not the only process on your device. The TV OS, launcher, system services, and other background apps still need memory. Forcing very high Target Buffer Size, long max durations, aggressive parallel chunks, or **Allow Larger Target Buffer** can leave the system short on RAM. Android then starts killing background apps and reclaiming memory mid-playback, which often shows up as dropped frames, hitching, laggy remote input, or the player stuttering even though the stream itself is fine. Stay near the recommended safety limit and leave headroom for the rest of the TV.
- **Apply changes incrementally.** Enable Native Memory, evaluate, then adjust duration thresholds only if residual stalling persists.
- **Restart the stream after major buffer changes** so the player rebuilds load-control and allocation parameters cleanly.
- **Use Reset to default** on Buffer & Network if manual calibration becomes unstable, then re-enable only the options you still need and retest.
- **Respect on-screen warnings** under Target Buffer Size: orange indicates above the recommended safe limit; red indicates elevated crash risk.

**Does Native Memory improve picture quality?**  
No. It only relocates and optimizes how upcoming media is stored ahead of the cursor.

**Does Native Memory operate with libmpv?**  
No. Set the internal engine to **ExoPlayer** to use Native Memory. Parallel Connections also apply to the ExoPlayer progressive path.

**Native Memory is on, but the stream still rebuffers.**  
Verify connection speed and source health first. Then raise Min/Max Buffer Duration and/or run Stream Throughput Diagnostics for parallel downloads.

**The interface freezes or remote input feels laggy during playback.**  
Re-enable **Managed Memory Budget**, disable **Allow Larger Target Buffer**, or apply **Reset to default**. Oversized allocations can thrash system memory beyond the player process alone.

[Back to top](#Nuvio-player-settings)

---

## MPV

### What is MPV?
MPV is a highly advanced, open-source media player engine built into Nuvio as an alternative to the standard ExoPlayer.

### Why is MPV especially good for Anime?
Anime relies heavily on a complex subtitle format called **ASS/SSA**. These aren't just plain text at the bottom of the screen; they include custom fonts, colors, animations, and precise on-screen positioning (like translating a Japanese sign in the background or showing bouncing karaoke lyrics). Standard players often struggle to render these correctly, leading to lag or missing text. MPV is widely considered the gold standard for rendering these complex anime subtitles flawlessly without dropping video frames.

### MPV Options Explained

The MPV configuration in Nuvio currently focuses on **Hardware Decoding**. This tells the player how it should utilize your device's physical chips to process the video.

- **Auto (auto-safe)**
  - *What it is:* A smart automatic mode.
  - *What it does:* It attempts to use your device's hardware chips to decode the video, but if it encounters an error or unsupported format, it safely falls back to software decoding so your video doesn't crash.
- **Hardware (direct) (mediacodec)**
  - *What it is:* The fastest, most efficient pathway.
  - *What it does:* It sends the video straight through your device's hardware decoder directly to the screen. This uses the least amount of battery and provides the smoothest playback on compatible devices.
- **Hardware (copy) (mediacodec-copy)**
  - *What it is:* Hardware decoding with a middle-man.
  - *What it does:* It uses the hardware chip to decode the video, but then copies the video frames back into the system's software memory before putting them on the screen. This is often necessary so the player can properly "draw" complex anime subtitles over the top of the video frame.
- **Disabled (no)**
  - *What it is:* Pure software decoding.
  - *What it does:* Completely turns off the hardware chips and forces your device's main processor (CPU) to do all the heavy lifting.

---

### Recommended Device Settings

- **For General Viewing:** Set to **Auto (auto-safe)** or **Hardware (direct)**. This will give you the best battery life and the smoothest playback for standard movies and TV shows.
- **For Anime Watchers:** Set to **Hardware (copy) (mediacodec-copy)**. If you are watching anime with heavy, stylized subtitles and notice visual glitches or black screens, "copy" mode ensures the subtitles can be properly layered over the video.

> [!WARNING]
> This option can cause the player to lag if you do not have sufficient resources to decode the video. Weaker Android TV boxes can struggle with this option.

- **For Troubleshooting:** If a specific video file is playing with a green screen, distorted colors, or just audio with no picture, change this to **Disabled (no)**. Forcing software decoding will usually bypass hardware incompatibilities and allow the file to play.

[Back to top](#Nuvio-player-settings)

