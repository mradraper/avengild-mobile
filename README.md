## Current Status (Feb 4, 2026)
* **Architecture:** React Native (Expo) + TypeScript.
* **Backend:** Connected to Supabase (Project: xbkzt...).
* **Progress:**
    * App initializes on Android (Pixel 9 Pro).
    * Supabase client configured in `lib/supabase.ts`.
    * Next Step: Fetch and display the "Banff" guide in the UI.
---

## Current Status (Feb 5, 2026)
* **Architecture:** React Native (Expo) + Supabase.
* **Features:**
    * **Home Screen:** Fetches and displays the "Featured Trip" (Banff) from the database.
    * **Data Flow:** Live connection established. RLS policies set to "Public Read".
* **Next Step:** Render the full itinerary (Day 1, Day 2, etc.) and images.

## Current Status (Feb 12, 2026)
* **Architecture:** React Native (Expo Router) + Supabase (Live Connection).
* **Completed Features:**
    * **The Bridge:** `lib/supabase.ts` client is authenticated and pulling live data.
    * **Discovery Feed (Home):** Fetches the "Featured Trip" (Banff Skijoring) including Title, Summary, and Hero Image (`hero_media_url`).
    * **Detail View:** Dynamic routing (`/guide/[id]`) allows users to tap a card and view the full 7-step itinerary (Hotel, Skiing, Après-Ski).
    * **UI Components:** Custom "Hero Card" with shadow styling, image handling, and `Pressable` navigation.
* **Next Phase:** Phase 4 (The Codex) - Building the "Creator" tools to write guides in-app.

## 🎨 Design System: The Edmonton Royal
Avengild uses a custom design system inspired by the Edmonton River Valley and the Rocky Mountains.
* **Primary:** Edmonton Forest (#375E3F)
* **Accent:** Burnished Gold (#BC8A2F)
* **Dark Mode Base:** River Valley Night (#394689)
* **Shock Accent:** Aurora Dance (#12DEAE)

Full specifications can be found in `avengild-core/BRAND_GUIDE.md`.

### Phase 4: The Codex (Feb 14, 2026)
- **Interactive Checklists:** Users can tap steps to mark them as complete.
- **Quest Log (Codex Tab):** A dedicated tab that tracks "Started" vs. "Completed" guides.
- **Optimistic UI:** Checkmarks update instantly for a snappy feel, syncing to Supabase in the background.
- **Data Persistence:** Progress is saved to `step_progress` table (requires auth).
- **Smart Empty States:** The Codex handles "Not Logged In" and "No Trips Started" scenarios gracefully.

### 🛡️ Guilds & Social (Phase 5)  (Feb 15, 2026)
- **Guild Hall:** Implemented dynamic guild spaces with dedicated Roster, Board, and Chat tabs.
- **Role-Based Access:** Automated "Guild Master" assignment upon guild creation via PostgreSQL triggers.
- **Identity System:** Established a "Bridge" between Auth users and Public profiles to ensure member names and avatars render correctly across the social layer.
- **Bulletin Board:** Laid the groundwork for "Guide Syndication," allowing users to pin content to specific Guild Halls.