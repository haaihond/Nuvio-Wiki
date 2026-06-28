# iOS Installatie [iOS Only]

Nuvio op iOS vereist doorgaans **Sideloading** (AltStore/Sideloadly). Apple staat maximaal 10.000 TestFlight-gebruikers toe, wat normaal gesproken vol is.

>[!NOTE]
>Stuur de Nuvio-developers a.u.b. geen berichten met de vraag wanneer er TestFlight-plekken vrijkomen. Dit ligt niet in hun macht.

**Sideloadly-methode**

1. **Sideloadly installeren:**
    - Download en installeer Sideloadly op je Mac of Windows-pc. (Windows-gebruikers: je moet nog steeds de rechtstreeks gedownloade versies van iTunes en iCloud van de website van Apple hebben geïnstalleerd, niet die uit de Microsoft Store).
    
2. **Verbind je iPhone:**
    - Sluit je telefoon via USB aan op je computer.
    - Ontgrendel je telefoon en tik op Vertrouw deze computer als hierom wordt gevraagd.

4. **Laad het IPA-bestand:**
    - Open Sideloadly op je computer. Sleep het gedownloade [.ipa-bestand](https://github.com/luqmanfadlli/NuvioMobile-iOS/releases/download/0.2.13/Nuvio-v0.2.13-Full.ipa) rechtstreeks naar het Sideloadly-venster, of klik op het IPA-pictogram aan de linkerkant om naar het bestand op je computer te zoeken.
    
5. **Voer Apple ID in en start:**
    - Typ het e-mailadres van je Apple ID in het daarvoor bestemde vak. 
    - Klik onderaan op de Start-knop. Er verschijnt een pop-up waarin om het wachtwoord van je Apple ID wordt gevraagd. Voer dit in zodat Sideloadly het handtekeningcertificaat bij Apple kan aanvragen.
    
7. **Vertrouw het developer profile:** Vereist om de app te kunnen openen.
    - Zodra Sideloadly "Done" (Gereed) aangeeft en de app op het startscherm van je telefoon verschijnt, open je deze nog niet. 
    - Ga naar de instellingen van je iPhone > Algemeen > VPN- en apparaatbeheer. 
    - Tik op je Apple ID onder "Developer-app"  en selecteer Vertrouw.
    
8. **Developer Mode inschakelen:** Vereist op iOS 16 en nieuwer.
    - Als je dit nog niet hebt gedaan voor een eerdere app, ga dan naar Instellingen > Privacy en beveiliging > Developer Mode. Schakel deze in en start je telefoon opnieuw op.


**AltStore-methode**
1. **Configureer je computer:**
    - Download en installeer AltServer op je Mac of Windows-pc. (Windows-gebruikers: je moet iTunes en iCloud rechtstreeks vanaf de website van Apple installeren, niet uit de Microsoft Store).
    
2. **Verbinden en vertrouwen:**
    - Sluit je iPhone met een USB-kabel aan op je computer. 
    - Ontgrendel je telefoon en tik op Vertrouw deze computer wanneer de melding verschijnt.
      
3. **Installeer AltStore op je telefoon:**
    - Start AltServer op je computer. 
    - Klik op het AltServer-pictogram in de menubalk (Mac) of het systeemvak (Windows), selecteer Install AltStore en kies je verbonden iPhone. Je moet je Apple ID en wachtwoord invoeren om de app digitaal te ondertekenen.
      
4. **Vertrouw het developer profile:** Vereist om gesideloade apps uit te voeren.
    - Open de Instellingen-app van je iPhone. 
    - Navigeer naar Algemeen > VPN- en apparaatbeheer. 
    - Under het gedeelte "Developer-app"  tik je op het e-mailadres van je Apple ID en selecteer je Vertrouw.
5. **Developer Mode inschakelen:** Vereist op iOS 16 en nieuwer.
    - Ga naar Instellingen > Privacy en beveiliging. 
    - Scrol naar de onderkant en tik op Developer Mode. Schakel dit in, waarna je telefoon opnieuw wordt opgestart om de wijziging toe te passen.
      
6. **Sideload het IPA-bestand:**
    - Download het [.ipa-bestand](https://github.com/luqmanfadlli/NuvioMobile-iOS/releases/download/0.2.13/Nuvio-v0.2.13-Full.ipa) met behulp van Safari op je iPhone. 
    - Open de nieuwe AltStore-app op je startscherm.
    - Ga naar het tabblad My Apps, tik op het +-pictogram in de linkerbovenhoek en selecteer het gedownloade .ipa-bestand om het te installeren.
