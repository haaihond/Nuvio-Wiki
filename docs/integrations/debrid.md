[🏠 Home](../../README.md) | [⚡ Quick Start](../quick-start.md) | [📢 Report Issue](../../../issues)

---

# 🔓 Debrid Integration Guide

Debrid services are high-speed downloaders that fetch files from hosters and torrents, then stream them to you via a secure, high-bandwidth connection.

## 🚀 Supported Services

### 1. Real-Debrid (RD)
The most popular and cost-effective service with the largest cache of files.
- **Pros:** Massive cache, affordable, high-speed servers.
- **Cons:** Strict 1-IP rule (cannot use on two different internet connections at once).
- **Setup:** [real-debrid.com/device](https://real-debrid.com/device)

### 2. AllDebrid (AD)
A highly reliable alternative to Real-Debrid with excellent customer support and browser extensions.
- **Pros:** Great reliability, high speeds, supports many hosters.
- **Cons:** Slightly smaller cache than RD in some niche categories.
- **Setup:** [alldebrid.com/pin](https://alldebrid.com/pin)

### 3. Premiumize.me (PM)
A premium all-in-one service that includes a personal cloud and a built-in VPN.
- **Pros:** Personal cloud storage, 1TB limit, built-in VPN, allows multiple IPs (using "Points" system).
- **Cons:** More expensive than RD/AD.
- **Setup:** [premiumize.me/device](https://premiumize.me/device)

### 4. TorBox
A fast-growing service that excels in Usenet support alongside traditional torrent debrid.
- **Pros:** Native Usenet support, fast caching, modern API.
- **Cons:** Newer service (verify addon compatibility).
- **Setup:** [torbox.app/settings](https://torbox.app/settings)

### 5. Offcloud / Put.io (Advanced)
Nuvio also supports specialized cloud storage providers. These are best if you maintain a personal library of files.
- **Offcloud:** Great for direct links and cloud downloads.
- **Put.io:** Best-in-class personal cloud for torrent management.

## 💡 Why use Debrid?
1. **No Buffering:** Streams are served from high-speed data centers, not peer-to-peer.
2. **Quality:** Access to massive 4K/Remux files (60GB+) that are impossible to stream via standard public links.
3. **Safety:** The debrid service downloads the torrent on their servers; you only download/stream a private encrypted file from them.

## 🛠️ Setup Steps
1. **Get an Account:** Sign up on the respective website.
2. **Retrieve API Key/Authorize:**
   - In Nuvio, go to **Settings** > **Integrations** > **[Your Service]**.
   - A 6-digit code will appear.
   - Go to the service's authorization page (links above) and enter the code.
3. **Configure Addons:** Most Nuvio addons will automatically detect your Debrid service once linked.

## ❓ Troubleshooting
- **"No Streams Found":** Check if your subscription has expired or if the addon supports your specific service.
- **"Authorization Failed":** Ensure you are logged into the website on your browser before entering the device code.
