// Avengild Design System - "The Edmonton Royal"
// Version 1.1 - Feb 13, 2026

const edmontonForest = '#375E3F';  // Primary Brand (Safe Green)
const larchValley    = '#386641';  // Secondary Green
const riverNight     = '#394689';  // Dark Mode Background (Indigo)
const burnishedGold  = '#BC8A2F';  // The Guild (Prestige/Value)
const auroraDance    = '#12DEAE';  // Dark Mode Shock (Mint)
const paintbrushRed  = '#BC2F38';  // Alert/Stop
const alpineViolet   = '#702FBC';  // Royal Distinction
const glacialStream  = '#65A1DA';  // Information/Water
const badlandsDusk   = '#5E3754';  // Warm Neutral/Shadow
const tundraLichen   = '#A9E1A1';  // Success/Growth
const mistWhite      = '#F5F7FA';  // Light Mode Background

export default {
  light: {
    text: '#1a1a1a',           // Near-black for readability
    background: mistWhite,     // Soft mist white
    tint: edmontonForest,      // Active Tabs use the Forest Green
    tabIconDefault: '#ccc',
    tabIconSelected: edmontonForest,
  },
  dark: {
    text: '#fff',
    background: riverNight,    // Deep Indigo River background
    tint: auroraDance,         // Active Tabs GLOW with Aurora Mint
    tabIconDefault: '#6b7280', // Greyed out icons
    tabIconSelected: auroraDance,
  },
};