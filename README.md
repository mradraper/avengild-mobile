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

### **Phase 6: The Guide Engine — Field Interface (Mar 8, 2026)**

A full rebuild of the guide detail experience into a composable, multi-component architecture.

#### New Components (`components/guide/`)
* **`MediaHeader`:** Crossfades between the guide's hero image and the active step's media using standard `Animated` (fade-out 150 ms → swap → fade-in 200 ms, `useNativeDriver: true`).
* **`BirdsEyeHeader`:** Collapsible Reanimated 4 panel (cubic ease-out, 280 ms). Displays overall progress and a scrollable step list grouped by phase. Tapping a step collapses the panel and navigates directly to that step. `defaultExpanded` prop defaults to `false` for single-phase guides so users land straight in the steps.
* **`PhaseNavigator`:** Horizontal scrollable pill tabs showing done/total per phase. Only rendered when a guide has more than one phase.
* **`SequentialView`:** Horizontal paging ScrollView with Prev/Next navigation and a Mark Done / Undo toggle.
* **`FreeformView`:** Vertical FlatList of compact checklist rows.
* **`StepCard`:** Core step atom. Full-card mode with media, curation notes, beginner mistake banner, intent tag badge, Mastery Tree indicator, and a location pin row (`location_name`). Compact mode for Freeform checklists.
* **`IntentTagBadge`:** Colour-coded tag (Safety, Gear Check, Milestone, General) with proper light/dark contrast — Milestone uses `tundraLichen` in dark mode and `edmontonForest` in light to avoid illegibility on `limestoneWhite`.
* **`BeginnerMistakeBanner`:** Amber alert strip for common pitfalls.
* **`ShareToHearthModal`:** Bottom sheet for sharing a guide to a Guild Hearth.

#### `app/guide/[id].tsx` — Thin Orchestrator
* Queries phases with nested `step_cards` sorted by `step_index`.
* `handleStepToggle` captures `wasCompleted` before state update and calls `Codex.uncompleteStep` or `Codex.completeStep` accordingly.
* `handleBirdsEyeStepSelect` updates both `activePhaseIndex` and `sequentialStepIndex` from the BirdsEyeHeader step list.

#### Codex Screen Rebuild (`app/(tabs)/codex.tsx`)
* **Real progress tracking:** `getCompletedStepIds()` fetches the user's completed steps in a single query; progress bars are computed client-side from nested phase/step ID counts.
* **Intentions / Logs segmentation:** `isLog(entry)` returns true when `status === 'Completed'` OR all steps are ticked — a bridge-period heuristic until the Events Engine (migration 002) makes status the authoritative signal.
* **Web compatibility:** Applied `StyleSheet.flatten()` to all style arrays, fixing a `CSSStyleDeclaration` indexed setter crash in react-native-web 0.21 caused by nested style arrays inside `Pressable asChild`.
* **Resilient Supabase query:** Uses `select('*')` on `codex_entries` to avoid hardcoding timestamp column names that returned 42703 errors against the live schema.

#### Platform-Specific Supabase Client
* Split `lib/supabase.ts` into `supabase.native.ts` (AsyncStorage + URL polyfill, resolved by Metro on iOS/Android) and `supabase.ts` (localStorage with SSR guard for Expo web). Resolves a `window is not defined` crash on the web build caused by AsyncStorage's eager `window.localStorage` access at module evaluation time.

#### Step Completion Persistence
* `Codex.uncompleteStep` uses `{ count: 'exact' }` on the DELETE call and warns when 0 rows are deleted, enabling detection of silent RLS blocks.
* **Required Supabase action:** `CREATE POLICY "Users can delete their own step progress." ON public.step_progress FOR DELETE USING (auth.uid() = user_id);`

#### Location Data — The Downtown Toronto Eclectic Pub Crawl
* Added `location_name` (venue display name) and `location_anchor` (PostGIS geography point) to all 6 pub crawl steps — geocoded via Nominatim.
* Set guide `primary_location_name = 'Toronto, ON'` and `primary_coordinates` to the geographic centroid of the six venues.

---

## 🚀 Current Focus

* **Next Steps:** Events Engine (migration 002) — `events`, `event_guests`, `kit_items`, `event_step_states` tables; full Codex status lifecycle (Intention → Scheduled → Completed).