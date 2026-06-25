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
    - - *windows users: If the app is blocked, click on more then run anyway*
2. Select **Samsung Tizen** on the "Select your TV OS" screen.
3. Choose **Simple Installation (Recommended)** to automatically fetch the latest release.
4. On the configuration screen, enter your **TV IP Address**.
5. Click **Install**. You will be prompted to sign in with your Samsung account during installation to automatically generate the required developer certificates.

---

## Option 2: Tizen Studio (Manual)
If you prefer not to use the automated installer, you can manually sideload the app using Tizen Studio.

### Prerequisites
- A PC (Windows, macOS, or Linux).
- The latest `NuvioTV-Tizen-*.wgt` file from the [Official Nuvio Releases](https://github.com/NuvioMedia/NuvioWeb/releases/latest).
- **Tizen Studio** installed on your PC, along with the Samsung Certificate Extension.

### 1. Enable Developer Mode on your TV
1. On your Samsung TV, navigate to the **Apps** section.
2. Press `1`, `2`, `3`, `4`, `5` on your remote control to open the Developer Mode prompt.
3. Toggle **Developer Mode** to ON.
4. Enter the **IP Address** of the PC you are using to install the app.
5. Reboot the TV (hold the power button on the remote until the TV turns off and back on).

### 2. Connect your TV to Tizen Studio
1. Open **Tizen Studio** (or the Device Manager) on your PC.
2. Ensure your PC and TV are on the same local network.
3. In the Device Manager, click the **Remote Device Manager** icon.
4. Click **+** (Add) and enter a name for your TV, its IP Address, and leave the port as `26101`. 
5. Toggle the connection switch to ON.

### 3. Create a Certificate Profile
1. In Tizen Studio, open the **Certificate Manager**.
2. Create a new certificate profile.
3. Select **Samsung** as the certificate type.
4. Follow the prompts to create an Author Certificate and a Distributor Certificate.
5. Make sure your TV is connected when creating the Distributor Certificate, so its DUID is added.

### 4. Install the Package
1. Open a command prompt or terminal on your PC.
2. Navigate to the folder containing your `.wgt` file.
3. Use the `sdb` command (part of Tizen Studio) to install the app:
   ```bash
   sdb connect <YOUR_TV_IP>
   sdb install NuvioTV-Tizen-*.wgt
   ```
4. Once the command completes successfully, Nuvio will appear in your TV's app list.

---

## Troubleshooting
- **Installation Fails with Certificate Error:** Make sure you generated the certificate *while* the TV was connected, as the certificate needs the TV's unique DUID.
- **SDB Connection Fails:** Double-check that Developer Mode is enabled on the TV and the Host PC IP entered in the TV matches your actual PC's IP address.
