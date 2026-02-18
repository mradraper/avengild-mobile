// Avengild Design System - "The Edmonton Royal"
// Version 2.0 - Midnight Update

// --- THE PALETTE ---

// 1. The Whites (Light Mode)
const glacierWhite   = '#F0F4F8';  // Cool, technical, crisp (Blue tint)
const limestoneWhite = '#F9F8F4';  // Warm, natural, paper-like (Yellow tint)

// 2. The Greens (Nature)
const edmontonForest = '#375E3F';  // Primary Brand (Safe Green)
const larchValley    = '#386641';  // Secondary Green
const tundraLichen   = '#A9E1A1';  // Success/Growth

// 3. The Night (Dark Mode - UPDATED)
const midnightRoyal  = '#080A12';  // Almost black, deep cool undertone
const obsidianCard   = '#121620';  // Slightly lighter night for surfaces

// 4. The Accents
const burnishedGold  = '#BC8A2F';  // Primary Dark Mode Accent
const mutedGold      = '#786C50';  // Replaces "Grey" for inactive items
const auroraDance    = '#12DEAE';  // Shock Green (Use for specific success states)
const paintbrushRed  = '#BC2F38';  // Alert/Stop

export default {
  light: {
    text: '#1a1a1a',
    background: glacierWhite,
    cardBackground: limestoneWhite,
    tint: edmontonForest,
    tabIconDefault: '#ccc',
    tabIconSelected: edmontonForest,
  },
  dark: {
    text: '#EAEAEA',             // Soft white for readability
    background: midnightRoyal,   // The new deep, royal black
    cardBackground: obsidianCard,// Floating dark surfaces
    tint: burnishedGold,         // Active items are now Gold
    tabIconDefault: mutedGold,   // Inactive items are Antique Gold (No more grey!)
    tabIconSelected: burnishedGold,
  },
};