# Avengild

**A social adventure guide for the Edmonton River Valley and the Rocky Mountains.**

Avengild is a React Native (Expo) application that connects explorers with curated guides ("The Codex") and local communities ("Guilds"). It bridges the gap between digital inspiration and real-world action.

---

## 🛠️ Tech Stack

* **Frontend:** React Native (Expo Router) + TypeScript
* **Backend:** Supabase (PostgreSQL + Auth + Realtime)
* **Navigation:** File-based routing (`app/`)
* **State Management:** Local State + Supabase Realtime subscriptions

---

## 🎨 Design System: The Edmonton Royal

Avengild uses a custom design system inspired by the colours of the river valley and the northern lights.

* **Primary:** `Edmonton Forest` (#375E3F)
* **Accent:** `Burnished Gold` (#BC8A2F)
* **Dark Mode Base:** `River Valley Night` (#394689)
* **Shock Accent:** `Aurora Dance` (#12DEAE)

*Full specifications can be found in `avengild-core/BRAND_GUIDE.md`.*

---

## 📜 Development Changelog

### **Phase 5: The Guilds & The Hearth (Feb 15–17, 2026)**

* **The Hearth (Social Feed):** Implemented a dynamic "Town Square" for each Guild. It features a dual-feed system displaying **Ideas** (shared Guides) and **Plans** (scheduled Events).
* **Privacy Airlock:** Created a secure bridge (`guide_access` table) allowing users to share **Private** guides with specific Guilds without making them globally Public.
* **Governance:** Added self-moderation tools (Long-press to delete) and role-based permissions (Guild Masters).
* **Identity System:** Established a Foreign Key bridge between Auth Users and Public Profiles to ensure names (e.g., "Alex Draper") render correctly across the app.

### **Phase 4: The Codex (Feb 14, 2026)**

* **Interactive Checklists:** Users can tap steps in a guide to mark them as complete.
* **The Quest Log:** A dedicated tab tracking "Started" vs. "Completed" guides.
* **Optimistic UI:** Checkmarks update instantly for a snappy feel, syncing to Supabase in the background.
* **Smart States:** The Codex handles "Not Logged In" and "No Trips Started" scenarios gracefully.

### **Phase 3: The Guide Engine (Feb 12, 2026)**

* **Discovery Feed:** The Home screen fetches "Featured Trips" (e.g., Banff Skijoring) with rich media headers.
* **Dynamic Routing:** Implemented `/guide/[id]` to render full 7-step itineraries (Hotel, Skiing, Après-Ski).
* **UI Components:** Built custom "Hero Cards" with shadow styling and gesture handling.

### **Phase 1 & 2: The Foundation (Feb 4–5, 2026)**

* **Initialization:** App successfully deployed to Android (Pixel 9 Pro).
* **The Bridge:** `lib/supabase.ts` client configured and authenticated.
* **Data Flow:** Established the first live connection to Supabase with "Public Read" RLS policies.

---

## 🚀 Current Focus

* **Next Steps:** Polishing the "Event Planning" flow and enabling Guild Chat.