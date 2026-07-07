# Quick Start Guide

Want to get Nuvio up and running in 10 minutes? Follow this sequence:

## 1. Install the App
- **Android:** Download the APK and install. [Full Guide](installation/android-mobile.md)
- **Android TV:** Use the "Downloader" app to get the TV APK or sideload the APK. [Full Guide](installation/android-tv.md)
- **Windows:** Download and run the .msi installer. [Full Guide](installation/windows.md)
- **iOS:** Sideload the .ipa. [Full Guide](installation/ios.md)
- **WebOS:** Developer Mode Installation. [Full Guide](installation/webos.md)
- **Tizen:** Developer Mode Installation. [Full Guide](installation/tizen.md)

---

## 2. Add Your First Addon

<NuvioQuickstart />

Nuvio is empty by default. You need an addon to see content. See [Addons](/integrations/addons).
- [Android Mobile Only] Open Nuvio > **Settings** > **Content and Discovery** > **Addons**.
- [Android TV Only] The addons menu is accessible from the sidebar.
- Tap **Install from URL**.
- Enter a manifest link.

---

## 3. Connect Features & Integrations [Optional]
To enable metadata enrichment and external tracking, configure your external accounts.

### Trakt Configuration
1. Navigate to **Settings** > **Trakt** and click **Connect Trakt**.
2. Complete the external authentication, then return to the Nuvio Trakt settings screen.
3. Select your preferred **Library Source**.
4. Set your watch progress tracking options. You can sync between Trakt or Nuvio, but selecting **Nuvio Sync** is highly recommended for the most accurate watch progress.

> [!NOTE]
> Selecting Nuvio Sync will still allow Trakt to sync your watch progress.

5. Toggle **Comments On** if you want to view community discussions.

### Metadata Enrichment
Go to **Settings** > **Integrations** to add your developer API keys:
- **TMDB Enrichment** [Required for Mobile]: Toggle this feature **On** and input your personal **TMDB API Key** to fetch rich asset metadata.
- **MDBList:** Toggle this feature **On** and input your **MDBList API Key** to bring in rating data.

---

**Need more help?** Dive into the [Full Documentation](/settings/).
