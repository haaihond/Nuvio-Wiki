[Home](../../README.md) | [Quick Start](../../docs/quick-start.md) | [Overview](../../docs/overview.md) | [Features](../../docs/features.md) | [Installation](../../docs/installation/README.md) | [Settings](../../docs/settings/README.md) | [Troubleshooting](../../docs/troubleshooting.md) | [FAQ](../../docs/faq.md)

---
# Android TV Installation

Just like on Android Mobile, there are two ways to install Nuvio on Android TV. One, is getting it from the play store and the second, is sideloading it.

> [!NOTE]
> The google play store version lacks some features of the apk sideload version to comply with the Play Stores policies. It is recommended that you sideload it.

**APK Version**
1.  **Option 1 Enter the Downloader code**
    - Enable developer options
        - Go to your TV's Settings > System (or Device Preferences) > About. Scroll down to Android TV OS build (or just Build) and click your remote's select button on it 7 times until a pop-up appears saying "You are now a developer!"
        - Go back to the main Settings menu. Navigate to Apps > Security & Restrictions Unknown sources (or Install unknown apps). Find the Downloader app in the list and toggle the switch to the On position.
    - Using the Downloader app obtained from the play store
        - Open the Downloader app from your home screen.
        - When prompted, select Allow so the app can save files to your device.
        - Select the URL/Search box on the Home tab, type your code exactly: 1456465
    - The Downloader app will redirect and automatically download the Nuvio TV APK. When the prompt appears, click Install. Once finished, select Done (instead of Open).
    - Finally, hit Delete twice in the Downloader app to remove the setup file and save your TV's storage space.

2. **Option 2 Download the APK**
    - Open a web browser on your smartphone, obtain the latest [TV APK from Nuvio's official Github](https://github.com/NuvioMedia/NuvioTV/releases/tag/0.7.6-beta). Select the Universal Release.
    - Open the Google Play Store on both your phone and your Android TV. Search for and install the app Send files to TV on both devices.
        - Enable unknown sources using the above steps in Option 1.
        - Ensure your phone and TV are on the same Wi-Fi network. Open Send files to TV on your TV and select Receive.
        - Open the app on your phone, select Send, locate the Nuvio APK in your downloads, and select your TV to push the file over.
        - Select the file on the TV and install it.

3. Open Nuvio. You may be prompted to grant storage permissions and to allow Nuvio to install unknown apps. This is to allow Nuvio to update itself.

**Play Store**
1. You can obtain the Official Nuvio Play Store version by searching for it in the Play Store on the TV.

## Troubleshooting
- **Play Protect Warning:** Since Nuvio is not on the Play Store, you might see a "Blocked by Play Protect" popup. Tap **More details** > **Install anyway**.
- **App Not Installed:** Ensure you have enough storage space and that you aren't trying to install the Android TV version on a mobile device.
