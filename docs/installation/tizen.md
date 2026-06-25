# Tizen Installation

Tizen requires sideloading the application using Developer Mode. This guide walks you through the process of installing Nuvio using either the automated Nuvio Installer or the manual method (Tizen Studio).

>[!NOTE]
> Tizen support is continually improving but may have minor limitations compared to Android TV.

## Option 1: Nuvio Installer (Automated)
The official installer automates package downloading and certificate generation, offering a streamlined experience.

### 1. Enable Developer Mode on your TV
1. On your Samsung TV, navigate to the **Apps** section.
2. Press `1`, `2`, `3`, `4`, `5` on your remote control to open the Developer Mode prompt.
3. Toggle **Developer Mode** to ON.
4. Enter the **IP Address** of the PC you are using to install the app.
5. Reboot the TV (hold the power button on the remote until the TV turns off and back on).

### 2. Run the Nuvio Installer
1. Download and run the latest `Nuvio-WebTV-Installer` from the [Official Nuvio Releases](https://github.com/NuvioMedia/NuvioWeb/releases/latest).
    - *macOS users: If the app is blocked, move it to Applications and run `xattr -dr com.apple.quarantine "/Applications/Nuvio WebTV Installer.app"` and `codesign --force --deep --sign - "/Applications/Nuvio WebTV Installer.app"` in the terminal.*
    - *windows users: If the app is blocked, click on more then run anyway*
2. Select **Samsung Tizen** on the "Select your TV OS" screen.
3. Choose **Simple Installation (Recommended)** to automatically fetch the latest release.
4. On the configuration screen, enter your **TV IP Address**.
5. Click **Install**. You will be prompted to sign in with your Samsung account during installation to automatically generate the required developer certificates.

---

## Option 2: TizenBrew Installer
The TizenBrew Installer is a desktop app that can install apps directly to your Samsung TV using a GitHub repository — no Tizen Studio or manual certificates required.

### 1. Enable Developer Mode on your TV
1. On your Samsung TV, navigate to the **Apps** section.
2. Press `1`, `2`, `3`, `4`, `5` on your remote to open the Developer Mode prompt.
3. Toggle **Developer Mode** to ON.
4. Under **Host PC IP**, enter the IP address of your PC.
5. Click **OK** and reboot your TV.

### 2. Download and run TizenBrew Installer
1. Download the latest TizenBrew Installer for your OS from the [TizenBrewInstaller releases page](https://github.com/reisxd/TizenBrewInstaller/releases/latest).
2. Run the executable.
   - *macOS/Linux users: You may need to mark it as executable first: chmod +x tizenbrew-installer-os-arch*

### 3. Install Nuvio
1. When prompted for a GitHub repository, enter: `NuvioMedia/NuvioWeb`
2. Click **Install**.
   - *Tizen 7 or newer: You will be prompted to sign in to your Samsung account to generate the required certificate.*
3. Nuvio will appear in your TV's app list once complete.

---

## Troubleshooting
- **Installation Fails with Certificate Error:** Make sure you generated the certificate *while* the TV was connected, as the certificate needs the TV's unique DUID.
- **SDB Connection Fails:** Double-check that Developer Mode is enabled on the TV and the Host PC IP entered in the TV matches your actual PC's IP address.
