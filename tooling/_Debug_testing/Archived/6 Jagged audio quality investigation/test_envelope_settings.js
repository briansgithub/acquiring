// Test script to compare different envelope settings
// Run in browser console while player is loaded

const testEnvelopes = [
  { name: "Current", attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
  { name: "Smooth", attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.5 },
  { name: "Very Smooth", attack: 0.1, decay: 0.3, sustain: 0.8, release: 0.8 },
  { name: "Piano-like", attack: 0.01, decay: 0.5, sustain: 0.3, release: 0.5 },
];

console.log("Envelope test configurations:", testEnvelopes);
console.log("Current settings are very short (attack: 0.01s, release: 0.3s)");
console.log("Short attack/release can cause clicks and pops in audio");

