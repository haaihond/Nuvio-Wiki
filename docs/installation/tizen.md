# Tizen Installation [Tizen Only]

Tizen requires sideloading the application using Developer Mode. This guide walks you through the process of installing Nuvio using either the automated Nuvio Installer or the manual method (Tizen Studio).

>[!NOTE]
> Tizen support is continually improving but may have minor limitations compared to Android TV.

## Option 1: Nuvio Installer (Automated)
The official installer automates package downloading and certificate generation, offering a streamlined experience.

### 1. Enable Developer Mode on your TV
  - On your Samsung TV, navigate to the **Apps** section.
  - Press `1`, `2`, `3`, `4`, `5` on your remote control to open the Developer Mode prompt.
  - Toggle **Developer Mode** to ON.
  - Enter the **IP Address** of the PC you are using to install the app.
  - Reboot the TV (hold the power button on the remote until the TV turns off and back on).

### 2. Run the Nuvio Installer
  - Download and run the latest `Nuvio-WebTV-Installer` from the [Official Nuvio Releases](https://github.com/NuvioMedia/NuvioWeb/releases/latest).
    - *macOS users: If the app is blocked, move it to Applications and run `xattr -dr com.apple.quarantine "/Applications/Nuvio WebTV Installer.app"` and `codesign --force --deep --sign - "/Applications/Nuvio WebTV Installer.app"` in the terminal.*
    - *Windows users: If the app is blocked, click on "More info" then "Run anyway"*
  - Select **Samsung Tizen** on the "Select your TV OS" screen.
  - Choose **Simple Installation (Recommended)** to automatically fetch the latest release.
  - On the configuration screen, enter your **TV IP Address**.
  - Click **Install**. You will be prompted to sign in with your Samsung account during installation to automatically generate the required developer certificates.

---

## Option 2: TizenBrew Installer
The TizenBrew Installer is a desktop app that can install apps directly to your Samsung TV using a GitHub repository — no Tizen Studio or manual certificates required.

### 1. Enable Developer Mode on your TV
  - On your Samsung TV, navigate to the **Apps** section.
  - Press `1`, `2`, `3`, `4`, `5` on your remote to open the Developer Mode prompt.
  - Toggle **Developer Mode** to ON.
  - Under **Host PC IP**, enter the IP address of your PC.
  - Click **OK** and reboot your TV.

### 2. Download and run TizenBrew Installer
  - Download the latest TizenBrew Installer for your OS from the [TizenBrewInstaller releases page](https://github.com/reisxd/TizenBrewInstaller/releases/latest).
  - Run the executable.
    - *macOS/Linux users: You may need to mark it as executable first: chmod +x tizenbrew-installer-os-arch*

### 3. Install Nuvio
  - When prompted for a GitHub repository, enter: `NuvioMedia/NuvioWeb`
  - Click **Install**.
    - *Tizen 7 or newer: You will be prompted to sign in to your Samsung account to generate the required certificate.*
  - Nuvio will appear in your TV's app list once complete.

---

## Troubleshooting
- **Installation Fails with Certificate Error:** Make sure you generated the certificate *while* the TV was connected, as the certificate needs the TV's unique DUID.
- **SDB Connection Fails:** Double-check that Developer Mode is enabled on the TV and the Host PC IP entered in the TV matches your actual PC's IP address.
