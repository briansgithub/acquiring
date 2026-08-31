/**
 * Improved investigation: Track initial page load song IDs and map to H2 sections in order
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag';
const OUTPUT_FILE = path.join(__dirname, 'section_name_analysis_v2.json');

function normalizeSectionName(text) {
  const lower = text.toLowerCase().trim();
  if (lower.includes('intro')) return 'Intro';
  if (lower.includes('verse')) return 'Verse';
  if (lower.includes('chorus')) return 'Chorus';
  if (lower.includes('bridge')) return 'Bridge';
  if (lower.includes('outro')) return 'Outro';
  return null;
}

async function investigateSectionNamesV2() {
  console.log('Launching browser to investigate H2 section elements (v2)...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const results = {
      url: TEST_URL,
      timestamp: new Date().toISOString(),
      findings: {}
    };
    
    const allCapturedSongIds = [];
    const songIdCaptureOrder = []; // Track order of capture
    
    // Monitor network requests to capture song IDs with order tracking
    page.on('response', async (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = responseUrl.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const songId = match[1];
          if (!allCapturedSongIds.includes(songId)) {
            allCapturedSongIds.push(songId);
            songIdCaptureOrder.push({
              songId: songId,
              timestamp: new Date().toISOString(),
              url: responseUrl
            });
          }
        }
      }
    });
    
    // Navigate to the page and wait for initial load
    console.log(`Navigating to: ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const initialSongIds = [...allCapturedSongIds];
    console.log(`\nInitial page load captured ${initialSongIds.length} song ID(s): ${initialSongIds.join(', ')}`);
    
    // Find all H2 elements that contain section names
    console.log('\nFinding H2 section elements...');
    const h2Sections = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      const sections = [];
      
      h2s.forEach((h2, index) => {
        const text = h2.textContent.trim();
        const rect = h2.getBoundingClientRect();
        const sectionNames = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
        const textLower = text.toLowerCase();
        
        if (sectionNames.some(s => textLower.includes(s))) {
          sections.push({
            index: index,
            text: text,
            textLower: textLower,
            y: rect.y,
            height: rect.height
          });
        }
      });
      
      return sections.sort((a, b) => a.y - b.y);
    });
    
    console.log(`Found ${h2Sections.length} H2 section elements:`);
    h2Sections.forEach((sec, i) => {
      console.log(`  ${i + 1}. "${sec.text}" (y: ${sec.y})`);
    });
    
    results.findings.h2Sections = h2Sections;
    results.findings.initialSongIds = initialSongIds;
    
    // Now scroll to each H2 section one at a time and track which song IDs are loaded
    console.log('\nScrolling to each H2 section to track additional song ID loading...');
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const sectionMappings = [];
    
    for (let i = 0; i < h2Sections.length; i++) {
      const h2Section = h2Sections[i];
      const sectionName = normalizeSectionName(h2Section.text);
      
      if (!sectionName) {
        console.log(`  ⚠ Skipping H2 "${h2Section.text}" - not a recognized section`);
        continue;
      }
      
      const beforeCount = allCapturedSongIds.length;
      
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
      
      // Check which new song IDs were captured
      const newSongIds = allCapturedSongIds.slice(beforeCount);
      
      sectionMappings.push({
        sectionName: sectionName,
        h2Text: h2Section.text,
        h2Index: h2Section.index,
        yPosition: h2Section.y,
        newSongIds: newSongIds,
        newSongIdCount: newSongIds.length
      });
      
      if (newSongIds.length > 0) {
        console.log(`  ✓ ${sectionName}: Loaded ${newSongIds.length} new song ID(s): ${newSongIds.join(', ')}`);
      } else {
        console.log(`  - ${sectionName}: No new song IDs (already loaded)`);
      }
    }
    
    results.findings.sectionMappings = sectionMappings;
    
    // Build final mapping: assign song IDs to sections in order
    console.log('\n' + '='.repeat(60));
    console.log('BUILDING FINAL MAPPING');
    console.log('='.repeat(60));
    
    const finalMapping = {};
    let songIdIndex = 0;
    
    // Strategy: Map song IDs to H2 sections in order
    // 1. Initial song IDs map to first H2 sections
    // 2. New song IDs from scrolling map to the H2 section that triggered them
    
    for (let i = 0; i < h2Sections.length && songIdIndex < allCapturedSongIds.length; i++) {
      const h2Section = h2Sections[i];
      const sectionName = normalizeSectionName(h2Section.text);
      
      if (!sectionName) continue;
      
      // Check if this section triggered any new song IDs
      const mapping = sectionMappings.find(m => m.sectionName === sectionName);
      
      if (mapping && mapping.newSongIds.length > 0) {
        // This section triggered song IDs - use those
        mapping.newSongIds.forEach(songId => {
          finalMapping[songId] = sectionName;
        });
      } else {
        // This section didn't trigger new IDs - assign from initial/remaining IDs
        // Find the next unmapped song ID
        while (songIdIndex < allCapturedSongIds.length && 
               finalMapping[allCapturedSongIds[songIdIndex]]) {
          songIdIndex++;
        }
        
        if (songIdIndex < allCapturedSongIds.length) {
          finalMapping[allCapturedSongIds[songIdIndex]] = sectionName;
          console.log(`  ${allCapturedSongIds[songIdIndex]} -> ${sectionName} (assigned by order)`);
          songIdIndex++;
        }
      }
    }
    
    // Handle any remaining unmapped song IDs
    const unmappedIds = allCapturedSongIds.filter(id => !finalMapping[id]);
    if (unmappedIds.length > 0) {
      console.log(`\n⚠ ${unmappedIds.length} unmapped song ID(s): ${unmappedIds.join(', ')}`);
      // Assign remaining IDs to remaining sections in order
      const usedSections = new Set(Object.values(finalMapping));
      const remainingSections = h2Sections
        .map(sec => normalizeSectionName(sec.text))
        .filter(name => name && !usedSections.has(name));
      
      for (let i = 0; i < unmappedIds.length && i < remainingSections.length; i++) {
        finalMapping[unmappedIds[i]] = remainingSections[i];
        console.log(`  ${unmappedIds[i]} -> ${remainingSections[i]} (fallback assignment)`);
      }
    }
    
    console.log('\nFinal Mapping:');
    Object.entries(finalMapping).forEach(([songId, section]) => {
      console.log(`  ${songId} -> ${section}`);
    });
    
    results.findings.finalMapping = finalMapping;
    results.findings.allSongIds = allCapturedSongIds;
    results.findings.songIdCaptureOrder = songIdCaptureOrder;
    
    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\n✓ Results saved to: ${OUTPUT_FILE}`);
    
    await browser.close();
    
    return results;
  } catch (e) {
    await browser.close();
    throw e;
  }
}

// Run investigation
if (require.main === module) {
  investigateSectionNamesV2()
    .then(() => {
      console.log('\n✓ Investigation complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { investigateSectionNamesV2 };

