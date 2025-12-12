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
    
    // Find H2 section elements (authoritative source for section names)
    console.log('Finding H2 section elements...');
    const h2Sections = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      const sections = [];
      
      h2s.forEach((h2, index) => {
        const text = h2.textContent.trim();
        const rect = h2.getBoundingClientRect();
        
        // Include all visible H2s that look like section titles
        if (rect.height > 0 && text.length > 0 && text.length < 50) {
          // Filter out page headings
          const isPageHeading = text.includes('by ') || 
                                text.toLowerCase().includes('chords and melody');
          
          if (!isPageHeading) {
            sections.push({
              index: index,
              text: text,
              y: rect.y,
              height: rect.height
            });
          }
        }
      });
      
      return sections.sort((a, b) => a.y - b.y);
    });
    
    console.log(`Found ${h2Sections.length} H2 section elements:`);
    h2Sections.forEach((sec, i) => {
      console.log(`  ${i + 1}. "${sec.text}"`);
    });
    
    if (h2Sections.length === 0) {
      throw new Error('No H2 section elements found on page');
    }
    
    // Scroll to each H2 section and track which song IDs appear at each section
    console.log('\nScrolling to each H2 section to trigger lazy loading...');
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const sectionToFirstSeenIds = []; // Track order of first appearance of IDs per section
    const seenIds = new Set(); // Track which IDs we've seen before
    
    for (let i = 0; i < h2Sections.length; i++) {
      const h2Section = h2Sections[i];
      const sectionName = extractSectionNameFromH2(h2Section.text);
      
      const beforeIds = new Set(allCapturedSongIds);
      
      // Scroll to center the H2 in viewport
      await page.evaluate((targetY, vh) => {
        const scrollY = targetY - (vh / 2);
        window.scrollTo({
          top: Math.max(0, scrollY),
          behavior: 'smooth'
        });
      }, h2Section.y, viewportHeight);
      
      // Wait for intersection observer to trigger and API calls to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Find IDs that are new (first time we see them)
      const newIds = allCapturedSongIds.filter(id => !beforeIds.has(id) && !seenIds.has(id));
      newIds.forEach(id => seenIds.add(id));
      
      sectionToFirstSeenIds.push({
        sectionName: sectionName,
        newIds: newIds
      });
      
      if (newIds.length > 0) {
        console.log(`  ✓ ${sectionName}: First seen ${newIds.length} song ID(s): ${newIds.join(', ')}`);
      } else {
        console.log(`  - ${sectionName}: No new song IDs`);
      }
    }
    
    // Do a limited scroll within col-md-8 container, stopping before first h3
    console.log('\nDoing limited scroll within col-md-8 container...');
    const scrollBounds = await page.evaluate(() => {
      const container = document.querySelector('div.col-md-8');
      if (!container) {
        // Fallback to full page if container not found
        return {
          startY: 0,
          endY: document.documentElement.scrollHeight,
          found: false
        };
      }
      
      const containerRect = container.getBoundingClientRect();
      const containerTop = containerRect.top + window.pageYOffset;
      const containerBottom = containerTop + containerRect.height;
      
      // Find first h3 element WITHIN the col-md-8 container
      const firstH3 = container.querySelector('h3');
      let firstH3Y = null;
      
      if (firstH3) {
        const h3Rect = firstH3.getBoundingClientRect();
        firstH3Y = h3Rect.top + window.pageYOffset;
        // Ensure it's within container bounds
        if (firstH3Y < containerTop || firstH3Y > containerBottom) {
          firstH3Y = null;
        }
      }
      
      // If no h3 found within container, scroll to end of container
      const endY = firstH3Y !== null ? firstH3Y : containerBottom;
      
      return {
        startY: containerTop,
        endY: endY,
        found: true
      };
    });
    
    if (scrollBounds.found) {
      const scrollRange = scrollBounds.endY - scrollBounds.startY;
      console.log(`  Scrolling from Y=${scrollBounds.startY} to Y=${scrollBounds.endY} (range: ${scrollRange}px)`);
      
      // Use larger increments (viewport height) and shorter delays for faster scrolling
      const scrollIncrement = viewportHeight * 0.8; // 80% of viewport for overlap
      const scrollDelay = 300; // Reduced from 500ms
      
      for (let y = scrollBounds.startY; y < scrollBounds.endY; y += scrollIncrement) {
        const beforeCount = allCapturedSongIds.length;
        
        await page.evaluate((scrollY) => {
          window.scrollTo({ top: scrollY, behavior: 'smooth' });
        }, y);
        
        await new Promise(resolve => setTimeout(resolve, scrollDelay));
        
        // Optional: Stop early if no new IDs are being captured
        const afterCount = allCapturedSongIds.length;
        if (afterCount === beforeCount && y > scrollBounds.startY + scrollIncrement) {
          console.log(`  No new IDs captured, stopping early at Y=${y}`);
          break;
        }
      }
    } else {
      // Fallback to original behavior if container not found
      console.log('  Container not found, using full page scroll...');
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const scrollIncrement = viewportHeight * 0.8;
      for (let y = 0; y < pageHeight; y += scrollIncrement) {
        await page.evaluate((scrollY) => {
          window.scrollTo({ top: scrollY, behavior: 'smooth' });
        }, y);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // Scroll back to top
    await page.evaluate(() => {
      return new Promise((resolve) => {
        let currentScroll = window.pageYOffset || document.documentElement.scrollTop;
        const scrollStep = 200;
        const delay = 300;
        
        const timer = setInterval(() => {
          currentScroll = Math.max(0, currentScroll - scrollStep);
          window.scrollTo(0, currentScroll);
          
          if (currentScroll <= 0) {
            clearInterval(timer);
            setTimeout(resolve, 1000);
          }
        }, delay);
      });
    });
    
    // Final wait for any remaining requests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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

