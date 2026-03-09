/**
 * database.types.ts
 *
 * Avengild — Manual Database Type Definitions
 * Reflects schema state after: 001_rebuild_guides_schema.sql
 *
 * This file is the single source of truth for all Supabase table shapes
 * in the mobile app. It should be updated in lockstep with every SQL
 * migration. Three variants are provided per table:
 *
 *   Row    — The full shape returned by a SELECT query.
 *   Insert — The shape required for an INSERT (omits DB-generated fields).
 *   Update — A partial Insert, all fields optional, for PATCH operations.
 *
 * Usage:
 *   import type { Tables, Enums } from '@/lib/database.types';
 *   const guide: Tables<'guides'>['Row'] = { ... };
 *   const mode:  Enums['execution_mode']  = 'Sequential';
 */


// =============================================================================
// SECTION 1: ENUM TYPES
// Mirrors the PostgreSQL enums defined in 001_rebuild_guides_schema.sql.
// =============================================================================

export type Enums = {

  /**
   * Governs how a Phase's steps are presented to the user
   * in the one-handed field interface.
   *
   * Sequential — Linear, card-swipe flow for strict processes
   *              (e.g., a cooking recipe or a trail route).
   * Freeform   — Flexible checklist or grid for open-ended tasks
   *              (e.g., a gear list or a restaurant quest).
   */
  execution_mode: 'Sequential' | 'Freeform';

  /**
   * Three-tiered visibility control for Guides. Replaces the
   * legacy `is_public` boolean field.
   *
   * Public     — Visible on the global Discovery feed.
   * Guild_Only — Visible only to members of authorised Guilds
   *              (requires a row in guide_access).
   * Private    — Visible only to the creator.
   */
  stewardship_level: 'Public' | 'Guild_Only' | 'Private';

  /**
   * Controls whether other users may fork, mutate, and republish
   * a Guide blueprint. Set by the creator on publish.
   *
   * Note: "licence" uses Canadian English noun spelling.
   *
   * allow_forking    — Others may fork, mutate, and republish.
   * locked_execution — Others may only instantiate and execute.
   */
  derivative_licence: 'allow_forking' | 'locked_execution';

  /**
   * Drives conditional visual and haptic UI behaviour on a step card.
   *
   * General    — Standard informational step; no special treatment.
   * Safety     — High-visibility red border and alert styling.
   * Gear_Check — Prompts the user to verify equipment.
   * Milestone  — Triggers a celebratory haptic response on completion.
   */
  intent_tag: 'General' | 'Safety' | 'Gear_Check' | 'Milestone';

  /**
   * Tracks a user's relationship with a Guide through the
   * Adventure Lifecycle.
   *
   * Intention — Saved to the Codex as a future aspiration.
   * Scheduled — An Event has been created from this Codex entry.
   * Completed — The adventure is finished and logged as a trophy.
   */
  codex_status: 'Intention' | 'Scheduled' | 'Completed';

  /** Guild privacy settings. */
  privacy_setting: 'public' | 'private' | 'secret';
};


// =============================================================================
// SECTION 2: HELPER TYPES
// =============================================================================

/**
 * Represents a single item in a step card's media_payload JSONB array.
 * Media requires a deliberate tap to play in the field interface,
 * to conserve battery life and bandwidth during outdoor execution.
 */
export type MediaPayloadItem = {
  /** The media type. Determines which player component is rendered. */
  type: 'photo' | 'video' | 'audio';
  /** Public URL to the media asset in Supabase Storage. */
  url: string;
  /** Optional caption displayed below the media player. */
  caption: string | null;
};

/**
 * The full media_payload column value: an array of media items.
 * A step may have zero or more media attachments.
 */
export type MediaPayload = MediaPayloadItem[];

/**
 * A geographic point value as returned from PostGIS GEOGRAPHY columns.
 * Supabase returns these as GeoJSON when using the standard JS client.
 */
export type GeographyPoint = {
  type: 'Point';
  coordinates: [longitude: number, latitude: number];
};


// =============================================================================
// SECTION 3: TABLE DEFINITIONS
// =============================================================================

export type Tables<T extends keyof DatabaseSchema> = DatabaseSchema[T];

export type DatabaseSchema = {

  // ---------------------------------------------------------------------------
  // profiles
  // Bridges secure authentication (auth.users) and public display data.
  // Auto-created by a DB trigger when a new user registers.
  // ---------------------------------------------------------------------------
  profiles: {
    Row: {
      /** Primary Key. Mirrors auth.users.id exactly. */
      id: string;
      /** Unique public handle (e.g., "@trailblazer_sam"). */
      username: string | null;
      /** Display name shown in the UI. */
      full_name: string | null;
      /** Path to the user's avatar in Supabase Storage. */
      avatar_url: string | null;
      /** Optional external link on the user's profile. */
      website: string | null;
      /**
       * Creator metric: total times this user's Guides have been
       * launched as active Events. Displayed as a "Badge of Honour."
       */
      event_instantiations: number;
      /**
       * Creator metric: aggregate step completions by the community
       * using this user's Guides. The deepest measure of real-world impact.
       */
      global_step_completions: number;
      updated_at: string | null;
    };
    Insert: {
      id: string;
      username?: string | null;
      full_name?: string | null;
      avatar_url?: string | null;
      website?: string | null;
      event_instantiations?: number;
      global_step_completions?: number;
      updated_at?: string | null;
    };
    Update: Partial<Tables<'profiles'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // guides
  // The primary content unit. A structured logic tree for a real-world
  // experience. Acts as the immutable blueprint ("The Scroll") from which
  // Events are instantiated.
  // ---------------------------------------------------------------------------
  guides: {
    Row: {
      /** Primary Key. */
      id: string;
      /** FK → auth.users. The current owner and author of this Guide. */
      creator_id: string;
      title: string;
      /** High-level overview of the Guide's purpose and scope. */
      description: string | null;
      /** Legacy summary field. Use description for new content. */
      summary: string | null;
      /** URL to the primary image or video loop for Discovery cards. */
      hero_media_url: string | null;
      /** Human-readable location tag (e.g., "Jasper, AB"). */
      primary_location_name: string | null;
      /** GeoJSON Point for map-based discovery and distance filtering. */
      primary_coordinates: GeographyPoint | null;
      /**
       * Three-tiered visibility model. Replaces the legacy is_public boolean.
       * Public, Guild_Only, or Private.
       */
      stewardship_level: Enums['stewardship_level'];
      /**
       * Controls forking permissions. allow_forking or locked_execution.
       * Note: "licence" uses Canadian English noun spelling.
       */
      derivative_licence: Enums['derivative_licence'];
      /** Tracks the current iteration. Triggers upstream_flag on Events. */
      version: number;
      /**
       * When true, de-listed from all feeds but preserved in full
       * to maintain attribution chain integrity.
       */
      is_archived: boolean;
      // --- Attribution Chain ---
      /**
       * Self-referential FK. The Guide this was directly forked from.
       * Null for original, un-forked Guides.
       */
      immediate_parent_id: string | null;
      /**
       * FK → auth.users. The root creator of the entire lineage.
       * Preserved through all subsequent forks.
       */
      original_architect_id: string | null;
      // --- Utility Metrics (Discovery Engine) ---
      /** Total times this Guide has been instantiated into an Event. */
      instantiation_count: number;
      /** Total times this Guide has been forked into a new Guide. */
      fork_count: number;
      /** Aggregate step completions by the community across all Events. */
      total_step_completions: number;
      // --- Legacy fields (kept for backward compatibility) ---
      difficulty_level: string | null;
      duration_estimate: string | null;
      created_at: string;
      updated_at: string | null;
    };
    Insert: {
      id?: string;
      creator_id: string;
      title: string;
      description?: string | null;
      summary?: string | null;
      hero_media_url?: string | null;
      primary_location_name?: string | null;
      primary_coordinates?: GeographyPoint | null;
      stewardship_level?: Enums['stewardship_level'];
      derivative_licence?: Enums['derivative_licence'];
      version?: number;
      is_archived?: boolean;
      immediate_parent_id?: string | null;
      original_architect_id?: string | null;
      instantiation_count?: number;
      fork_count?: number;
      total_step_completions?: number;
      difficulty_level?: string | null;
      duration_estimate?: string | null;
    };
    Update: Partial<Tables<'guides'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // phases
  // Named containers that group step cards within a Guide.
  // Each phase defines its own execution_mode, enabling a single Guide
  // to contain both strict sequential sections and flexible checklists.
  // ---------------------------------------------------------------------------
  phases: {
    Row: {
      /** Primary Key. */
      id: string;
      /** FK → guides. The parent Guide this phase belongs to. */
      guide_id: string;
      /** Display name (e.g., "Preparation", "The Ascent", "Recovery"). */
      title: string;
      /** Optional context explaining this phase's objective to the user. */
      description: string | null;
      /** Zero-based integer. Lower values appear first in the Guide. */
      phase_index: number;
      /**
       * Sequential: linear card-swipe, one step at a time.
       * Freeform: checklist or grid, any order.
       */
      execution_mode: Enums['execution_mode'];
      created_at: string;
    };
    Insert: {
      id?: string;
      guide_id: string;
      title: string;
      description?: string | null;
      phase_index?: number;
      execution_mode?: Enums['execution_mode'];
    };
    Update: Partial<Tables<'phases'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // step_cards
  // The atomic, actionable building blocks of a Guide.
  // Each step belongs to a phase (not directly to a guide).
  // The relationship is: step_card → phase → guide.
  // ---------------------------------------------------------------------------
  step_cards: {
    Row: {
      /** Primary Key. */
      id: string;
      /** FK → phases. The phase container this step belongs to. */
      phase_id: string;
      /** FK → auth.users. The user who authored this step. */
      creator_id: string;
      /**
       * The high-contrast headline instruction. Bold, imperative, brief.
       * This is the one thing the user must read in the field.
       * (e.g., "Turn left at the cairn", "Add 2 tsp of salt")
       */
      atomic_action_text: string;
      /** Zero-based integer. Determines execution order within the phase. */
      step_index: number;
      /**
       * Flexible media array. Each item has a type (photo, video, audio),
       * a url, and an optional caption. Tap-to-play in the field interface.
       */
      media_payload: MediaPayload | null;
      /** The creator's contextual "pro-tip" or the "why" behind the action. */
      curation_notes: string | null;
      /**
       * High-visibility warnings and common pitfalls. Rendered with a
       * distinct UI treatment (amber alert) separate from curation_notes.
       */
      beginner_mistakes: string | null;
      /**
       * Drives conditional UI behaviour:
       * Safety → red border; Gear_Check → equipment prompt;
       * Milestone → celebratory haptic.
       */
      intent_tag: Enums['intent_tag'];
      /**
       * When true, masks location_anchor and curation_notes for users
       * who have not met the Guild membership or permission requirement.
       * The technical implementation of Stewardship of Knowledge.
       */
      is_sensitive: boolean;
      /**
       * Precise coordinates for this specific action, making the step
       * act as a waypoint on a map.
       */
      location_anchor: GeographyPoint | null;
      /**
       * Human-readable venue or place name displayed beneath the step action
       * alongside a map pin icon (e.g., "The Rex Hotel Jazz & Blues Bar").
       * Distinct from location_anchor, which stores the precise GPS coordinates.
       */
      location_name: string | null;
      /**
       * Mastery Tree portal. When populated, this step is a gateway to
       * a nested Guide rather than a standard atomic action. Completing
       * the nested Guide auto-completes this step in the parent.
       */
      linked_guide_id: string | null;
      /**
       * Multiplier for ecosystem metric calculations. Default 1.
       * Used to weight this step's contribution to total_step_completions.
       */
      completion_weight: number;
      created_at: string;
    };
    Insert: {
      id?: string;
      phase_id: string;
      creator_id: string;
      atomic_action_text: string;
      step_index?: number;
      media_payload?: MediaPayload | null;
      curation_notes?: string | null;
      beginner_mistakes?: string | null;
      intent_tag?: Enums['intent_tag'];
      is_sensitive?: boolean;
      location_name?: string | null;
      location_anchor?: GeographyPoint | null;
      linked_guide_id?: string | null;
      completion_weight?: number;
    };
    Update: Partial<Tables<'step_cards'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // codex_entries
  // The personal archive. Represents a user's relationship with a Guide
  // through the Adventure Lifecycle: Intention → Scheduled → Completed.
  // ---------------------------------------------------------------------------
  codex_entries: {
    Row: {
      /** Primary Key. */
      id: string;
      /** FK → auth.users. */
      user_id: string;
      /** FK → guides. */
      guide_id: string;
      /**
       * Intention: saved as a future aspiration.
       * Scheduled: an Event has been created from this entry.
       * Completed: the adventure is done and logged as a trophy.
       * Note: the legacy value 'active' is superseded by 'Intention'.
       */
      status: Enums['codex_status'];
      /** Private notes visible only to this user. */
      personal_notes: string | null;
      /**
       * UNVERIFIED — do not select explicitly until confirmed.
       * The insert timestamp column exists but its exact name is unknown:
       * 'added_at', 'created_at', and 'last_completed_at' all returned
       * error 42703 (undefined_column) against the live database.
       * To find the real column names, run the following in the Supabase
       * SQL Editor and update this type accordingly:
       *
       *   SELECT column_name, data_type
       *   FROM   information_schema.columns
       *   WHERE  table_schema = 'public'
       *     AND  table_name   = 'codex_entries'
       *   ORDER  BY ordinal_position;
       */
      last_completed_at?: string | null;
    };
    Insert: {
      id?: string;
      user_id: string;
      guide_id: string;
      status?: Enums['codex_status'];
      personal_notes?: string | null;
    };
    Update: Partial<Tables<'codex_entries'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // guilds
  // The social and ethical boundary of the platform.
  // Guilds function as autonomous communities with custom governance.
  // ---------------------------------------------------------------------------
  guilds: {
    Row: {
      /** Primary Key. */
      id: string;
      /** FK → auth.users. The ultimate authority of the Guild. */
      owner_id: string;
      /** FK → auth.users. Alias for owner_id; set on creation. */
      created_by: string;
      /** Display name (e.g., "Edmonton Foodies"). */
      name: string;
      /** Unique slug for sharing (e.g., "yegfoodies"). */
      handle: string;
      description: string | null;
      privacy_setting: Enums['privacy_setting'];
      banner_url: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      owner_id: string;
      created_by: string;
      name: string;
      handle: string;
      description?: string | null;
      privacy_setting?: Enums['privacy_setting'];
      banner_url?: string | null;
    };
    Update: Partial<Tables<'guilds'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // guild_roles
  // Flexible permission engine. Replaces static roles with a customisable
  // hierarchy, allowing Guild Masters to design their own governance model.
  // ---------------------------------------------------------------------------
  guild_roles: {
    Row: {
      /** Primary Key. */
      id: string;
      /** FK → guilds. */
      guild_id: string;
      /** Customisable title (e.g., "Trail Blazer", "Grand Poobah"). */
      name: string;
      /**
       * JSONB toggle map for granular capabilities.
       * e.g., { "can_manage_guild": true, "can_kick": false,
       *         "can_post_hearth": true, "can_pin": false }
       */
      permissions: Record<string, boolean>;
      /** When true, new members are auto-assigned this role. */
      is_default: boolean;
      /** Determines visual hierarchy in member lists. Lower = higher rank. */
      rank_order: number;
    };
    Insert: {
      id?: string;
      guild_id: string;
      name: string;
      permissions?: Record<string, boolean>;
      is_default?: boolean;
      rank_order?: number;
    };
    Update: Partial<Tables<'guild_roles'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // guild_members
  // Links users to guilds and defines their current role and standing.
  // ---------------------------------------------------------------------------
  guild_members: {
    Row: {
      /** Primary Key. */
      id: string;
      guild_id: string;
      user_id: string;
      /** FK → guild_roles. Defines the member's powers in this Guild. */
      role_id: string;
      joined_at: string;
    };
    Insert: {
      id?: string;
      guild_id: string;
      user_id: string;
      role_id: string;
    };
    Update: Partial<Tables<'guild_members'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // guide_access  (The Privacy Airlock)
  // Grants read access to a Private or Guild_Only Guide for a specific
  // Guild without making it globally Public. Distinct from guild_guides
  // (the future syndication layer).
  // ---------------------------------------------------------------------------
  guide_access: {
    Row: {
      /** Primary Key. */
      id: string;
      guide_id: string;
      guild_id: string;
      /** FK → auth.users. The user who granted the access. */
      granted_by: string;
      granted_at: string;
    };
    Insert: {
      id?: string;
      guide_id: string;
      guild_id: string;
      granted_by: string;
    };
    Update: Partial<Tables<'guide_access'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // guild_events  (Simplified Event wrapper — Hearth feature)
  // Transforms a static Guide into a scheduled plan visible on the
  // Guild's Hearth feed. This table will be superseded by the full
  // `events` table defined in migration 002 (the Events Engine).
  // ---------------------------------------------------------------------------
  guild_events: {
    Row: {
      /** Primary Key. */
      id: string;
      guild_id: string;
      /** Optional link to the Guide blueprint being followed. */
      guide_id: string | null;
      created_by: string;
      title: string;
      start_time: string;
      location_name: string | null;
      is_cancelled: boolean;
    };
    Insert: {
      id?: string;
      guild_id: string;
      guide_id?: string | null;
      created_by: string;
      title: string;
      start_time: string;
      location_name?: string | null;
      is_cancelled?: boolean;
    };
    Update: Partial<Tables<'guild_events'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // tags  (Discovery Engine — Soft Metadata)
  // Flexible tagging dictionary. Tags are created on demand and reused
  // across Guides via the guide_tags join table.
  // ---------------------------------------------------------------------------
  tags: {
    Row: {
      /** Primary Key. */
      id: string;
      /** The tag itself (e.g., "Rock Climbing", "Vegan", "Night Photography"). */
      label: string;
      /** Optional category for organisation. */
      tag_type: string | null;
    };
    Insert: {
      id?: string;
      label: string;
      tag_type?: string | null;
    };
    Update: Partial<Tables<'tags'>['Insert']>;
  };

  // ---------------------------------------------------------------------------
  // guide_tags  (Many-to-Many join)
  // ---------------------------------------------------------------------------
  guide_tags: {
    Row: {
      guide_id: string;
      tag_id: string;
    };
    Insert: {
      guide_id: string;
      tag_id: string;
    };
    Update: never;
  };

  // ---------------------------------------------------------------------------
  // profiles (already defined above)
  // ---------------------------------------------------------------------------
};


// =============================================================================
// SECTION 4: CONVENIENCE RE-EXPORTS
// Shorthand type aliases for the most frequently used Row types,
// reducing verbosity in screen and component files.
// =============================================================================

export type Profile      = Tables<'profiles'>['Row'];
export type Guide        = Tables<'guides'>['Row'];
export type Phase        = Tables<'phases'>['Row'];
export type StepCard     = Tables<'step_cards'>['Row'];
export type CodexEntry   = Tables<'codex_entries'>['Row'];
export type Guild        = Tables<'guilds'>['Row'];
export type GuildRole    = Tables<'guild_roles'>['Row'];
export type GuildMember  = Tables<'guild_members'>['Row'];
export type GuideAccess  = Tables<'guide_access'>['Row'];
export type GuildEvent   = Tables<'guild_events'>['Row'];
export type Tag          = Tables<'tags'>['Row'];

// Insert shorthand aliases.
export type GuideInsert     = Tables<'guides'>['Insert'];
export type PhaseInsert     = Tables<'phases'>['Insert'];
export type StepCardInsert  = Tables<'step_cards'>['Insert'];
export type CodexInsert     = Tables<'codex_entries'>['Insert'];
export type GuildInsert     = Tables<'guilds'>['Insert'];


// =============================================================================
// SECTION 5: COMPOSITE / JOIN TYPES
// Types for the joined data shapes that screen-level queries return.
// These are not DB tables — they represent the output of Supabase
// relational selects used in specific screens.
// =============================================================================

/**
 * A Guide card as it appears in the Discovery feed.
 * Returned by the Discovery screen's guide listing query.
 */
export type GuideDiscoveryCard = Pick<
  Guide,
  | 'id'
  | 'title'
  | 'description'
  | 'summary'
  | 'hero_media_url'
  | 'primary_location_name'
  | 'difficulty_level'
  | 'stewardship_level'
  | 'instantiation_count'
  | 'total_step_completions'
  | 'created_at'
>;

/**
 * A Phase with its step cards, as returned by the Guide detail screen.
 * Used by both the Sequential swipe view and the Freeform checklist view.
 */
export type PhaseWithSteps = Phase & {
  step_cards: StepCard[];
};

/**
 * A Guide with all of its phases and steps, as returned by the
 * Guide detail screen's full data load.
 */
export type GuideWithPhases = Guide & {
  phases: PhaseWithSteps[];
};

/**
 * A Codex entry joined with its Guide's card data, as displayed
 * in the Codex screen list.
 */
export type CodexEntryWithGuide = CodexEntry & {
  guide: GuideDiscoveryCard;
};

/**
 * A Guild membership joined with the Guild's data, as displayed
 * in the Profile screen's "My Guilds" section.
 */
export type GuildMembership = {
  role_name: string;
  guild: Pick<Guild, 'id' | 'name' | 'handle' | 'banner_url'>;
};

/**
 * A Hearth feed item. Represents either a shared Guide (type: 'idea')
 * or a scheduled Event (type: 'plan') on a Guild's Hearth feed.
 */
export type HearthItem = {
  type: 'idea' | 'plan';
  id: string;
  timestamp: string;
  poster: Pick<Profile, 'full_name'> | null;
  poster_id: string;
  title: string;
  subtitle: string;
  guide_id: string | null;
  image_url: string | null;
  is_pinned?: boolean;
};
