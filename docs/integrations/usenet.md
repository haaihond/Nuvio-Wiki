# Usenet

This doc is to help set up Usenet inside of Aiostreams. Before we jump straight in, however, I'll first give a short crash course on Usenet.
If you are already familiar with Usenet, feel free to skip straight to the setup guide. If instead you want to learn more on usenet check out [the usenet subreddit and it's wiki](https://www.reddit.com/r/usenet/)

### 3 Things You Need to Know (If you're used to Torrents)

1. **No Seeders Needed:** Unlike torrents, which are peer-to-peer (P2P), Usenet uses a client-server model. You are downloading files directly from massive, high-speed servers. This means you will always max out your internet connection speed, even for obscure files, without relying on anyone "seeding" them.
2. **Retention:** Because providers host these files on real hard drives, they can't keep them forever. **Retention** is the number of days a provider keeps a file before deleting it to make room for new ones. High-end providers keep files for years, but once a file passes the provider's retention limit, it's gone. Torbox, for example, has a retention of 5000 days.
3. **Obfuscation:** To protect files from being immediately taken down, uploaders hide them by scrambling their names (e.g., naming a movie file `abc123xyz.part01.rar`). This is called **obfuscation**. This is why you cannot search your provider directly; you *need* an Indexer. The indexer holds the **NZB file**, which acts as the "decoder ring" telling your client: *"Hey, download these scrambled pieces and put them back together into the actual movie."*

A basic Usenet setup usually looks like this:
| Piece | What it does |
| :--- | :--- |
| Usenet provider | Gives you access to Usenet servers |
| Search tool or indexer | Helps you find Usenet posts |
| Newsreader / NZB client | Connects to your provider and retrieves articles |

I recommend Torbox Pro as Usenet provider, as it covers both Usenet as Debrid and is easy to use. Don't have Torbox yet? Sign up with [my referral](https://torbox.app/subscription?referral=41d1ac85-ee5e-4699-9f0a-92e67cbc2fb2). This is also the example I'm going to use in this guide.
This guide will cover self-hosted Aiostreams as NZB client for the same reason. It is simply easy and fits right in your current debrid setup.
I won't choose an indexer for you. For choosing one, I refer you to [this](https://gist.github.com/QINGCHARLES/307a7782dec86ff73a1f2b5b9c8f6c12) page for a curated indexer list.

---

**Starting in Aiostreams**

### Step 1: Add your Torbox credentials
1. Log in to your self-hosted **Aiostreams** instance with your admin credentials. 
2. Then open the **dashboard**, open the **Usenet** dropdown, and select **providers**.
3. In here, fill in your **Torbox** credentials, which can be found in the [tools page](https://torbox.app/tools). *Please note that **Torbox Pro** is required for this, and the Usenet password only gets shown once*

### Step 2: Enable the service
1. After this has been filled in, go back to your **configuration**.
2. Enable the **Aiostreams** service in the **services** tab.
3. Press **configure**, and make sure to fill yours in exactly like `username:password`.

### Step 3: Configure your indexer
1. Proceed to the **addons** section and in the **marketplace** search for **Newznab**. 
2. Add your indexer **API key** and configure the settings to your liking (check out [this](https://gist.github.com/QINGCHARLES/307a7782dec86ff73a1f2b5b9c8f6c12) page if you don't have an indexer yet). 
3. You can add as many **Newznab** instances. Each one per indexer, which is recommended to get greater coverage.

---

> [!IMPORTANT]
> It can be that your indexer blocks your Aiostreams agent. To address this, go to **Dashboard** - **Settings** - **HTTP** and under **request header overrides** set: `[your-indexer-url] = {nzbhydra2}`.
> For me, this was happening with **DrunkenSlug**, so under **request header overrides** I set: `"drunkenslug.com = {nzbhydra2}"`.

---

If anything else goes wrong, take a look at the server logs that can be found on the **dashboard**. If you can't find the fix on your own, ask around in the [Aiostreams Discord](https://discord.gg/cpsvCZPdg).
