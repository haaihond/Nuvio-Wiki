# WebOS Installation [WebOS Only]

WebOS requires sideloading the application using Developer Mode. This guide provides two options for installing Nuvio: automatically using the Nuvio Installer, or manually using the WebOS Dev Manager.

>[!NOTE]
> WebOS support is continually improving but may have minor limitations compared to Android TV.

## Option 1: Nuvio Installer (Automated)
The official installer provides a simplified way to deploy Nuvio directly to your TV without needing to manually download packages or use WebOS Dev Manager.

### 1. Enable Developer Mode on your TV
1. On your LG TV, open the **Content Store** (or Apps).
2. Search for and install the **Developer Mode** app.
3. Open the Developer Mode app. You will be prompted to log in with an LG Developer account. If you don't have one, create it at the LG Developer portal.
4. Once logged in, toggle **Dev Mode Status** to ON. The TV will restart.
5. After the restart, open the Developer Mode app again and toggle **Key Server** to ON.

### 2. Run the Nuvio Installer
1. Download and run the latest `Nuvio-WebTV-Installer` from the [Official Nuvio Releases](https://github.com/NuvioMedia/NuvioWeb/releases/latest). *(macOS users: If the app is blocked, move it to Applications and run `xattr -dr com.apple.quarantine "/Applications/Nuvio WebTV Installer.app"` and `codesign --force --deep --sign - "/Applications/Nuvio WebTV Installer.app"` in the terminal).*
2. Select **LG WebOS** on the "Select your TV OS" screen.
3. Choose **Simple Installation (Recommended)** to automatically fetch the latest release from GitHub.
4. On the configuration screen, enter your **TV IP Address**.
5. Enter your **Developer Mode Passphrase** (found in the Developer Mode app on your TV, required for the first connection).
6. Click **Install** and wait for the process to complete.

---

## Option 2: WebOS Dev Manager (Manual)
If you prefer not to use the automated installer, you can manually sideload the app using WebOS Dev Manager.

### Prerequisites
- A PC (Windows, macOS, or Linux).
- The **WebOS Dev Manager** installed on your PC.
- The latest `NuvioTV-webOS-*.ipk` file from the [Official Nuvio Releases](https://github.com/NuvioMedia/NuvioWeb/releases/latest).

### 1. Enable Developer Mode on your TV
1. On your LG TV, open the **Content Store** (or Apps).
2. Search for and install the **Developer Mode** app.
3. Open the Developer Mode app. You will be prompted to log in with an LG Developer account. If you don't have one, create it at the LG Developer portal.
4. Once logged in, toggle **Dev Mode Status** to ON. The TV will restart.
5. After the restart, open the Developer Mode app again and toggle **Key Server** to ON.

### 2. Connect your TV to WebOS Dev Manager
1. Open **WebOS Dev Manager** on your PC.
2. Click **Add Device**.
3. Enter the **IP Address** and **Passphrase** exactly as they appear in the Developer Mode app on your TV.
4. Follow the prompts to finish pairing.

### 3. Install the Package
1. In WebOS Dev Manager, navigate to the **Apps** section.
2. Click **Install**, and select the `NuvioTV-webOS-*.ipk` file you downloaded earlier.
3. Wait for the installation to finish.
4. Once installed, Nuvio will appear in your TV's launcher. 

---

## Troubleshooting
- **Session Expiration:** Developer Mode sessions expire after a certain amount of time (usually 999 hours or less). If this happens, your apps may disappear or fail to launch. Open the Developer Mode app and click **Extend Session** to refresh the timer.
- **Connection Issues:** Ensure both your TV and PC are on the same local network.
