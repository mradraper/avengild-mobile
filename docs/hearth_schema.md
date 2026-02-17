# Hearth Technical Implementation
*Status: Implemented Feb 17, 2026*

## 1. Core Tables

### A. The Privacy Airlock (`guide_access`)
**Purpose:** Allows private Guides to be shared with specific Guilds without becoming globally public.
- `id`: UUID (Primary Key)
- `guide_id`: UUID (Foreign Key to `guides`)
- `guild_id`: UUID (Foreign Key to `guilds`)
- `granted_by`: UUID (User who shared it)
- `granted_at`: Timestamp
- **Constraint:** Unique pair (`guide_id`, `guild_id`) to prevent duplicate shares.

### B. The Event Wrapper (`guild_events`)
**Purpose:** Transforms a static Guide into a scheduled plan.
- `id`: UUID (Primary Key)
- `guild_id`: UUID (Foreign Key to `guilds`)
- `guide_id`: UUID (Optional link to `guides`)
- `created_by`: UUID (Organizer)
- `title`: Text (Required)
- `start_time`: Timestamp (Indexed for sorting)
- `location_name`: Text
- `is_cancelled`: Boolean (Default false)

---

## 2. Security Architecture (RLS)

### The "Hearth Access" Logic
We updated the `guides` table policy to respect the Airlock. A user can now `SELECT` a guide if:
1.  **Public:** `is_public = true`
2.  **Owner:** `auth.uid() = creator_id`
3.  **Airlock:** The user is a member of a Guild that has an entry in `guide_access` for that guide.

```sql
-- The Actual Policy Logic Used:
(
  is_public = true 
  or 
  auth.uid() = creator_id 
  or 
  exists (
    select 1 from public.guide_access ga
    join public.guild_members gm on gm.guild_id = ga.guild_id
    where ga.guide_id = guides.id 
    and gm.user_id = auth.uid()
  )
)