/**
 * URL parsing utilities for Hooktheory URLs
 * Extracts artist, song, and section information from URLs and page elements
 */

function extractArtistAndSongFromUrl(url) {
  const match = url.match(/theorytab\/view\/([^\/]+)\/([^\/\?]+)/);
  if (!match) {
    throw new Error('Invalid Hooktheory URL format');
  }
  return { artist: match[1], songSlug: match[2] };
}

function extractSongIdFromUrl(url) {
  // URL format: https://www.hooktheory.com/theorytab/view/artist/song
  // We need to find the song ID from the page or API
  // For now, we'll need to fetch the page first to get the song ID
  const match = url.match(/theorytab\/view\/([^\/]+)\/([^\/\?]+)/);
  if (!match) {
    throw new Error('Invalid Hooktheory URL format');
  }
  return { artist: match[1], song: match[2] };
}

function extractSectionNameFromH2(h2Text) {
  // Extract the actual section name from H2 text
  // Use the H2 text as-is (preserves case, hyphens, etc.)
  // H2 text is the authoritative section name
  return h2Text.trim();
}

function isSectionH2(h2Text) {
  // Check if an H2 is likely a section title
  // Section titles are usually short and not page headings
  const text = h2Text.trim();
  return text.length > 0 && 
         text.length < 50 && 
         !text.includes('by ') && 
         !text.toLowerCase().includes('chords and melody');
}

module.exports = {
  extractArtistAndSongFromUrl,
  extractSongIdFromUrl,
  extractSectionNameFromH2,
  isSectionH2
};

