# Quick Start Guide

<NuvioQuickstart />

Start with the tool above. It will ask whether you want to pay for a debrid service, then take you through the setup one page at a time.

You can use an existing Nuvio account or enter a new email address to create one. The installer keeps the other addons already on your profiles.

## Which option should I pick?

| | Debrid setup | Free HTTPS setup |
| --- | --- | --- |
| Good choice if | You want faster, more reliable playback | You do not want another paid subscription |
| What it uses | TorBox and AIOStreams | PenguPlay |
| Extra account | TorBox | None; complete a human check inside the quickstart |
| What gets added to Nuvio | AIOStreams and Nuvio Catalog | PenguPlay and Nuvio Catalog |

> [!TIP]
> Pick TorBox if you care most about smooth playback, especially for large or 4K files. Pick PenguPlay if you want to start for free and do not mind that available streams can vary.

## Paid setup: TorBox and AIOStreams

Choose **Yes, use debrid** on the first screen. The tool will then show these pages:

1. **Nuvio account:** enter your email address and password. If the account does not exist, it will be created.
2. **TorBox:** copy your API key from [TorBox Settings](https://torbox.app/settings) and paste it into the tool.
3. **Setup type:** choose **Simple** unless you already know you need different catalog or matching settings.
4. **Review:** check the details and select **Install AIOStreams**.

Advanced setup adds two more pages. One lets you choose a different catalog manifest. The other accepts TMDB and TVDB keys and lets you set the AIOStreams settings password yourself.

Keep the page open while the installer checks your TorBox key, signs in to Nuvio, creates the AIOStreams configuration, and adds both addons. When it finishes, save the AIOStreams settings password shown on screen. You will need it if you want to change that configuration later.

## Free setup: PenguPlay

Choose **No, use HTTPS streams** on the first screen. You will move through three short pages:

1. **Nuvio account:** enter your Nuvio email address and password.
2. **PenguPlay:** complete the human check inside the quickstart, then select **Continue**.
3. **Review:** check the account and select **Install PenguPlay in Nuvio**.

> [!IMPORTANT]
> You do not need to create another account, open the PenguPlay website, or copy an addon URL. The check and PenguPlay installation are handled inside Nuvio.

Cloudflare Turnstile checks that the request comes from a person. After the check passes, the Nuvio server creates the personal PenguPlay installation, receives its addon URL, and installs it without exposing PenguPlay credentials in the page.

## Install Nuvio on your devices

Use the same Nuvio account on each device. Install the app, then sign in with the email address and password you used above.

- **Android phone or tablet:** [Android mobile guide](installation/android-mobile.md)
- **Android TV:** [Android TV guide](installation/android-tv.md)
- **Windows:** [Windows guide](installation/windows.md)
- **iPhone or iPad:** [iOS guide](installation/ios.md)
- **LG webOS:** [webOS guide](installation/webos.md)
- **Samsung Tizen:** [Tizen guide](installation/tizen.md)

## Check that the addons are there

After signing in, open Nuvio's addon screen:

- **Android mobile:** open **Settings > Content and Discovery > Addons**.
- **Android TV:** open **Addons** from the sidebar.
- **Other devices:** open the app settings and look for the addon manager.

You should see:

- **Debrid route:** AIOStreams plus Nuvio Catalog.
- **HTTPS route:** PenguPlay plus Nuvio Catalog.

If either addon is missing, fully close and reopen Nuvio. You can also run the quickstart again with the same account; it will add the missing addons without clearing the rest of your list.

## Try a stream

1. Open a popular movie or series from Nuvio Catalog.
2. Start with a 1080p result before trying 4K or very large files.
3. Check playback, seeking, audio, and subtitles.

With the paid setup, results should come from AIOStreams and play through TorBox. If you connected TorBox directly inside Nuvio instead, see the [debrid integration guide](integrations/debrid.md).

With the free setup, results should come from PenguPlay. If one does not work, try another result or title first; availability differs between providers.

## Useful next steps

Once playback works, you may also want to:

- connect [Trakt](integrations/trakt.md) for watch history, lists, and progress;
- add [TMDB and MDBList](integrations/tmdb-mdblist-trakt.md) for more metadata and ratings;
- change autoplay, source selection, and subtitle options in [player settings](settings/player.md);
- make separate household profiles with the [profiles guide](settings/profiles.md);
- change stream labels and badges with the [stream badges guide](settings/badges.md).

## Quick troubleshooting

### Nuvio sign-in fails

The password must have at least six characters. If the account already exists, use its current password.

### TorBox validation fails

Make a fresh key in [TorBox Settings](https://torbox.app/settings), paste it without spaces or line breaks, and check that your TorBox subscription is active.

### The human check does not load

Refresh the page and make sure your browser or content blocker allows Cloudflare Turnstile. Complete a fresh check if the previous one expired.

### Addons are present but no streams appear

Try another popular title and restart Nuvio. If it still happens, check the [addon guide](integrations/addons.md) or the [troubleshooting guide](troubleshooting.md).

More settings are covered in the [settings guide](settings/index.md) and [integrations overview](integrations/index.md).
