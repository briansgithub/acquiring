/**
 * Debug test script to identify why section name extraction is failing
 * Tests multiple URLs with different section combinations
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEST_URLS = [
  {
    url: 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag',
    expectedSections: ['Intro', 'Chorus', 'Bridge', 'Outro'],
    description: 'Contains Intro, Chorus, Bridge, Outro sections'
  },
  {
    url: 'https://www.hooktheory.com/theorytab/view/the-proclaimers/500-miles',
    expectedSections: ['Verse', 'Chorus'],
    description: 'Contains Verse, Chorus sections'
  },
  {
    url: 'https://www.hooktheory.com/theorytab/view/the-beatles/let-it-be',
    expectedSections: ['Verse', 'Chorus', 'Bridge'],
    description: 'Contains Verse, Chorus, Bridge sections'
  },
  {
    url: 'https://www.hooktheory.com/theorytab/view/fun/we-are-young',
    expectedSections: ['Verse', 'Pre-chorus', 'Chorus'],
    description: 'Contains Verse, Pre-chorus, Chorus sections'
  }
];

const OUTPUT_FILE = path.join(__dirname, 'section_extraction_test_results.json');

function extractSectionNameFromH2(h2Text) {
  // Extract the actual section name from H2 text
  // H2 text might be just the section name, or might have additional text
  const trimmed = h2Text.trim();
  
  // Common patterns:
  // - "Intro"
  // - "Verse"
  // - "Chorus"
  // - "Pre-chorus" or "Pre-Chorus"
  // - "Bridge"
  // - "Outro"
  // - Or any other section name
  
  // Return the trimmed text as-is (it's the actual section name)
  return trimmed;
}

async function testSectionExtraction(testUrl) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${testUrl.url}`);
  console.log(`Expected: ${testUrl.description}`);
  console.log('='.repeat(80));
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const result = {
      url: testUrl.url,
      expectedSections: testUrl.expectedSections,
      timestamp: new Date().toISOString(),
      findings: {}
    };
    
    const allCapturedSongIds = [];
    const songIdCaptureTimes = [];
    
    // Monitor network requests
    page.on('response', async (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = responseUrl.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const songId = match[1];
          if (!allCapturedSongIds.includes(songId)) {
            allCapturedSongIds.push(songId);
            songIdCaptureTimes.push({
              songId: songId,
              timestamp: new Date().toISOString(),
              url: responseUrl
            });
          }
        }
      }
    });
    
    // Navigate and wait for initial load
    console.log('Navigating to page...');
    await page.goto(testUrl.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const initialSongIds = [...allCapturedSongIds];
    console.log(`Initial load: ${initialSongIds.length} song ID(s): ${initialSongIds.join(', ')}`);
    
    // Find ALL H2 elements (not just known section names)
    console.log('\nFinding H2 elements...');
    const h2Elements = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      return h2s.map((h2, index) => {
        const text = h2.textContent.trim();
        const rect = h2.getBoundingClientRect();
        return {
          index: index,
          text: text,
          y: rect.y,
          height: rect.height,
          visible: rect.height > 0 && rect.width > 0
        };
      }).filter(h2 => h2.visible).sort((a, b) => a.y - b.y);
    });
    
    console.log(`Found ${h2Elements.length} H2 elements:`);
    h2Elements.forEach((h2, i) => {
      console.log(`  ${i + 1}. "${h2.text}" (y: ${h2.y})`);
    });
    
    result.findings.h2Elements = h2Elements;
    result.findings.initialSongIds = initialSongIds;
    
    // Extract section names from H2 elements
    // Section names are H2 elements that appear to be section titles
    // We need to identify which H2s are section titles vs other headings
    const sectionH2s = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      const sections = [];
      
      // Look for H2s that are likely section titles
      // They're usually standalone and appear before section content
      h2s.forEach((h2, index) => {
        const text = h2.textContent.trim();
        const rect = h2.getBoundingClientRect();
        
        // Check if this H2 looks like a section title
        // Section titles are usually:
        // - Short text (not long descriptions)
        // - Not part of other content blocks
        // - Often followed by section content
        
        // For now, include all H2s that are visible and not empty
        if (rect.height > 0 && text.length > 0 && text.length < 50) {
          // Check if it's likely a section title (not a page heading)
          const parent = h2.parentElement;
          const isLikelySection = 
            text.length < 30 && // Short text
            !text.includes('by ') && // Not "Song by Artist"
            !text.toLowerCase().includes('chords and melody'); // Not main page heading
          
          if (isLikelySection) {
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
    
    console.log(`\nIdentified ${sectionH2s.length} section H2 elements:`);
    sectionH2s.forEach((sec, i) => {
      console.log(`  ${i + 1}. "${sec.text}"`);
    });
    
    result.findings.sectionH2s = sectionH2s;
    
    // Scroll to each section H2 and track song ID loading
    console.log('\nScrolling to each section H2...');
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const sectionMappings = [];
    
    for (let i = 0; i < sectionH2s.length; i++) {
      const h2Section = sectionH2s[i];
      const sectionName = extractSectionNameFromH2(h2Section.text);
      
      const beforeCount = allCapturedSongIds.length;
      
      // Scroll to center the H2
      await page.evaluate((targetY, vh) => {
        const scrollY = targetY - (vh / 2);
        window.scrollTo({
          top: Math.max(0, scrollY),
          behavior: 'smooth'
        });
      }, h2Section.y, viewportHeight);
      
      // Wait for lazy loading
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check new song IDs
      const newSongIds = allCapturedSongIds.slice(beforeCount);
      
      sectionMappings.push({
        sectionName: sectionName,
        h2Text: h2Section.text,
        h2Index: h2Section.index,
        newSongIds: newSongIds,
        newSongIdCount: newSongIds.length
      });
      
      if (newSongIds.length > 0) {
        console.log(`  ✓ ${sectionName}: Loaded ${newSongIds.length} song ID(s): ${newSongIds.join(', ')}`);
      } else {
        console.log(`  - ${sectionName}: No new song IDs`);
      }
    }
    
    // Also do a full page scroll to catch any remaining sections
    console.log('\nDoing full page scroll to catch remaining sections...');
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < pageHeight; y += viewportHeight / 2) {
      await page.evaluate((scrollY) => {
        window.scrollTo(0, scrollY);
      }, y);
      await new Promise(resolve => setTimeout(resolve, 500));
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
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    result.findings.sectionMappings = sectionMappings;
    result.findings.allSongIds = [...new Set(allCapturedSongIds)];
    result.findings.songIdCaptureTimes = songIdCaptureTimes;
    
    // Analysis
    const extractedSectionNames = sectionH2s.map(h2 => extractSectionNameFromH2(h2.text));
    const missingSections = testUrl.expectedSections.filter(sec => 
      !extractedSectionNames.some(extracted => 
        extracted.toLowerCase() === sec.toLowerCase() ||
        extracted.toLowerCase().includes(sec.toLowerCase()) ||
        sec.toLowerCase().includes(extracted.toLowerCase())
      )
    );
    
    const extraSections = extractedSectionNames.filter(extracted =>
      !testUrl.expectedSections.some(expected =>
        extracted.toLowerCase() === expected.toLowerCase() ||
        extracted.toLowerCase().includes(expected.toLowerCase()) ||
        expected.toLowerCase().includes(extracted.toLowerCase())
      )
    );
    
    result.analysis = {
      extractedSectionNames: extractedSectionNames,
      expectedSections: testUrl.expectedSections,
      missingSections: missingSections,
      extraSections: extraSections,
      totalSongIds: result.findings.allSongIds.length,
      sectionsWithSongIds: sectionMappings.filter(m => m.newSongIds.length > 0).length
    };
    
    console.log('\n' + '-'.repeat(80));
    console.log('ANALYSIS:');
    console.log(`  Extracted sections: ${extractedSectionNames.join(', ')}`);
    console.log(`  Expected sections: ${testUrl.expectedSections.join(', ')}`);
    if (missingSections.length > 0) {
      console.log(`  ⚠ Missing sections: ${missingSections.join(', ')}`);
    }
    if (extraSections.length > 0) {
      console.log(`  ℹ Extra sections found: ${extraSections.join(', ')}`);
    }
    console.log(`  Total song IDs captured: ${result.findings.allSongIds.length}`);
    console.log(`  Sections with song IDs: ${result.analysis.sectionsWithSongIds}`);
    
    await browser.close();
    return result;
  } catch (e) {
    await browser.close();
    throw e;
  }
}

async function runAllTests() {
  console.log('Starting section extraction debug tests...');
  console.log(`Testing ${TEST_URLS.length} URLs\n`);
  
  const results = {
    timestamp: new Date().toISOString(),
    testResults: []
  };
  
  for (const testUrl of TEST_URLS) {
    try {
      const result = await testSectionExtraction(testUrl);
      results.testResults.push(result);
    } catch (error) {
      console.error(`\n✗ Error testing ${testUrl.url}:`, error.message);
      results.testResults.push({
        url: testUrl.url,
        error: error.message,
        stack: error.stack
      });
    }
  }
  
  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n${'='.repeat(80)}`);
  console.log('ALL TESTS COMPLETE');
  console.log('='.repeat(80));
  console.log(`\nResults saved to: ${OUTPUT_FILE}`);
  
  // Summary
  console.log('\nSUMMARY:');
  results.testResults.forEach((result, i) => {
    if (result.error) {
      console.log(`  ${i + 1}. ${result.url}: ERROR - ${result.error}`);
    } else {
      const analysis = result.analysis;
      const status = analysis.missingSections.length === 0 ? '✓' : '⚠';
      console.log(`  ${status} ${i + 1}. ${result.url}`);
      console.log(`     Sections: ${analysis.extractedSectionNames.join(', ')}`);
      console.log(`     Song IDs: ${analysis.totalSongIds}`);
      if (analysis.missingSections.length > 0) {
        console.log(`     Missing: ${analysis.missingSections.join(', ')}`);
      }
    }
  });
}

// Run tests
if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log('\n✓ All tests complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Fatal error:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { testSectionExtraction, runAllTests };

