/**
 * Page scraping using Puppeteer
 * Extracts song IDs and section mappings from Hooktheory pages
 */

const puppeteer = require('puppeteer');
const { extractSectionNameFromH2 } = require('../parser/urlParser');

async function findAllSongIdsFromPage(url) {
  console.log('Launching browser to extract all section song IDs...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const allCapturedSongIds = [];
    
    // Monitor network requests to capture ALL song IDs from API calls
    page.on('response', async (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = responseUrl.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const songId = match[1];
          if (!allCapturedSongIds.includes(songId)) {
            allCapturedSongIds.push(songId);
          }
        }
      }
    });
    
    // Navigate to the page and wait for initial load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const initialSongIds = [...allCapturedSongIds];
    console.log(`Initial page load captured ${initialSongIds.length} song ID(s): ${initialSongIds.join(', ')}`);
    
    // Get container info and find all H2 sections within col-md-8 container
    console.log('Finding container and H2 section elements...');
    const containerInfo = await page.evaluate(() => {
      const container = document.querySelector('div.col-md-8');
      if (!container) {
        return { found: false };
      }
      
      // Get container's position on the page
      const containerRect = container.getBoundingClientRect();
      const containerTop = containerRect.top + window.pageYOffset;
      
      // Find all H2s within the container
      const h2s = Array.from(container.querySelectorAll('h2'));
      const sections = [];
      
      h2s.forEach((h2) => {
        const text = h2.textContent.trim();
        const rect = h2.getBoundingClientRect();
        
        // Include all visible H2s that look like section titles
        if (rect.height > 0 && text.length > 0 && text.length < 50) {
          // Filter out page headings
          const isPageHeading = text.includes('by ') || 
                                text.toLowerCase().includes('chords and melody');
          
          if (!isPageHeading) {
            const h2Y = rect.top + window.pageYOffset;
            sections.push({
              text: text,
              pageY: h2Y
            });
          }
        }
      });
      
      // Scroll through the entire container
      const containerBottom = containerTop + containerRect.height;
      
      return {
        found: true,
        containerTop: containerTop,
        containerBottom: containerBottom,
        viewportHeight: window.innerHeight,
        h2Sections: sections.sort((a, b) => a.pageY - b.pageY)
      };
    });
    
    if (!containerInfo.found) {
      throw new Error('col-md-8 container not found on page');
    }
    
    const h2Sections = containerInfo.h2Sections;
    console.log(`Found ${h2Sections.length} H2 section elements within container:`);
    h2Sections.forEach((sec, i) => {
      console.log(`  ${i + 1}. "${sec.text}"`);
    });
    
    if (h2Sections.length === 0) {
      throw new Error('No H2 section elements found in container');
    }
    
    // Scroll through the entire container area to trigger lazy loading
    const scrollRange = containerInfo.containerBottom - containerInfo.containerTop;
    console.log(`\nScrolling through entire col-md-8 container (${containerInfo.containerTop}px to ${containerInfo.containerBottom}px, range: ${scrollRange}px)...`);
    
    // Smaller increment and longer delay for more thorough detection
    const scrollIncrement = containerInfo.viewportHeight * 0.5; // 50% overlap for better coverage
    const scrollDelay = 400; // Slower to ensure all sections load
    
    for (let pageY = containerInfo.containerTop; pageY < containerInfo.containerBottom; pageY += scrollIncrement) {
      // Scroll the page to show the container area
      await page.evaluate((scrollY) => {
        window.scrollTo({ top: scrollY, behavior: 'smooth' });
      }, pageY);
      
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
    }
    
    // Final wait for any remaining requests
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await browser.close();
    
    const songIds = [...new Set(allCapturedSongIds)];
    console.log(`\n✓ Captured ${songIds.length} unique song IDs: ${songIds.join(', ')}`);
    
    if (songIds.length === 0) {
      throw new Error('Could not find any song IDs in page');
    }
    
    // Build section mapping: map IDs to sections based on order of first appearance
    const sectionMapping = {};
    const h2SectionNames = h2Sections.map(sec => extractSectionNameFromH2(sec.text));
    
    // Track order of first appearance: use the order in allCapturedSongIds (maintains insertion order)
    const firstAppearanceOrder = [];
    const seenInOrder = new Set();
    for (const id of allCapturedSongIds) {
      if (!seenInOrder.has(id)) {
        firstAppearanceOrder.push(id);
        seenInOrder.add(id);
      }
    }
    
    // Map IDs to H2 sections in order of first appearance (1:1 mapping)
    for (let i = 0; i < Math.min(firstAppearanceOrder.length, h2SectionNames.length); i++) {
      sectionMapping[firstAppearanceOrder[i]] = h2SectionNames[i];
    }
    
    // If we have more IDs than sections, assign remaining to last section
    if (firstAppearanceOrder.length > h2SectionNames.length) {
      for (let i = h2SectionNames.length; i < firstAppearanceOrder.length; i++) {
        sectionMapping[firstAppearanceOrder[i]] = h2SectionNames[h2SectionNames.length - 1];
      }
    }
    
    console.log('\nSection Mapping:');
    Object.entries(sectionMapping).forEach(([songId, section]) => {
      console.log(`  ${songId} -> ${section}`);
    });
    
    return {
      songIds: songIds,
      sectionMapping: sectionMapping
    };
  } catch (e) {
    await browser.close();
    throw new Error(`Failed to extract song IDs: ${e.message}`);
  }
}

module.exports = {
  findAllSongIdsFromPage
};

