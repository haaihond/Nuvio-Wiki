# Cross-Platform UI and Customization Guide

Whether you are swiping through catalogs on a phone or navigating with a remote on the couch, Nuvio offers deep customization to tailor your streaming environment. This guide breaks down how to configure visual elements, organize your media, and adjust playback navigation across both the Mobile and TV applications.

---

## 1. Themes & Appearance

### Shared Features
* **Accent Colors:** Select from White, Crimson, Ocean, Violet, Emerald, Amber, or Rose to highlight active menus, buttons, and playback progress bars.

### Mobile App
* **OLED/AMOLED Settings:** A straightforward *AMOLED Black* toggle enables pure black backgrounds to save battery and reduce eye strain.

### TV App
* **Settings Style:** Choose how the settings screens are presented across the app (*Default* cards, *Minimal* flat layout, or *Top Bar* navigation tabs).
* **OLED/AMOLED Settings:** Granular control is available — enable *AMOLED Mode* for the background layer, and separately toggle *Pure Black Surfaces* for interactive elements like cards, panels, and containers.
* **Typography:** Adjust the *App Font* (e.g., Inter) to optimize legibility for large-screen reading.

[Back to top](#cross-platform-ui-and-customization-guide)

---

## 2. Home Screen & Layout Structures

### Shared Features
* **Catalog Management:** Hide unreleased content to keep your library clean. Deep organizational control allows you to lock, hide, or pin specific collections (like *Discover*, *Franchises*, or *Streaming Services*) to curate exactly what appears on your home screen.
* **Poster Card Style:** Fine-tune the dimensions of your media cards. Choose a *Width* preset (Compact, Dense, Standard, Balanced, Comfort, or Large) and a *Corner Radius* preset (Sharp, Subtle, Classic, Rounded, or Pill). A *Reset to Default* option reverts all changes.
* **Landscape Posters:** Switch between traditional vertical portraits and horizontal landscape cards.

### Mobile App
* **Hero Sections:** Use the *Show Hero Section* toggle to display an interactive carousel at the top of the home screen, driven directly by your selected Hero Catalogs.
* **Hide Labels:** Clean up the UI by hiding text labels under posters (Note: this applies only to media posters, not collection tiles).

### TV App
* **Modern View Layout:** The top half of the screen acts as a dynamic hero section. As you navigate through catalogs, the currently focused poster expands into this top area, displaying its full backdrop, metadata, and synopsis. The rest of the catalog remains in a horizontal row below.
* **Classic View Layout:** Features a traditional, rotating Hero Carousel at the very top of the home screen. As you scroll down into the standard horizontal rows, the UI prioritizes the catalogs—focused posters do not dynamically expand or replace the background.
* **Grid View Layout:** Functions similarly to the Classic view, featuring the same rotating Hero Carousel at the top of the screen. However, instead of horizontal rows, it organizes the catalog into a wrapping, vertical-scrolling grid format below the hero.
* **Focused Item Gradient:** When using Classic or Grid view, toggle this to blend artwork colors smoothly into the right side of the home screen.
* **Fullscreen Hero Backdrop:** Toggle this setting to allow the hero image or focused poster to take up the entire background canvas of the screen.
* **Navigation & Sidebar:** Enable a floating *Modern Sidebar* and opt to *Collapse Sidebar* by default to maximize poster screen real estate. You can also toggle **Show/Hide Discover** to add a dedicated browsing section, and use **Discover Location** to place it either in *Search* or in the *Side Panel*.
* **Focused Poster Behavior:** Adjust the *Backdrop Expand Delay* slider (e.g., 3s) to control how long the app waits before expanding a focused card into the backdrop (primarily used in Modern View).
* **Home Screen Trailers:** Enable *Autoplay Trailer* to automatically play previews for focused content when available directly on the home screen.
* **Catalog Details:** A *Show Catalog Type* option displays Movie/Series suffixes next to titles.
* **Card Depth Effect:** Add a 3D aesthetic to your posters. Enable depth to add a soft sheen and a lit top edge to image cards. You can use the *Fine-tune* option to manually adjust Edge Glow, Top Sheen, and Edge Coverage percentages, and explicitly apply these effects to Posters, Continue Watching, Episode cards, Cast, or Trailers.

[Back to top](#cross-platform-ui-and-customization-guide)

---

## 3. Detail Page & Metadata Formatting

### Shared Features
*(Detail page presentation is highly optimized for the specific device form factor; see platform-specific options below).*

For metadata enrichment, ratings, see the [TMDb, MDblist, Trakt integration Guide](../integrations/tmdb-mdblist-trakt.md)

### Mobile App
* **Backgrounds & Artwork:** Enable *Cinematic Background* for blurred screen backdrops.
* **Episodes Layout:** Choose between *Horizontal* (backdrop-style row cards) or *List* (detail-first stacked cards) when viewing seasons.
* **Trailers:** Toggle *Hero Trailer Playback* to view previews directly within the top metadata hero.
* **Section Visibility:** Granularly hide or reorder modular detail page sections including Actions, Overview, Production, Cast, Comments, Trailers, and Episodes.

### TV App
* **Backgrounds & Artwork:** Toggle *Prefer meta from external addon* to dictate where your metadata originates.
* **Trailers:** Manage *Auto-play Trailers* to start previews after a period of inactivity on the detail page, or toggle a dedicated *Show Trailer Button* if you prefer manual control.
* **Data Formatting:** Toggle the *Show full release date* option to see the exact premiere day instead of just the release year.

[Back to top](#cross-platform-ui-and-customization-guide)

---

## 4. "Continue Watching" & Up Next Behavior

### Shared Features
* **Episode Tracking:** Enable *Up Next From Furthest Episode* to ensure the app surfaces the latest unwatched episode 
* **Show Unaired Next Up Episodes:** Include upcoming, not-yet-released episodes in the "Continue Watching" queue before they air.
* **Spoiler Prevention:** Use *Blur Unwatched Episodes* (Detail Page) and *Blur Unwatched in Continue Watching* so thumbnail images do not reveal major plot points.
* **Thumbnail Preferences:** Toggle *Prefer/Use Episode Thumbnails* to prioritize specific episode stills over the generic series backdrop.
* **Sort Order:** Arrange your "Continue Watching" queue by *Default* (based on recency) or *Streaming Style* (released items prioritize first, with upcoming unreleased episodes pushed to the end).
* **Resume Prompt on Launch:** Show a popup to continue where you left off when reopening the app right after leaving from the player.

### Mobile App
* **Poster Card Style:** Customize the "Continue Watching" shelf by switching between TV-style *Card*, info-dense *Wide*, or artwork-first *Poster* styles.

### TV App
*(Continue Watching cards on TV automatically adapt to match your chosen Home Layout View).*

[Back to top](#cross-platform-ui-and-customization-guide)

---

### Platform Comparison Quick Reference

| Feature | Mobile App | TV App |
| :--- | :--- | :--- |
| **Pure Black Surfaces** | AMOLED Black (Global toggle) | Granular (Backgrounds vs. Panels) |
| **Catalog Management** | Hide, Lock, or Pin Collections | Hide, Lock, or Pin Collections |
| **Home Layout Views** | Vertical scrolling rows | Selectable Modern, Grid, or Classic Views |
| **Hero Sections** | Interactive carousel at top | Dynamic (Modern) or Rotating Carousel (Classic/Grid) |
| **Poster Adjustments** | Sizing presets + *Landscape* + *Hide Labels* | Sizing presets + *Landscape* + *Expand to Backdrop* |
| **Sidebar Navigation** | Bottom/Hamburger tab menu | Floating Modern Sidebar (Collapsible) |
| **Detail Page Layout** | Reorderable UI sections & tabs | External Metadata toggles & Auto-Play trailers |
| **Continue Watching** | Selectable Card, Wide, or Poster styles | Automatically adapts to chosen Home Layout View |

[Back to top](#cross-platform-ui-and-customization-guide)

