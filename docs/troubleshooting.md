# Troubleshooting Guide

Find solutions to common issues with Nuvio below. Problems are grouped by category — jump to the section most relevant to your situation.

> [!TIP]
> Before diving into specific fixes, try the most common quick fixes first: **restart the app**, **clear the app's cache**, **check your internet connection**, and **verify your Debrid subscription is active**. These resolve the majority of reported issues.

---

## Quick Diagnostics

Run through this checklist before troubleshooting anything specific:

1. **Is your internet connection stable?** Run a speed test. Streaming typically requires 5–25 Mbps depending on quality.
2. **Is your Debrid subscription active and not expired?** Log in to your provider's website to confirm.
3. **Are your addons enabled?** Open Nuvio → Settings → Addons and verify they are toggled on.
4. **Is the app up to date?** Check for the latest Nuvio release and install it.
5. **Have you tried clearing the app cache?** Go to your device's System Settings → Apps → Nuvio → Clear Cache.

If none of these resolve your issue, continue to the relevant section below.

---

## 1. Playback Issues

### 1.1 Video Stutters or Buffers

Buffering is the most common complaint and almost always has a fixable cause. Work through the steps below in order.

**Step 1 — Confirm your Debrid service is connected** [Debrid Integration Only]

Nuvio relies on a Debrid service (e.g., TorBox, Real-Debrid, AllDebrid) to deliver high-quality, cached streams. Without one, streams are sourced from slower public peers.

- Open **Settings → Debrid** and verify your provider is listed and authenticated.
- If it shows an error, log out and re-authenticate.

**Step 2 — Check your internet speed**

Use a speed test app or visit a speed test site in your device's browser.

- For 1080p playback, aim for at least **10 Mbps**.
- For 4K/HDR, aim for at least **25 Mbps**.
- If your speed is consistently low, the issue is your connection, not Nuvio. Try moving closer to your router or switching from Wi-Fi to a wired connection.

**Step 3 — Clear the app cache**

A corrupted or oversized cache can cause playback to stall.

- On Android/Fire TV: **Device Settings → Applications → Nuvio → Clear Cache**.
- On mobile: **Device Settings → General → iPhone Storage → Nuvio → Offload App** [iOS Only], or **Settings → Apps → Nuvio → Storage → Clear Cache** [Android Mobile Only].
- Restart Nuvio after clearing.

**Step 4 — Toggle tunneled playback** [Android TV Only]

If your network filters or throttles video traffic, tunneled playback can help route around it.

- Go to **Settings → Playback** and toggle the **Tunneled Playback** option on or off (see [Player Settings](settings/player.md#player-and-decoder-options)).
- Test with it both enabled and disabled to see which performs better on your network.

**Step 5 — Adjust Auto Frame Rate & Resolution settings** [Android TV Only]

Mismatched frame rates between the stream and your display can cause judder or dropped frames that look like buffering.

- Go to **Settings → Player → Advanced Processing & Decoding → Auto Frame Rate & Resolution** and experiment with the available options. Choices are **Off**, **On start** (switch when playback begins), and **On start/stop** (also restores your display's original rate when you stop).
- If your TV/display does not support AFR well, setting it to **Off** may give smoother results.

**Step 6 — Adjust buffer settings** [Android TV Only]

On Android TV devices, you can increase how much video is pre-loaded into memory, which smooths out playback on slower or less stable connections — especially for high-bitrate 4K streams.

- Go to **Settings → Playback → Buffer & Network** and enable **ExoPlayer Native Memory** first. This relocates the ready-ahead buffer into a more efficient area of device memory on TV sticks and boxes. Full guide: [Player Settings — Buffer and Network](settings/player.md#buffer-and-network-android-tv-only).
- If residual stalling continues, enable **Custom Playback Buffers** and raise **Min / Max Buffer Duration** to extend the content duration thresholds cached ahead of the active cursor.
- For progressive streams, run **Settings → Advanced → Run Last Played Stream Speed Test** before enabling Parallel Connections — if baseline is already faster, leave parallel off (see [Stream Throughput Diagnostics](settings/player.md#stream-throughput-diagnostics-advanced-parallel-test)).
- Retain **Managed Memory Budget** so Nuvio keeps target buffer allocations within a safe share of device memory.

> [!NOTE]
> Higher buffer values consume more RAM. Enable **Managed Memory Budget** to let Nuvio automatically cap buffer usage to a safe share of your device's available memory, which prevents instability on lower-end devices.

**Step 7 — Dolby Vision Profile 7 (P7) Conversion** [Android TV Only]

- DV P7 conversion can cause weaker hardware to buffer. Toggle it in the app.

**Step 8 — Try an external player**

If Nuvio's built-in player continues to struggle, offloading to a dedicated player can help.

- Install **VLC** or **MX Player** from your device's app store.
- In Nuvio, go to **Settings → Player → External Player** and select your installed player.
- Try playing the same content again.

> [!NOTE]
> External players handle certain codecs (HEVC, AV1, Dolby Vision) differently. If the internal player buffers on a specific stream but an external player doesn't, the issue is codec-related rather than network-related.

---

### 1.2 No Audio or Black Screen

A black screen or missing audio usually points to a codec or renderer incompatibility rather than a network problem.

**Step 1 — Switch to an external player**

This is the fastest fix for codec-related rendering failures.

- Go to **Settings → Player → External Player** and select **VLC** or **MX Player**.
- Return to the content and try playing it again.

**Step 2 — Adjust audio decoding settings** [Android TV Only]

If video plays but there is no audio, or dialogue is inaudible beneath loud effects:

- Go to **Settings → Player → Subtitle and Audio → Audio Settings** and enable **Enable Downmix** (see [Player Settings](settings/player.md#subtitle-and-audio)). This converts multichannel surround audio (5.1 or 7.1) into stereo, which resolves cases where the center dialogue channel is effectively silent on stereo setups.
- If you are connecting your TV to a sound system via an **optical/SPDIF cable**, go to **Settings → Player → Advanced Processing & Decoding** and enable **Force AC-3 Transcoding (Optical/SPDIF)**. Optical connections have a strict bandwidth limit and cannot carry modern uncompressed formats like TrueHD or DTS-HD. This setting transcodes them to Dolby Digital 5.1 in real-time so your receiver can decode them.
- Confirm your TV or receiver is not muted and is not set to an audio format your hardware does not support.

**Step 3 — Fix distorted colors (green or purple screen)**

If video plays but with obviously wrong colors — a green tint, purple cast, or a completely washed-out image — your content is likely Dolby Vision Profile 7 (DV7), which many devices cannot natively decode.

- Go to **Settings → Player → Advanced Processing & Decoding** and enable **DV7 - HEVC Fallback** (see [Player Settings](settings/player.md#player-and-decoder-options)). This strips the unreadable Dolby Vision layer and maps the video down to standard HEVC (H.265), restoring correct colors.
- If you are on Android TV and seeing issues specifically with DV5 content, you can additionally try enabling **Convert DV5 to DV8.1** in the same menu.

**Step 4 — Try a different stream**

Sometimes a specific stream file is malformed. Use the stream picker (available during playback) to select an alternate source for the same content.

---

### 1.3 "No Streams Found"

This message means Nuvio queried your addons and received no usable results. There are several possible causes.

**Step 1 — Verify addons are enabled**

- Go to **Settings → Addons** and confirm at least one streaming addon is toggled on.
- If the list is empty, you will need to add an addon by entering its manifest URL.

**Step 2 — Confirm your Debrid subscription is valid**

Many addons filter out non-Debrid results by default. An expired or disconnected Debrid account will cause most streams to be hidden.

- Log in to your Debrid provider's website and check your account status.
- Re-authenticate in Nuvio under **Settings → Debrid** if necessary. [Debrid Integration Only]

**Step 3 — Try a different content source**

Different addons index different sources. If one addon shows no results:

- Switch to another enabled addon from the source picker.
- If you only have one addon, consider adding a second one for redundancy.

**Step 4 — Check whether the content is newly released**

Newly released movies and TV episodes may not yet be cached or indexed by Debrid providers or addon sources. This is expected behavior and not a bug.

- Wait 24–72 hours after a release date and try again.
- Some content may only appear after wider release (e.g., after a streaming exclusive window ends).

**Step 5 — Check your addon's configuration**

Some addons (e.g., AIOStreams) require specific configuration tied to your Debrid credentials. If the addon was recently reconfigured or your API key changed:

- Re-enter your addon manifest URL with updated credentials.
- Refer to the [Debrid Integration Guide](integrations/debrid.md) for your specific provider.

> [!WARNING]
> Do not share your addon manifest URL publicly — it typically contains your Debrid API key or account token.

**Step 6 — Addon Returns No Results**

If an addon is installed and enabled but never returns streams:

- Re-check the addon configuration. Many addons (e.g., AIOStreams) are configured with your Debrid credentials baked into the manifest URL. If your API key has changed or expired, you need to regenerate the manifest URL.
- Look at whether the addon is specifically for movies, TV, or both. Some addons only index certain content types.
- For self-hosted addons, verify the server is reachable and running. Check its logs for errors if you have access.

---

### 1.4 Poor Video Quality

If content plays but the quality is lower than expected (e.g., 480p instead of 1080p):

- **Check your Debrid provider's cache.** Not all content is cached in every quality. Open the stream picker and look for higher-quality options.
- **Review your addon quality filters.** Some addons have quality caps set during configuration. Re-configure your addon to allow 1080p or 4K sources.
- **Check your network speed.** Your connection may not support the highest quality tier available. A stable 25+ Mbps connection is recommended for 4K.

---

### 1.5 Subtitles Not Working

**Subtitles not appearing:**

- Go to **Settings → Player → Subtitle and Audio → Subtitle Preferences** and confirm subtitles are enabled and a preferred language is set.
- During playback, open the player menu and check whether a subtitle track is selected.
- If no tracks are listed, the content may not have embedded subtitles. Verify that **Addon Subtitle Startup** (under the same menu) is not set to **Fast startup**, as that mode skips the automatic external subtitle fetch.

**Subtitles are out of sync:**

- Use the subtitle delay/offset control in the playback menu to nudge timing forward or backward.
- If sync is consistently off for all content, check whether your player's audio delay setting is also offset.

**Subtitles cause stuttering at startup:**

- Go to **Settings → Player → Subtitle and Audio → Addon Subtitle Startup** and set it to **Fast startup** (see [Player Settings](settings/player.md#subtitle-and-audio)). This skips the automatic subtitle fetch so playback begins without waiting for external subtitle sources to respond. Subtitles can still be selected manually once the video is playing.

---

### 1.6 Wrong Audio Track Playing

If dialogue is in the wrong language or the wrong audio track is selected by default:

- Open the playback menu during the stream and switch the **Audio Track** to the correct language or channel layout.
- To set a permanent default: go to **Settings → Player → Subtitle and Audio → Audio Settings** and configure **Preferred Audio Language**. You can also set a **Secondary Audio Language** as a fallback if your primary choice is unavailable in a given stream.

---

## 2. App & Installation

### 2.1 "App Not Installed" Error

This error occurs during installation and usually has one of two causes.

**Cause 1 — Wrong APK version**

Nuvio has separate builds for different device types. Installing the wrong version triggers this error. Note that Android TV also needs to verify if it is the correct version.

- **Android phones/tablets:** Use the **Mobile** APK. See the [Android Mobile Installation Guide](installation/android-mobile.md).
- **Android TV, Fire TV, Google TV:** Use the **TV** APK. See the [Android TV Installation Guide](installation/android-tv.md).
- **Samsung Tizen (via TizenBrew):** Use the Tizen-specific installation process — see the [Tizen Installation Guide](installation/tizen.md).
- **LG WebOS:** See the [WebOS Installation Guide](installation/webos.md).

Download the correct version from the [Official Links](official-links.md) page, which includes links to the GitHub release pages for each build (Mobile, TV, and WebOS).

**Cause 2 — Insufficient storage space**

- Check your device's available storage under **Device Settings → Storage**.
- Free up at least 500 MB before attempting installation.
- On Android, you may also need to clear the package installer's own cache.

**Cause 3 — Signature conflict (upgrade scenario)**

If you are upgrading from an older version signed with a different key:

- Uninstall the existing version of Nuvio first.
- Reinstall the new APK from scratch.

> [!CAUTION]
> Uninstalling the app will clear locally stored settings. Export your configuration or note your addon URLs before uninstalling.

---

### 2.2 App Crashes on Launch

**Step 1 — Clear the app cache and data**

- Go to **Device Settings → Apps → Nuvio → Storage → Clear Cache**.
- If the crash persists, tap **Clear Data** (this resets the app to defaults).

**Step 2 — Check for OS compatibility**

Nuvio requires a minimum Android version. Check the release notes for the version you are installing to confirm your device's OS version is supported.

**Step 3 — Reinstall the app**

If clearing data does not help:

- Uninstall Nuvio completely.
- Reboot your device.
- Download the latest APK and reinstall.

**Step 4 — Check for conflicting apps**

Some VPN or firewall apps running in the background can block Nuvio from initializing. Temporarily disable any active VPN or DNS filtering app and test whether Nuvio launches successfully.

---

### 2.3 App Won't Update

- If updating via an APK: ensure you are downloading the correct variant (Mobile vs. TV) and that **Install from Unknown Sources** is enabled in your device settings.
- If updating via a store (where applicable): force-stop the store app, clear its cache, and try again.
- If an older version is blocking the update due to a signing mismatch: uninstall the old version first, then install the new one.

---

### 2.4 Login / Account Issues

- If your Nuvio account shows as logged out after an app update, re-enter your credentials in **Settings → Account**.
- If you have forgotten your password, use the password reset flow at the official site.
- Ensure the date and time on your device are accurate. Authentication tokens can fail if your device clock is significantly off.

---

## 3. Sync & Trakt Issues

### 3.1 Trakt Sync Not Working

Trakt is used to sync your watch history, progress, and ratings across devices. If sync appears broken:

**Step 1 — Re-authenticate Trakt**

- Go to **Settings → Trakt**.
- Tap **Log Out**, then **Log In** and complete the authorization flow again. For detailed setup and sync scopes, see [Trakt Integration](integrations/trakt.md) or the [Trakt Bridge Import Tool](integrations/tmdb-mdblist-trakt.md#trakt-integration).
- This refreshes your access token and resolves the majority of Trakt sync failures.

**Step 2 — Check Trakt's service status**

Trakt occasionally experiences outages. If re-authentication does not help, check [Trakt's status page](https://trakt.tv) or community forums for reported issues.

---

### 3.2 Watch Progress Not Saving

- Confirm that Trakt integration is active if using for watch progress and authenticated (see above).
- Nuvio scrobbles progress when you reach a certain threshold of a video. Playing only a few seconds may not trigger a scrobble.
- If you are using an external player, scrobbling may not be supported. Switch back to the internal player for automatic progress tracking.

---

### 3.3 Library or Watchlist Not Updating

- Go to **Device Settings → Apps → Nuvio → Storage → Clear Cache**.
- If items added on another device are not appearing, confirm both devices are authenticated to the same Trakt account, if using Trakt.

---

## 4. Addon Issues

### 4.1 Manifest URL Error

If Nuvio displays an error when you try to add an addon:

- **Check the URL format.** The URL must begin with `https://` (not `http://`). Even a single incorrect character will cause the manifest to fail to load.
- **Check for trailing spaces.** Copy the URL carefully — invisible trailing spaces can break the request.
- **Verify the addon server is online.** Paste the URL directly into a browser. You should see a JSON manifest. If you see an error or timeout, the addon server may be down.
- **Check your network.** Some addon servers are geo-restricted. If you are using a VPN, try with it disabled, or enable it if the server is in a restricted region.

---

### 4.2 Addons Disappeared After Update

After a Nuvio update, addon configurations are sometimes reset.

- Re-add your addon manifest links manually via **Settings → Addons → Add Addon**.
- Community addon manifest URLs can change. Check the [Official Channels](official-links.md) for the most current URLs.

> [!TIP]
> Keep a personal note of your addon manifest URLs, especially for self-hosted or custom-configured addons where the URL includes your personal API key or configuration hash.

---

### 4.3 Addon Loads Slowly

Slow addon responses extend the time it takes for the stream list to appear.

- Some community addons run on low-resource servers and will simply be slow during peak hours.
- If you self-host an addon, check its server resource usage and logs.

---

## 5. Debrid Service Issues

### 5.1 Debrid Not Connecting [Debrid Integration Only]

- Go to **Settings → Debrid** and check the status indicator next to your provider.
- If it shows disconnected or an error, tap to re-authenticate.
- Verify your API key is still valid by logging in to your provider's website. Some providers rotate API keys periodically or after a password change.
- If you use a VPN, confirm your VPN's IP is not blocked by your Debrid provider. Some Debrid services block VPN IP ranges to enforce their terms of service.

---

### 5.2 Subscription Expired or Unrecognized

- Log in directly to your Debrid provider's website to confirm your subscription status.
- If you recently renewed, it may take a few minutes to propagate. Log out of Nuvio's Debrid integration and back in to refresh.
- Ensure you are using the **API key** where required, not your login password.

---

### 5.3 Downloaded or Cached Content Not Playing

- Verify that the content is actually cached by your Debrid provider. Not all torrents/sources are cached.
- Some Debrid services have download limits or restrict playback after a quota is reached. Check your provider's account dashboard.
- Try selecting a different stream from the stream picker — there may be an alternate cached source available.

---

## 6. Connectivity & Network Issues

### 6.1 General Connectivity Problems

If Nuvio cannot reach its servers or load any content at all:

- Confirm your device has an active internet connection by opening a browser and loading a website.
- Restart your router and/or modem if the connection seems unstable.
- Try switching between Wi-Fi and mobile data to isolate whether the issue is specific to one connection type.
- Check whether the issue affects other apps as well. If only Nuvio is affected, the problem may be DNS-related.

---

### 6.2 VPN Conflicts

VPNs are a common source of intermittent connectivity and playback issues.

- **Try disabling your VPN** temporarily to test whether it is the cause.
- If Nuvio works without the VPN, your VPN's servers may be throttling video traffic or your Debrid provider may be blocking VPN IPs.
- Some Debrid providers explicitly prohibit use through VPNs in their terms of service.

---

### 6.3 Slow Stream Speeds

If streams load but are consistently slow regardless of content:

**Step 1 — Test Internet**
- Run a speed test from the same device. If your measured speed is much lower than your subscribed plan, the issue is your ISP or local network, not Nuvio.
- Check whether your ISP throttles video streaming traffic. A VPN may help in this case (test with and without).
- Switch from Wi-Fi to a wired Ethernet connection where possible, particularly on TV devices.
- On Wi-Fi, move closer to your router or switch to a 5 GHz network if your device supports it.

**Step 2 — Adjust Addon Subtitle Startup**

Automatically fetching all available subtitle tracks at startup can delay or interrupt stream initialization.

- Go to **Settings → Player → Subtitle and Audio → Addon Subtitle Startup** and set it to **Fast startup** (see [Player Settings](settings/player.md#subtitle-and-audio)).
- This skips the automatic subtitle fetch so video begins immediately. You can still select subtitles manually from within the player menu during playback.
- If you want subtitles loaded but with less overhead, **Preferred only** is a balanced middle option — it fetches only your configured language rather than every available track.

---

## 7. Performance Issues

### 7.1 App Running Slowly or Feeling Sluggish

- **Clear the app cache.** Over time, cached data accumulates and can slow navigation.
- **Reduce background apps.** Close other apps running in the background to free up RAM.
- **Check storage.** Devices with less than 500 MB of free storage often see degraded app performance. Free up space and restart.
- **Disable animations** in your device's developer settings if your hardware is older or underpowered.

---

### 7.2 High Memory Usage

- Decoder efficiency significantly affects battery life. Go to **Settings → Player → Advanced Processing & Decoding → Decoder Priority** and set it to **Prefer device decoders** (see [Player Settings](settings/player.md#player-and-decoder-options)). This uses your hardware decoder chips when available, offloading work from the CPU and reducing battery drain compared to software (FFmpeg) decoding.
- On Android TV, if the app or system UI becomes laggy during playback, re-enable **Managed Memory Budget**, disable **Allow Larger Target Buffer**, or use **Reset to default** on Buffer & Network. Oversized target buffer allocations can thrash system memory beyond the player process alone. See [Player Settings — Buffer and Network](settings/player.md#buffer-and-network-android-tv-only).
- Avoid leaving Nuvio running in the background indefinitely. Close it fully when not in use.

---

## 8. Platform-Specific Issues

### 8.1 Android Phone & Tablet

- **Sideloading:** Nuvio is distributed can be distributed as an APK. Enable **Install from Unknown Sources** under **Settings → Security** (or **Settings → Apps → Special App Access → Install Unknown Apps**) before installing. For full installation instructions, see the [Android Mobile Installation Guide](installation/android-mobile.md).
- **Picture-in-Picture (PiP):** If PiP does not work, go to **Device Settings → Apps → Nuvio → Picture-in-Picture** and enable it.
- **Orientation lock:** If the app is stuck in portrait or landscape mode, check your system-level screen rotation lock.

---

### 8.2 Android TV / Fire TV / Google TV

- Always use the **TV build** of Nuvio. The Mobile build will not install or function correctly on TV devices. For full installation instructions, see the [Android TV Installation Guide](installation/android-tv.md).
- **Fire TV:** If installation is blocked, go to **Settings → My Fire TV → Developer Options → Install Unknown Apps → Nuvio** and enable it.
- **Google TV:** Use a file manager such as **Files by Marc** to locate and install the APK after downloading it if you cannot find it.

---

### 8.3 Samsung Smart TV (Tizen / TizenBrew)

Samsung Tizen TVs do not support direct APK sideloading. Nuvio must be installed via the dedicated installation or **TizenBrew**.

- For full installation instructions, see the [Tizen Installation Guide](installation/tizen.md).
- If the app fails to load after installation, confirm TizenBrew is running the correct Nuvio Tizen build.

---

### 8.4 iOS / iPadOS

- Nuvio on iOS may require installation via **AltStore**, **Sideloadly**, or a similar sideloading tool, depending on the distribution method. For full installation instructions, see the [iOS Installation Guide](installation/ios.md).
- If the app expires (a common issue with sideloaded iOS apps), re-sign it using your tool of choice.
- iOS has stricter background activity limits. Playback that pauses when the screen locks may require enabling **Background App Refresh** for Nuvio in iOS Settings.
- **Playback Error ("File type not supported" / format error):**
  - **No P2P support:** iOS does not support raw peer-to-peer (P2P/torrent) streaming. Apple is not fond of it and doesn't allow it, so P2P torrent streaming will likely never be supported natively on iOS.
  - **Use Debrid/Plugins:** To stream on iOS, you must use a Debrid service (e.g., TorBox, Real-Debrid, Premiumize) or a plugin that caches the files and streams them to the player over HTTPS. Make sure your scraper addons are configured to resolve links via Debrid rather than returning raw P2P links.
  - **Verify file type compatibility:** Ensure you are playing standard video files (like MP4 or H.264/HEVC inside compatible containers). Apple's built-in player is restrictive; if a stream fails to play, try configuring an external player like VLC, Outplayer, or Infuse.

---

## 9. When to Seek Further Help

If you have worked through the relevant sections above and your issue persists, it may require community input or direct support.

**Gather this information before reaching out:**

- Your device type and OS version (e.g., Fire TV Stick 4K, Fire OS 7).
- The version of Nuvio you have installed.
- Your Debrid provider (e.g., TorBox, Real-Debrid, AllDebrid).
- Which addons you have installed.
- A clear description of the problem, including any error messages displayed.
- Steps you have already tried.

**Where to get help:**

- **Community support and discussion:** See the [Official Channels](official-links.md) for Discord, Reddit, and other community spaces.
- **Bug reports:** If you believe you have found a bug specific to the app, report it through the official GitHub Issues page (linked in [Official Channels](official-links.md)).

> [!IMPORTANT]
> Never share your Debrid API key, addon manifest URLs, or account credentials publicly when asking for help. Redact them from any screenshots or logs you share.
