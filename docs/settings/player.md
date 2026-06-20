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

[Back to top](#nuvio-player-settings)

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

[Back to top](#nuvio-player-settings)

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

[Back to top](#nuvio-player-settings)

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

[Back to top](#nuvio-player-settings)

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

[Back to top](#nuvio-player-settings)

---

## Buffer and Network [Android TV Only]

These settings manage how much video data is kept in memory and how peer-to-peer streams are handled.

### Custom Playback Buffers
Overrides Media3's default buffering with custom values. When off, the player uses stock Media3 buffer durations and target sizes.
- **Min Buffer Duration:** Minimum amount of media to buffer. The player will try to ensure at least this much content is always buffered ahead of the current playback position.
- **Max Buffer Duration:** Maximum amount of media to buffer. Must be at least the minimum buffer duration. Higher values use more memory but provide smoother playback on unstable connections.
- **Initial Buffer:** How much content must be buffered before playback starts. Lower values start faster but may cause initial stuttering on slow connections.
- **Buffer After Rebuffer:** How much content to buffer after playback stalls due to buffering. Higher values reduce repeated buffering interruptions.
- **Back Buffer Duration:** How much already-played content to keep in memory. Enables fast backward seeking without re-downloading. Set to 0 to disable and save memory. (Reserves ~50MB on top of Target Buffer).
- **Managed Memory Budget:** Caps the buffer to a safe share of this device's memory. Turn off to set the Target Buffer Size yourself (advanced: large values can crash low-memory devices).
- **Target Buffer Size:** Maximum RAM used for ahead-buffering. Calculated from your device's available memory. (Requires turning off Managed Memory Budget).
- **Allow Larger Target Buffer:** Removes the device-memory cap on the Target Buffer Size slider, allowing values up to 2GB. May crash on devices with less than 2GB of RAM.

### Disk Cache
- **VOD Disk Cache:** Persist downloaded bytes to disk for the current stream. Extends instant seek-back beyond the in-memory back buffer and survives brief network drops. Only applies to progressive streams (no HLS/DASH).
- **Auto Size:** When on, the cache is sized from free disk space. Turn off to pick a size manually. Auto mode targets about 10% of free space. Manual mode keeps about 1024MB headroom.

### Network & P2P
- **Custom Network:** Commands the download client to forge multiple parallel connections to fetch progressive streams (instead of a single connection) to maximize high-bandwidth networks.
- **P2P Streaming:** Enables or restricts direct processing configurations for raw peer-to-peer (torrent) streams.
- **Hide torrent stats:** Suppresses real-time peer connection logs, seed counts, and download speed overlays from appearing during loading and playback.

[Back to top](#nuvio-player-settings)

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

[Back to top](#nuvio-player-settings)

