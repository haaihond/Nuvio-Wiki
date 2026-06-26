# iOS Installation [iOS Only]

Nuvio on iOS typically requires **Sideloading** (AltStore/Sideloadly). Apple allows for 10k TestFlight users which is normally full.

>[!NOTE]
>Please do not message the Nuvio developers asking when TestFlight spots will be open. This is not in their control.

**Sideloadly Method**

1. Install Sideloadly

    - Download and install Sideloadly on your Mac or Windows PC. (Windows users: You still need the direct-download versions of iTunes and iCloud installed from Apple's website, not the Microsoft Store).
    
2. Connect your iPhone:
    - Plug your phone into your computer via USB.
    - Unlock it and tap Trust This Computer if prompted.

4. Load the IPA file
   
    - Open Sideloadly on your computer. Drag and drop your downloaded [.ipa file](https://github.com/luqmanfadlli/NuvioMobile-iOS/releases/download/0.2.13/Nuvio-v0.2.13-Full.ipa) directly into the Sideloadly window, or click the IPA icon on the left to browse your computer for the file.
    
5. Enter Apple ID and Start:
   
    - Type your Apple ID email into the designated box. 
    - Click the Start button at the bottom. A prompt will appear asking for your Apple ID password — enter it so Sideloadly can request the signing certificate from Apple.
    
7. Trust the developer profile: Required to launch the app.
    - Once Sideloadly says "Done" and the app appears on your phone's home screen, do not open it yet. 
    - Go to your iPhone's Settings > General > VPN & Device Management. 
    - Tap your Apple ID under "Developer App" and select Trust.
    
8. Enable Developer Mode: Required on iOS 16 and newer.
    - If you haven't already done this for a previous app, go to Settings > Privacy & Security > Developer Mode. Toggle it on and let your phone restart.


**Altstore Method**
1. Set up your computer
    - Download and install AltServer on your Mac or Windows PC. (Windows users: You must install iTunes and iCloud directly from Apple's website, not from the Microsoft Store).
    
2. Connect and trust
    - Plug your iPhone into your computer using a USB cable. 
    - Unlock your phone and tap Trust This Computer when the prompt appears.
      
3. Install AltStore to your phone
    - Launch AltServer on your computer. 
    - Click the AltServer icon in your menu bar (Mac) or system tray (Windows), select Install AltStore, and choose your connected iPhone. You will need to enter your Apple ID and password to digitally sign the app.
      
4. Trust the developer profile: Required to run sideloaded apps.
    - Open your iPhone's Settings app. 
    - Navigate to General > VPN & Device Management. 
    - Under the "Developer App" section, tap your Apple ID email and select Trust.
5. Enable Developer Mode: Required on iOS 16 and newer.
    - Go to Settings > Privacy & Security. 
    - Scroll to the bottom and tap Developer Mode. Toggle it on, and your phone will restart to apply the change.
      
6. Sideload the IPA file
    - Download the [.ipa file](https://github.com/luqmanfadlli/NuvioMobile-iOS/releases/download/0.2.13/Nuvio-v0.2.13-Full.ipa) using Safari on your iPhone. 
    - Open the new AltStore app on your home screen
    - Go to the My Apps tab, tap the + icon in the top left, and select your downloaded .ipa file to install it.
