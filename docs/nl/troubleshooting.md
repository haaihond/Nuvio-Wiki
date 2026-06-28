# Troubleshooting-gids

Vind hieronder oplossingen voor veelvoorkomende problemen met Nuvio. Problemen zijn gegroepeerd per categorie — ga direct naar de sectie die het meest relevant is voor jouw situatie.

> [!TIP]
> Voordat je specifieke oplossingen probeert, kun je het beste eerst de meest voorkomende snelle oplossingen proberen: **start de app opnieuw op**, **wis het cachegeheugen van de app**, **controleer je internetverbinding** en **verifieer of je Debrid-abonnement actief is**. Hiermee worden de meeste gemelde problemen opgelost.

---

## Snelle diagnostiek

Loop deze checklist door voordat je specifieke problemen gaat oplossen:

1. **Is je internetverbinding stabiel?** Voer een snelheidstest uit. Streamen vereist doorgaans 5–25 Mbps, afhankelijk van de kwaliteit.
2. **Is je Debrid-abonnement actief en niet verlopen?** Log in op de website van je provider om dit te bevestigen.
3. **Zijn je addons ingeschakeld?** Open Nuvio → Instellingen → Addons en controleer of ze zijn ingeschakeld.
4. **Is de app up-to-date?** Controleer op de nieuwste Nuvio-release en installeer deze.
5. **Heb je geprobeerd het cachegeheugen van de app te wissen?** Ga naar de Systeeminstellingen van je apparaat → Apps → Nuvio → Cache wissen.

Als geen van deze stappen je probleem oplost, ga dan verder naar de relevante sectie hieronder.

---

## 1. Afspeelproblemen

### 1.1 Video stottert of buffert

Bufferen is de meest gehoorde klacht en heeft bijna altijd een oplosbare oorzaak. Loop de onderstaande stappen in volgorde door.

**Stap 1 — Bevestig dat je Debrid-dienst is verbonden** [Debrid Integration Only]

Nuvio vertrouwt op een Debrid-dienst (bijv. TorBox, Real-Debrid, AllDebrid) om gecachte streams van hoge kwaliteit te leveren. Zonder zo'n dienst worden streams opgehaald van tragere openbare peers.

- Open **Instellingen → Debrid** en controleer of je provider in de lijst staat en is geauthenticeerd.
- Als er een foutmelding wordt weergegeven, log dan uit en log opnieuw in.

**Stap 2 — Controleer je internetsnelheid**

Gebruik een snelheidstest-app of bezoek een snelheidstestsite in de browser van je apparaat.

- Richt je voor 1080p-weergave op minimaal **10 Mbps**.
- Richt je voor 4K/HDR-weergave op minimaal **25 Mbps**.
- Als je snelheid constant laag is, ligt het probleem bij je verbinding en niet bij Nuvio. Probeer dichter bij je router te gaan staan of schakel over van wifi naar een bekabelde verbinding.

**Stap 3 — Wis het cachegeheugen van de app**

Een beschadigde of te grote cache kan ervoor zorgen dat het afspelen hapert.

- Op Android/Fire TV: **Apparaatinstellingen → Applicaties → Nuvio → Cache wissen**.
- Op mobiel: **Apparaatinstellingen → Algemeen → iPhone-opslag → Nuvio → Ruim app op** [iOS Only], of **Instellingen → Apps → Nuvio → Opslag → Cache wissen** [Android Mobile Only].
- Start Nuvio opnieuw op na het wissen.

**Stap 4 — Schakel tunneled playback in/uit** [Android TV Only]

Als je netwerk video-verkeer filtert of knijpt, kan tunneled playback helpen om dit te omzeilen.

- Ga naar **Instellingen → Afspelen** en schakel de optie **Tunneled Playback** in of uit (zie [Player-instellingen](settings/player.md#player-and-decoder-options)).
- Test met de optie zowel in- als uitgeschakeld om te zien welke beter presteert op jouw netwerk.

**Stap 5 — Pas de instellingen voor Auto Frame Rate & Resolutie aan** [Android TV Only]

Niet-overeenkomende framesnelheden tussen de stream en je scherm kunnen trillingen of weggevallen frames veroorzaken die eruitzien als bufferen.

- Ga naar **Instellingen → Player → Geavanceerde verwerking en decodering → Auto Frame Rate & Resolution** en experimenteer met de beschikbare opties. De keuzes zijn **Uit**, **Bij starten** (schakelen wanneer het afspelen begint) en **Bij starten/stoppen** (herstelt ook de oorspronkelijke snelheid van je scherm wanneer je stopt).
- Als je tv/scherm AFR niet goed ondersteunt, kan het instellen op **Uit** soepelere resultaten geven.

**Stap 6 — Pas de bufferinstellingen aan** [Android TV Only]

Op Android TV-apparaten kun je handmatig instellen hoeveel video er vooraf in het geheugen wordt geladen, wat het afspelen op tragere of minder stabiele verbindingen soepeler maakt.

- Ga naar **Instellingen → Player → Buffer en netwerk → Custom Playback Buffers** en schakel dit in (zie [Player-instellingen](settings/player.md#buffer-and-network-android-tv-only)).
- Verhoog de **Minimale bufferduur** en **Maximale bufferduur** om de speler meer speelruimte te geven ten opzichte van je huidige positie. Begin conservatief (bijv. 15s min, 50s max) en verhoog dit als het bufferen aanhoudt.

> [!NOTE]
> Hogere bufferwaarden verbruiken meer RAM. Schakel **Managed Memory Budget** in om Nuvio het bufferverbruik automatisch te laten beperken tot een veilig deel van het beschikbare geheugen van je apparaat, wat instabiliteit op goedkopere apparaten voorkomt.

**Stap 7 — Dolby Vision Profile 7 (P7) Conversie** [Android TV Only]

- DV P7-conversie kan ervoor zorgen dat zwakkere hardware moet bufferen. Schakel dit in/uit in de app.

**Stap 8 — Probeer een externe player**

Als de ingebouwde player van Nuvio problemen blijft houden, kan het helpen om het afspelen over te dragen aan een toegewijde player.

- Installeer **VLC** of **MX Player** vanuit de app store van je apparaat.
- Ga in Nuvio naar **Instellingen → Player → Externe speler** en selecteer de geïnstalleerde speler.
- Probeer dezelfde inhoud opnieuw af te spelen.

> [!NOTE]
> Externe spelers gaan anders om met bepaalde codecs (HEVC, AV1, Dolby Vision). Als de interne speler buffert op een specifieke stream maar een externe speler niet, is het probleem codec-gerelateerd en niet netwerk-gerelateerd.

---

### 1.2 Geen geluid of zwart scherm

Een zwart scherm of ontbrekende audio wijst meestal op een incompatibiliteit met een codec of renderer in plaats van een netwerkprobleem.

**Stap 1 — Schakel over naar een externe speler**

Dit is de snelste oplossing voor codec-gerelateerde weergavefouten.

- Ga naar **Instellingen → Player → Externe speler** en selecteer **VLC** of **MX Player**.
- Ga terug naar de inhoud en probeer deze opnieuw af te spelen.

**Stap 2 — Pas de audio-decoderingsinstellingen aan** [Android TV Only]

Als de video wordt afgespeeld maar er geen geluid is, of als dialogen onverstaanbaar zijn onder harde effecten:

- Ga naar **Instellingen → Player → Ondertiteling en audio → Audio-instellingen** en schakel **Downmix inschakelen** in (zie [Player-instellingen](settings/player.md#subtitle-and-audio)). Dit converteert meerkanaals surround audio (5.1 of 7.1) naar stereo, wat problemen oplost waarbij het centrale dialoogkanaal vrijwel stil is op stereo-opstellingen.
- Als je je tv aansluit op een geluidssysteem via een **optische/SPDIF-kabel**, ga dan naar **Instellingen → Player → Geavanceerde verwerking en decodering** en schakel **Forceer AC-3-transcodering (Optisch/SPDIF)** in. Optische verbindingen hebben een strikte bandbreedtebeperking en kunnen geen moderne ongecomprimeerde formaten zoals TrueHD of DTS-HD doorgeven. Deze instelling converteert ze in real-time naar Dolby Digital 5.1, zodat je ontvanger ze kan decoderen.
- Controleer of je tv of ontvanger niet gedempt is en niet is ingesteld op een audioformaat dat je hardware niet ondersteunt.

**Stap 3 — Los vervormde kleuren op (groen of paars scherm)**

Als de video wordt afgespeeld maar met duidelijk verkeerde kleuren — een groene tint, paarse gloed of een volledig vervaagd beeld — is je inhoud waarschijnlijk Dolby Vision Profile 7 (DV7), wat veel apparaten niet standaard kunnen decoderen.

- Ga naar **Instellingen → Player → Geavanceerde verwerking en decodering** en schakel **DV7 - HEVC Fallback** in (zie [Player-instellingen](settings/player.md#player-and-decoder-options)). Dit verwijdert de onleesbare Dolby Vision-laag en schaalt de video terug naar standaard HEVC (H.265), waardoor de juiste kleuren worden hersteld.
- Als je op Android TV bent en specifiek problemen ziet met DV5-inhoud, kun je daarnaast proberen **Converteer DV5 naar DV8.1** in hetzelfde menu in te schakelen.

**Stap 4 — Probeer een andere stream**

Soms is een specifiek streambestand beschadigd. Gebruik de streamkiezer (beschikbaar tijdens het afspelen) om een alternatieve bron voor dezelfde inhoud te selecteren.

---

### 1.3 "No Streams Found"

Deze melding betekent dat Nuvio je addons heeft doorzocht maar geen bruikbare resultaten heeft ontvangen. Er zijn verschillende mogelijke oorzaken.

**Stap 1 — Controleer of addons zijn ingeschakeld**

- Ga naar **Instellingen → Addons** en controleer of er ten minste één streaming-addon is ingeschakeld.
- Als de lijst leeg is, moet je een addon toevoegen door de manifest-URL in te voeren.

**Stap 2 — Bevestig dat je Debrid-abonnement geldig is**

Veel addons filteren standaard resultaten die niet van Debrid zijn. Een verlopen of niet-verbonden Debrid-account zorgt ervoor dat de meeste streams verborgen blijven.

- Log in op de website van je Debrid-provider en controleer je accountstatus.
- Log zo nodig opnieuw in via Nuvio onder **Instellingen → Debrid**. [Debrid Integration Only]

**Stap 3 — Probeer een andere inhoudsbron**

Verschillende addons indexeren verschillende bronnen. Als een addon geen resultaten toont:

- Schakel over naar een andere ingeschakelde addon via de bronkiezer.
- Als je slechts één addon hebt, overweeg dan om een tweede toe te voegen voor redundantie.

**Stap 4 — Controleer of de inhoud onlangs is uitgebracht**

Onlangs uitgebrachte films en tv-afleveringen zijn mogelijk nog niet gecachet of geïndexeerd door Debrid-providers of addon-bronnen. Dit is verwacht gedrag en geen bug.

- Wacht 24–72 uur na de releasedatum en probeer het opnieuw.
- Sommige inhoud verschijnt pas na een bredere release (bijv. nadat een exclusieve streamingperiode afloopt).

**Stap 5 — Controleer de configuratie van je addon**

Sommige addons (bijv. AIOStreams) vereisen een specifieke configuratie die gekoppeld is aan je Debrid-inloggegevens. Als de addon onlangs opnieuw is geconfigureerd of je API-sleutel is gewijzigd:

- Voer je addon-manifest-URL opnieuw in met bijgewerkte gegevens.
- Raadpleeg de [Debrid-integratiegids](integrations/debrid.md) voor jouw specifieke provider.

> [!WARNING]
> Deel je addon-manifest-URL nooit openbaar — deze bevat meestal je Debrid-API-sleutel of accounttoken.

**Stap 6 — Addon geeft geen resultaten**

Als een addon is geïnstalleerd en ingeschakeld, maar nooit streams retourneert:

- Controleer de addon-configuratie opnieuw. Veel addons (bijv. AIOStreams) worden geconfigureerd met je Debrid-inloggegevens in de manifest-URL. Als je API-sleutel is gewijzigd of verlopen, moet je de manifest-URL opnieuw genereren.
- Kijk of de addon specifiek bedoeld is voor films, tv of beide. Sommige addons indexeren alleen bepaalde inhoudstypen.
- Controleer bij zelfgehoste addons of de server bereikbaar is en draait. Controleer de logs op fouten als je daar toegang toe hebt.

---

### 1.4 Slechte videokwaliteit

Als de inhoud wordt afgespeeld maar de kwaliteit lager is dan verwacht (bijv. 480p in plaats van 1080p):

- **Controleer de cache van je Debrid-provider.** Niet alle inhoud is in elke kwaliteit gecachet. Open de streamkiezer en zoek naar opties met een hogere kwaliteit.
- **Controleer de kwaliteitsfilters van je addon.** Sommige addons hebben tijdens de configuratie kwaliteitslimieten ingesteld. Configureer je addon opnieuw om 1080p- of 4K-bronnen toe te staan.
- **Controleer je netwerksnelheid.** Je verbinding ondersteunt mogelijk niet de hoogste beschikbare kwaliteitsklasse. Een stabiele verbinding van 25+ Mbps wordt aanbevolen voor 4K.

---

### 1.5 Ondertiteling werkt niet

**Ondertiteling verschijnt niet:**

- Ga naar **Instellingen → Player → Ondertiteling en audio → Ondertitelvoorkeuren** en controleer of ondertiteling is ingeschakeld en er een voorkeurstaal is ingesteld.
- Open tijdens het afspelen het spelermenu en controleer of er een ondertitelspoor is geselecteerd.
- Als er geen sporen worden vermeld, bevat de inhoud mogelijk geen ingebouwde ondertiteling. Controleer of **Addon Subtitle Startup** (onder hetzelfde menu) niet is ingesteld op **Snelle opstart** (Fast startup), aangezien die modus het automatisch ophalen van externe ondertiteling overslaat.

**Ondertiteling loopt niet synchroon:**

- Gebruik de vertragings-/offsetregeling voor ondertiteling in het afspeelmenu om de timing vooruit of achteruit aan te passen.
- Als de synchronisatie constant afwijkt voor alle inhoud, controleer dan of de audiovertragingsinstelling van je speler ook een offset heeft.

**Ondertiteling veroorzaakt stotteren bij het opstarten:**

- Ga naar **Instellingen → Player → Ondertiteling en audio → Addon Subtitle Startup** en stel dit in op **Snelle opstart** (Fast startup) (zie [Player-instellingen](settings/player.md#subtitle-and-audio)). Dit slaat het automatisch ophalen van ondertiteling over, zodat het afspelen begint zonder te wachten tot externe ondertitelingsbronnen reageren. Ondertiteling kan nog steeds handmatig worden geselecteerd zodra de video wordt afgespeeld.

---

### 1.6 Verkeerd audiospoor wordt afgespeeld

Als dialogen in de verkeerde taal zijn of als standaard het verkeerde audiospoor is geselecteerd:

- Open het afspeelmenu tijdens de stream en verander het **Audiospoor** naar de juiste taal of kanaalindeling.
- Om een permanente standaard in te stellen: ga naar **Instellingen → Player → Ondertiteling en audio → Audio-instellingen** en configureer **Voorkeurstaal voor audio**. Je kunt ook een **Secundaire audiotaal** instellen als fallback voor het geval je primaire keuze niet beschikbaar is in een bepaalde stream.

---

## 2. App & Installatie

### 2.1 "App niet geïnstalleerd"-fout

Deze fout treedt op tijdens de installatie en heeft meestal een van de volgende twee oorzaken.

**Oorzaak 1 — Verkeerde APK-versie**

Nuvio heeft afzonderlijke builds voor verschillende apparaattypen. Het installeren van de verkeerde versie veroorzaakt deze fout. Merk op dat bij Android TV ook gecontroleerd moet worden of het de juiste versie betreft.

- **Android-telefoons/tablets:** Gebruik the **Mobile** APK. Zie de [Android Mobiel Installatiegids](installation/android-mobile.md).
- **Android TV, Fire TV, Google TV:** Gebruik de **TV** APK. Zie de [Android TV Installatiegids](installation/android-tv.md).
- **Samsung Smart TV (via TizenBrew):** Gebruik het Tizen-specifieke installatieproces — zie de [Tizen-installatiegids](installation/tizen.md).
- **LG WebOS:** Zie de [WebOS-installatiegids](installation/webos.md).

Download the juiste versie vanaf de pagina [Officiële links](official-links.md), die links bevat naar de GitHub-releasepagina's voor elke build (Mobile, TV en WebOS).

**Oorzaak 2 — Onvoldoende opslagruimte**

- Controleer de beschikbare opslagruimte van je apparaat onder **Apparaatinstellingen → Opslag**.
- Maak minimaal 500 MB vrij voordat je de installatie start.
- Op Android moet je mogelijk ook het cachegeheugen van de pakketinstallatie-app zelf wissen.

**Oorzaak 3 — Handtekeningconflict (bij upgrades)**

Als je upgradet vanaf een oudere versie die met een andere sleutel is ondertekend:

- Verwijder eerst de bestaande versie van Nuvio.
- Installeer de nieuwe APK helemaal opnieuw.

> [!CAUTION]
> Het verwijderen van de app wist lokaal opgeslagen instellingen. Exporteer je configuratie of noteer je addon-URL's voordat je de app verwijdert.

---

### 2.2 App crasht bij opstarten

**Stap 1 — Wis cache en gegevens van de app**

- Ga naar **Apparaatinstellingen → Apps → Nuvio → Opslag → Cache wissen**.
- Als het crashen aanhoudt, tik dan op **Gegevens wissen** (dit zet de app terug naar de standaardinstellingen).

**Stap 2 — Controleer op OS-compatibiliteit**

Nuvio vereist een minimale Android-versie. Controleer de release-opmerkingen van de versie die je installeert om te bevestigen of de OS-versie van je apparaat wordt ondersteund.

**Stap 3 — Installeer de app opnieuw**

Als het wissen van de gegevens niet helpt:

- Verwijder Nuvio volledig.
- Start je apparaat opnieuw op.
- Download de nieuwste APK en installeer deze opnieuw.

**Stap 4 — Controleer op conflicterende apps**

Sommige VPN- of firewall-apps die op de achtergrond draaien, kunnen Nuvio verhinderen te initialiseren. Schakel een eventueel actieve VPN- of DNS-filter-app tijdelijk uit en test of Nuvio met succes start.

---

### 2.3 App kan niet worden bijgewerkt

- Bij het updaten via een APK: zorg ervoor dat je de juiste variant downloadt (Mobile vs. TV) en dat **Installeren van onbekende bronnen** is ingeschakeld in je apparaatinstellingen.
- Bij het updaten via een store (indien van toepassing): forceer de stop van de store-app, wis het cachegeheugen en probeer het opnieuw.
- Als een oudere versie de update blokkeert vanwege een niet-overeenkomende ondertekening: verwijder eerst de oude versie en installeer vervolgens de nieuwe.

---

### 2.4 Inlog- / accountproblemen

- Als je Nuvio-account na een app-update als uitgelogd verschijnt, voer dan je inloggegevens opnieuw in bij **Instellingen → Account**.
- Als je je wachtwoord bent vergeten, gebruik dan de wachtwoordherstelprocedure op de officiële site.
- Zorg ervoor dat de datum en tijd op je apparaat nauwkeurig zijn ingesteld. Authenticatietokens kunnen falen als de klok van je apparaat aanzienlijk afwijkt.

---

## 3. Synchronisatie- & Trakt-problemen

### 3.1 Trakt-synchronisatie werkt niet

Trakt wordt gebruikt om je kijkgeschiedenis, voortgang en beoordelingen tussen apparaten te synchroniseren. Als de synchronisatie defect lijkt:

**Stap 1 — Trakt opnieuw authenticeren**

- Ga naar **Instellingen → Trakt**.
- Tik op **Uitloggen** en vervolgens op **Inloggen** en voltooi de autorisatieprocedure opnieuw. Zie voor gedetailleerde instellingen en synchronisatie-opties [Trakt-integratie](integrations/trakt.md) of de [Trakt Bridge-importtool](integrations/tmdb-mdblist-trakt.md#trakt-integration).
- Dit vernieuwt je toegangstoken en lost de meeste Trakt-synchronisatiefouten op.

**Stap 2 — Controleer de status van de Trakt-dienst**

Trakt heeft af en toe te maken met storingen. Als opnieuw authenticeren niet helpt, controleer dan de [statuspagina van Trakt](https://trakt.tv) of communityforums op gemelde problemen.

---

### 3.2 Kijkvoortgang wordt niet opgeslagen

- Bevestig dat de Trakt-integratie actief en geauthenticeerd is als je deze gebruikt voor kijkvoortgang (zie hierboven).
- Nuvio registreert voortgang (scrobbelen) pas wanneer je een bepaalde drempel van een video bereikt. Het afspelen van slechts een paar seconden triggert mogelijk geen scrobbel.
- Als je een externe speler gebruikt, wordt scrobbelen mogelijk niet ondersteund. Schakel terug naar de interne speler voor automatische voortgangsregistratie.

---

### 3.3 Bibliotheek of Watchlist wordt niet bijgewerkt

- Ga naar **Apparaatinstellingen → Apps → Nuvio → Opslag → Cache wissen**.
- Als items die op een ander apparaat zijn toegevoegd niet verschijnen, controleer dan of beide apparaten zijn geauthenticeerd met hetzelfde Trakt-account, als je Trakt gebruikt.

---

## 4. Addon-problemen

### 4.1 Manifest-URL-fout

Als Nuvio een foutmelding geeft wanneer je een addon probeert toe te voegen:

- **Controleer de URL-indeling.** De URL moet beginnen met `https://` (not `http://`). Zelfs één onjuist teken kan ervoor zorgen dat het laden van het manifest mislukt.
- **Controleer op spaties aan het einde.** Kopieer de URL zorgvuldig — onzichtbare spaties aan het einde kunnen de aanvraag afbreken.
- **Controleer of de addon-server online is.** Plak de URL rechtstreeks in een browser. Je zou een JSON-manifest moeten zien. Als je een foutmelding of een time-out krijgt, is de addon-server mogelijk offline.
- **Controleer je netwerk.** Sommige addon-servers zijn geografisch beperkt. Als je een VPN gebruikt, probeer het dan uit te schakelen, of schakel het juist in als de server zich in een geblokkeerde regio bevindt.

---

### 4.2 Addons verdwenen na update

Na een Nuvio-update worden addon-configuraties soms gereset.

- Voeg je addon-manifestlinks handmatig opnieuw toe via **Instellingen → Addons → Addon toevoegen**.
- De manifest-URL's van community-addons kunnen veranderen. Raadpleeg de [Officiële kanalen](official-links.md) voor de meest actuele URL's.

> [!TIP]
> Houd een persoonlijk overzicht bij van je addon-manifest-URL's, vooral voor zelfgehoste of op maat geconfigureerde addons waarbij de URL je persoonlijke API-sleutel of configuratiehash bevat.

---

### 4.3 Addon laadt traag

Trage reacties van addons verlengen de tijd die nodig is om de streamlijst weer te geven.

- Sommige community-addons draaien op servers met beperkte middelen en zijn simpelweg traag tijdens piekuren.
- Als je een addon zelf host, controleer dan het serververbruik en de logs.

---

## 5. Debrid-dienstproblemen

### 5.1 Debrid maakt geen verbinding [Debrid Integration Only]

- Ga naar **Instellingen → Debrid** en controleer de statusindicator naast je provider.
- Als er een ontkoppeling of fout wordt getoond, tik dan om opnieuw te authenticeren.
- Controleer of je API-sleutel nog geldig is door in te loggen op de website van je provider. Sommige providers roteren API-sleutels periodiek of na een wachtwoordwijziging.
- Als je een VPN gebruikt, controleer dan of het IP-adres van je VPN niet is geblokkeerd door je Debrid-provider. Sommige Debrid-diensten blokkeren VPN-IP-bereiken om hun servicevoorwaarden te handhaven.

---

### 5.2 Abonnement verlopen of niet herkend

- Log rechtstreeks in op de website van je Debrid-provider om je abonnementsstatus te bevestigen.
- Als je onlangs hebt verlengd, kan het enkele minuten duren voordat dit is verwerkt. Log uit bij de Debrid-integratie van Nuvio en log opnieuw in om te verversen.
- Zorg ervoor dat je de **API-sleutel** gebruikt waar dat vereist is, en niet het wachtwoord van je account.

---

### 5.3 Gedownloade of gecachte inhoud wordt niet afgespeeld

- Controleer of de inhoud daadwerkelijk is gecachet door je Debrid-provider. Niet alle torrents/bronnen zijn gecachet.
- Sommige Debrid-diensten hebben downloadlimieten of beperken het afspelen nadat een quotum is bereikt. Controleer het dashboard van je provider-account.
- Probeer een andere stream te selecteren uit de streamkiezer — er is mogelijk een alternatieve gecachte bron beschikbaar.

---

## 6. Connectiviteits- & netwerkproblemen

### 6.1 Algemene verbindingsproblemen

Als Nuvio zijn servers niet kan bereiken of helemaal geen inhoud kan laden:

- Bevestig dat je apparaat een actieve internetverbinding heeft door een browser te openen en een website te laden.
- Start je router en/of modem opnieuw op als de verbinding onstabiel lijkt.
- Probeer te wisselen tussen wifi en mobiele data om te isoleren of het probleem specifiek is voor één type verbinding.
- Controleer of het probleem ook andere apps beïnvloedt. Als alleen Nuvio is getroffen, is het probleem mogelijk DNS-gerelateerd.

---

### 6.2 VPN-conflicten

VPN's zijn een veelvoorkomende oorzaak van wisselende connectiviteit en afspeelproblemen.

- **Probeer je VPN tijdelijk uit te schakelen** om te testen of dit de oorzaak is.
- Als Nuvio werkt zonder de VPN, knijpen de servers van je VPN mogelijk het videoverkeer af of blokkeert je Debrid-provider VPN-IP's.
- Sommige Debrid-providers verbieden het gebruik via VPN's expliciet in hun servicevoorwaarden.

---

### 6.3 Trage streamsnelheden

Als streams laden maar consistent traag zijn, ongeacht de inhoud:

**Stap 1 — Test internet**
- Voer een snelheidstest uit vanaf hetzelfde apparaat. Als je gemeten snelheid veel lager is dan je geabonneerde abonnement, ligt het probleem bij je provider of lokale netwerk, en niet bij Nuvio.
- Controleer of je internetprovider het videostreamingverkeer knijpt. Een VPN kan in dit geval helpen (test met en zonder).
- Schakel waar mogelijk over van wifi naar een bekabelde Ethernet-verbinding, met name op tv-apparaten.
- Ga bij wifi dichter bij je router staan of schakel over naar een 5 GHz-netwerk als je apparaat dit ondersteunt.

**Stap 2 — Pas de opstartinstellingen voor addon-ondertiteling aan**

Het automatisch ophalen van alle beschikbare ondertitelsporen bij het opstarten kan de initialisatie van de stream vertragen of onderbreken.

- Ga naar **Instellingen → Player → Ondertiteling en audio → Addon Subtitle Startup** en stel dit in op **Snelle opstart** (Fast startup) (zie [Player-instellingen](settings/player.md#subtitle-and-audio)).
- Dit slaat het automatisch ophalen van ondertiteling over, zodat de video direct begint. Je kunt ondertitels nog steeds handmatig selecteren via het spelermenu tijdens het afspelen.
- Als je wilt dat ondertitels worden geladen maar met minder overhead, is **Alleen voorkeur** (Preferred only) een uitgebalanceerde middenweg — dit haalt alleen je geconfigureerde taal op in plaats van elk beschikbaar spoor.

---

## 7. Prestatieproblemen

### 7.1 App draait traag of voelt traag aan

- **Wis het cachegeheugen van de app.** Na verloop van tijd hoopt gecachte data zich op en kan dit de navigatie vertragen.
- **Verminder het aantal achtergrond-apps.** Sluit andere apps die op de achtergrond draaien om RAM-geheugen vrij te maken.
- **Controleer opslagruimte.** Apparaten met minder dan 500 MB vrije opslagruimte vertonen vaak verminderde app-prestaties. Maak ruimte vrij en start opnieuw op.
- **Schakel animaties uit** in de ontwikkelaarsinstellingen van je apparaat als je hardware verouderd of minder krachtig is.

---

### 7.2 Hoog geheugengebruik

- De efficiëntie van de decoder heeft grote invloed op de batterijduur. Ga naar **Instellingen → Player → Geavanceerde verwerking en decodering → Decoder Priority** en stel dit in op **Geef voorkeur aan apparaatdecoders** (Prefer device decoders) (zie [Player-instellingen](settings/player.md#player-and-decoder-options)). Dit gebruikt je hardware-decoderchips wanneer deze beschikbaar zijn, waardoor de CPU wordt ontlast en het batterijverbruik afneemt in vergelijking met softwarematige (FFmpeg) decodering.
- Voorkom dat Nuvio voor onbepaalde tijd op de achtergrond blijft draaien. Sluit de app volledig af wanneer deze niet in gebruik is.

---

## 8. Platformspecifieke problemen

### 8.1 Android-telefoon & -tablet

- **Sideloaden:** Nuvio kan worden gedistribueerd als een APK. Schakel **Installeren van onbekende bronnen** in onder **Instellingen → Beveiliging** (of **Instellingen → Apps → Speciale app-toegang → Onbekende apps installeren**) voordat je gaat installeren. Voor volledige installatie-instructies, zie de [Android Mobiel Installatiegids](installation/android-mobile.md).
- **Beeld-in-beeld (PiP):** Als PiP niet werkt, ga dan naar **Apparaatinstellingen → Apps → Nuvio → Beeld-in-beeld** en schakel het in.
- **Schermvergrendeling:** Als de app vastzit in portret- of landschapsmodus, controleer dan de schermrotatievergrendeling op systeemniveau.

---

### 8.2 Android TV / Fire TV / Google TV

- Gebruik altijd de **TV-build** van Nuvio. De Mobile-build kan niet worden geïnstalleerd en functioneert niet correct op tv-apparaten. Voor volledige installatie-instructies, zie de [Android TV Installatiegids](installation/android-tv.md).
- **Fire TV:** Als de installatie is geblokkeerd, ga dan naar **Instellingen → Mijn Fire TV → Ontwikkelaarsopties → Onbekende apps installeren → Nuvio** en zet dit aan.
- **Google TV:** Gebruik een bestandsbeheerder zoals **Files by Marc** om de APK na het downloaden te lokaliseren en te installeren als je deze niet kunt vinden.

---

### 8.3 Samsung Smart TV (Tizen / TizenBrew)

Samsung Tizen-tv's ondersteunen geen directe sideloading van APK's. Nuvio moet worden geïnstalleerd via de speciale installatie of **TizenBrew**.

- Voor volledige installatie-instructies, zie de [Tizen-installatiegids](installation/tizen.md).
- Als de app na installatie niet laadt, controleer dan of TizenBrew de juiste Nuvio Tizen-build uitvoert.

---

### 8.4 iOS / iPadOS

- Nuvio op iOS vereist mogelijk installatie via **AltStore**, **Sideloadly** of een soortgelijk sideload-hulpprogramma, afhankelijk van de distributiemethode. Voor volledige installatie-instructies, zie de [iOS-installatiegids](installation/ios.md).
- Als de app verloopt (een veelvoorkomend probleem met gesideloadede iOS-apps), onderteken deze dan opnieuw met het hulpprogramma van jouw keuze.
- iOS heeft strengere limieten voor achtergrondactiviteit. Afspelen dat pauzeert wanneer het scherm vergrendelt, vereist mogelijk het inschakelen van **Ververs apps op achtergrond** voor Nuvio in de iOS-instellingen.

---

## 9. Wanneer je verdere hulp moet zoeken

Als je de relevante secties hierboven hebt doorlopen en je probleem blijft bestaan, is er mogelijk hulp vanuit de community of directe ondersteuning nodig.

**Verzamel deze informatie voordat je contact opneemt:**

- Je type apparaat en OS-versie (bijv. Fire TV Stick 4K, Fire OS 7).
- De versie van Nuvio die je hebt geïnstalleerd.
- Je Debrid-provider (bijv. TorBox, Real-Debrid, AllDebrid).
- Welke addons je hebt geïnstalleerd.
- Een duidelijke beschrijving van het probleem, inclusief eventueel weergegeven foutmeldingen.
- Stappen die je al hebt geprobeerd.

**Waar je hulp kunt krijgen:**

- **Community-ondersteuning en discussie:** Zie de [Officiële kanalen](official-links.md) voor Discord, Reddit en andere communityruimtes.
- **Bugrapporten:** Als je denkt dat je een bug hebt gevonden die specifiek is voor de app, rapporteer deze dan via de officiële GitHub Issues-pagina (gelinkt in [Officiële kanalen](official-links.md)).

> [!IMPORTANT]
> Deel nooit je Debrid-API-sleutel, addon-manifest-URL's of accountgegevens openbaar als je om hulp vraagt. Verwijder of verberg deze in screenshots of logs die je deelt.
