# WebOS Installation [WebOS Only]

WebOS requires sideloading the application using Developer Mode. This guide provides two options for installing Nuvio: automatically using the Nuvio Installer, or manually using the WebOS Dev Manager.

>[!NOTE]
> WebOS support is continually improving but may have minor limitations compared to Android TV.

## Option 1: Nuvio Installer (Automated)
The official installer provides a simplified way to deploy Nuvio directly to your TV without needing to manually download packages or use WebOS Dev Manager.

### 1. Enable Developer Mode on your TV
  - On your LG TV, open the **Content Store** (or Apps).
  - Search for and install the **Developer Mode** app.
  - Open the Developer Mode app. You will be prompted to log in with an LG Developer account. If you don't have one, create it at the LG Developer portal.
  - Once logged in, toggle **Dev Mode Status** to ON. The TV will restart.
  - After the restart, open the Developer Mode app again and toggle **Key Server** to ON.

### 2. Run the Nuvio Installer
  - Download and run the latest `Nuvio-WebTV-Installer` from the [Official Nuvio Releases](https://github.com/NuvioMedia/NuvioWeb/releases/latest).
    - *(macOS users: If the app is blocked, move it to Applications and run `xattr -dr com.apple.quarantine "/Applications/Nuvio WebTV Installer.app"` and `codesign --force --deep --sign - "/Applications/Nuvio WebTV Installer.app"` in the terminal).*
    - *Windows users: If the app is blocked, click on "More info" then "Run anyway"*
  - Select **LG WebOS** on the "Select your TV OS" screen.
  - Choose **Simple Installation (Recommended)** to automatically fetch the latest release from GitHub.
  - On the configuration screen, enter your **TV IP Address**.
  - Enter your **Developer Mode Passphrase** (found in the Developer Mode app on your TV, required for the first connection).
  - Click **Install** and wait for the process to complete.

---

## Option 2: Homebrew Channel

The **webOS Homebrew Channel** acts as an unofficial app store directly on your TV. While it requires a PC for the initial installation, it allows you to install and update Nuvio directly from your TV moving forward.

### 1. Install the Homebrew Channel via PC
  - Enable Developer Mode on your TV
  - Open the **Content Store** (or Apps) on your LG TV.
  - Search for and install the **Developer Mode** app.
  - Open the app and log in with an LG Developer account (create one at the LG Developer portal if needed).
  - Toggle **Dev Mode Status** to ON. The TV will restart.
  - Open the Developer Mode app again and toggle **Key Server** to ON.

### 2. Connect to WebOS Dev Manager
  - On your computer, download and open [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop/releases).
  - Click **Add Device**.
  - Enter the **IP Address** and **Passphrase** displayed in the Developer Mode app on your TV.
  - Follow the prompts to finish pairing.

### 3. Install the Homebrew Channel
  - In the webOS Dev Manager on your PC, navigate to the **Homebrew** tab or search the catalog.
  - Locate the **Homebrew Channel** and install it to the TV.

### 4. Install Nuvio
  - Launch the **Homebrew Channel** from your TV's app list.
  - Navigate to the **Search** or **Repository** tab.
  - Type in **Nuvio**.
  - Select the application and click **Install**.
  - Nuvio will now appear in your standard webOS app menu.

>[!TIP]
> LG Developer Mode sessions expire (usually after 999 hours). If the timer runs out, the Homebrew Channel and Nuvio will fail to launch. To prevent this, enable the background auto-renew feature built into webOS Dev Manager on your PC.

---

## Troubleshooting
- **Session Expiration:** Developer Mode sessions expire after a certain amount of time (usually 999 hours or less). If this happens, your apps may disappear or fail to launch. Open the Developer Mode app and click **Extend Session** to refresh the timer.
- **Connection Issues:** Ensure both your TV and PC are on the same local network.
