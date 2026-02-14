// Avengild Design System - "The Edmonton Royal"
// Version 1.2 - Feb 14, 2026

// --- THE PALETTE ---

// 1. The Whites (New)
const glacierWhite   = '#F0F4F8';  // Cool, technical, crisp (Blue tint)
const limestoneWhite = '#F9F8F4';  // Warm, natural, paper-like (Yellow tint)

// 2. The Greens (Nature)
const edmontonForest = '#375E3F';  // Primary Brand (Safe Green)
const larchValley    = '#386641';  // Secondary Green
const tundraLichen   = '#A9E1A1';  // Success/Growth

// 3. The Night (Dark Mode)
const riverNight     = '#394689';  // Dark Mode Background (Indigo)
const ironworksGrey  = '#2D3748';  // Dark Mode Cards (Cool Slate/Metal) - REPLACES BADLANDS

// 4. The Accents
const burnishedGold  = '#BC8A2F';  // The Guild (Prestige/Value)
const auroraDance    = '#12DEAE';  // Dark Mode Shock (Mint)
const paintbrushRed  = '#BC2F38';  // Alert/Stop
const alpineViolet   = '#702FBC';  // Royal Distinction
const glacialStream  = '#65A1DA';  // Information/Water
const badlandsDusk   = '#5E3754';  // Warm Neutral/Shadow (Retained for accents, not backgrounds)

export default {
  light: {
    text: '#1a1a1a',
    background: glacierWhite,     // Default to the cool, crisp white
    cardBackground: limestoneWhite, // Cards use the warm, natural white
    tint: edmontonForest,
    tabIconDefault: '#ccc',
    tabIconSelected: edmontonForest,
  },
  dark: {
    text: '#fff',
    background: riverNight,       // Deep Indigo
    cardBackground: ironworksGrey,// The new Slate Grey for contrast
    tint: auroraDance,
    tabIconDefault: '#6b7280',
    tabIconSelected: auroraDance,
  },
};