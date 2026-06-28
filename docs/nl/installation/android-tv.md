# Android TV Installatie [Android TV Only]

Net als op Android Mobiel zijn er twee manieren om Nuvio op Android TV te installeren. De eerste is via de Play Store, de tweede is via sideloading.

> [!NOTE]
> De versie in de Google Play Store mist enkele features ten opzichte van de gesideloade APK-versie om te voldoen aan het beleid van de Play Store. Het wordt aanbevolen om de app te sideloaden.

**APK-versie**
1.  **Optie 1: Voer de Downloader-code in**
    - **Developer options inschakelen:**
        - Ga naar de instellingen van je TV > Systeem (of Apparaatvoorkeuren) > Over. Scrol omlaag naar Android TV OS-versie (of gewoon Versie/Build) en klik 7 keer op de selectieknop van je afstandsbediening tot er een pop-up verschijnt met de tekst: "Je bent nu een developer!"
        - Ga terug naar het hoofdmenu Instellingen. Navigeer naar Apps > Beveiliging & beperkingen > Onbekende bronnen (of Onbekende apps installeren). Zoek de Downloader-app in de lijst en zet de schakelaar op Aan.
    - **Gebruik de Downloader-app uit de Play Store:**
        - Open de Downloader-app vanaf je startscherm.
        - Indien gevraagd, selecteer Toestaan (Allow) zodat de app bestanden op je apparaat kan opslaan.
        - Selecteer het URL-/zoekvak op het tabblad Home en typ exact de code: 4728718
    - De Downloader-app zal doorverwijzen en automatisch de Nuvio TV APK downloaden. Klik op Installeren (Install) wanneer de melding verschijnt. Selecteer na afloop Gereed (Done) in plaats van Openen.
    - Druk ten slotte twee keer op Verwijderen (Delete) in de Downloader-app om het installatiebestand te verwijderen en opslagruimte op je TV te besparen.

2. **Optie 2: Download de APK**
    - Open een webbrowser op je smartphone en download de nieuwste [TV APK van Nuvio's officiële GitHub](https://github.com/NuvioMedia/NuvioTV/releases/latest). Selecteer de Universal Release.
    - Open de Google Play Store op zowel je telefoon als je Android TV. Zoek en installeer de app Send files to TV op beide apparaten.
        - Schakel onbekende bronnen in met behulp van de stappen in Optie 1.
        - Zorg ervoor dat je telefoon en TV met hetzelfde wifi-netwerk zijn verbonden. Open Send files to TV op je TV en selecteer Ontvangen (Receive).
        - Open de app op je telefoon, selecteer Verzenden (Send), zoek de Nuvio APK in je downloads en selecteer je TV om het bestand over te zetten.
        - Selecteer het bestand op de TV en installeer het.

3. Open Nuvio. Mogelijk wordt er gevraagd om opslagrechten te verlenen en om Nuvio toe te staan onbekende apps te installeren. Dit is nodig zodat Nuvio zichzelf kan updaten.

**Play Store**
1. Je kunt de officiële Nuvio Play Store-versie downloaden door ernaar te zoeken in de Play Store op de TV.

## Troubleshooting
- **Play Protect-waarschuwing:** Omdat Nuvio niet in de Play Store staat, krijg je mogelijk een "Geblokkeerd door Play Protect"-melding te zien. Tik op **Meer details** > **Toch installeren**.
- **App niet geïnstalleerd:** Zorg ervoor dat je voldoende opslagruimte hebt en dat je niet probeert de Android TV-versie op een mobiel apparaat te installeren.
