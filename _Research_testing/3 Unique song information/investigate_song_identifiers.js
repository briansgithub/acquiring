/**
 * Investigate unique song identifiers from Hooktheory pages
 * 
 * Questions:
 * 1. Is a song ID ever identified from the loaded URL webpage?
 * 2. Is there unique identifier information unique to the song (ID number, song title, artist, etc.)?
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag';
const OUTPUT_FILE = path.join(__dirname, 'song_identifier_analysis.json');

async function investigateSongIdentifiers() {
  console.log('Launching browser to investigate song identifiers...');
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
    
    // 1. Capture ALL network requests (not just song API calls)
    const allNetworkRequests = [];
    const apiResponses = [];
    const capturedSongIds = new Set();
    
    page.on('request', (request) => {
      allNetworkRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      });
    });
    
    page.on('response', async (response) => {
      const responseUrl = response.url();
      
      // Capture song API responses
      if (responseUrl.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = responseUrl.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match) {
          capturedSongIds.add(match[1]);
          
          try {
            const responseData = await response.json();
            apiResponses.push({
              songId: match[1],
              url: responseUrl,
              data: responseData
            });
          } catch (e) {
            console.log(`  ⚠ Could not parse response for ${match[1]}`);
          }
        }
      }
      
      // Capture any other API calls that might contain song metadata
      if (responseUrl.includes('api.hooktheory.com') && !responseUrl.includes('/songs/public/')) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const responseData = await response.json();
            allNetworkRequests.push({
              url: responseUrl,
              type: 'other_api',
              data: responseData
            });
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    });
    
    // 2. Navigate to the page
    console.log(`Navigating to: ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 3. Extract page HTML metadata
    console.log('Extracting page metadata...');
    const pageMetadata = await page.evaluate(() => {
      const metadata = {
        title: document.title,
        metaTags: {},
        jsonLd: [],
        scriptTags: [],
        dataAttributes: {},
        urlStructure: {}
      };
      
      // Extract meta tags
      document.querySelectorAll('meta').forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('itemprop');
        const content = meta.getAttribute('content');
        if (name && content) {
          metadata.metaTags[name] = content;
        }
      });
      
      // Extract JSON-LD structured data
      document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        try {
          metadata.jsonLd.push(JSON.parse(script.textContent));
        } catch (e) {
          // Ignore parse errors
        }
      });
      
      // Extract script tags that might contain song data
      document.querySelectorAll('script').forEach(script => {
        const src = script.getAttribute('src');
        const type = script.getAttribute('type');
        const content = script.textContent;
        
        if (src) {
          metadata.scriptTags.push({ src, type });
        } else if (content && (content.includes('song') || content.includes('artist') || content.includes('theorytab'))) {
          // Look for inline scripts with song-related data
          try {
            // Try to find JSON objects in script content
            const jsonMatch = content.match(/\{[\s\S]*"song"[\s\S]*\}/);
            if (jsonMatch) {
              try {
                metadata.scriptTags.push({ type: 'inline', data: JSON.parse(jsonMatch[0]) });
              } catch (e) {
                metadata.scriptTags.push({ type: 'inline', raw: jsonMatch[0].substring(0, 500) });
              }
            }
          } catch (e) {
            // Ignore
          }
        }
      });
      
      // Extract data attributes from body/main containers
      const body = document.body;
      if (body) {
        Array.from(body.attributes).forEach(attr => {
          if (attr.name.startsWith('data-')) {
            metadata.dataAttributes[attr.name] = attr.value;
          }
        });
      }
      
      // Extract URL structure info
      const urlParts = window.location.pathname.split('/').filter(p => p);
      metadata.urlStructure = {
        pathname: window.location.pathname,
        parts: urlParts,
        artist: urlParts[urlParts.length - 2] || null,
        song: urlParts[urlParts.length - 1] || null
      };
      
      return metadata;
    });
    
    results.findings.pageMetadata = pageMetadata;
    
    // 4. Scroll to trigger all section loads
    console.log('Scrolling to trigger all section loads...');
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    
    // Scroll down slowly
    for (let y = 0; y < pageHeight; y += viewportHeight / 2) {
      await page.evaluate((scrollY) => {
        window.scrollTo(0, scrollY);
      }, y);
      await new Promise(resolve => setTimeout(resolve, 1000));
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
    
    // 5. Analyze API responses for common song-level data
    console.log(`\nAnalyzing ${apiResponses.length} API responses...`);
    const songLevelData = {
      commonFields: {},
      uniqueFields: {},
      allSongIds: Array.from(capturedSongIds),
      apiResponseAnalysis: []
    };
    
    // Extract common fields across all responses
    if (apiResponses.length > 0) {
      const firstResponse = apiResponses[0].data;
      const allKeys = new Set();
      
      // Collect all keys from all responses
      apiResponses.forEach(resp => {
        Object.keys(resp.data).forEach(key => allKeys.add(key));
      });
      
      // Check which fields are common across all responses
      allKeys.forEach(key => {
        const values = apiResponses.map(r => r.data[key]).filter(v => v !== undefined);
        const uniqueValues = [...new Set(values.map(v => JSON.stringify(v)))];
        
        if (uniqueValues.length === 1) {
          // Same value across all responses - likely song-level data
          songLevelData.commonFields[key] = {
            value: apiResponses[0].data[key],
            consistent: true,
            count: values.length
          };
        } else {
          // Different values - likely section-specific
          songLevelData.uniqueFields[key] = {
            values: uniqueValues.map(v => JSON.parse(v)),
            count: uniqueValues.length
          };
        }
      });
      
      // Detailed analysis of each response
      apiResponses.forEach(resp => {
        songLevelData.apiResponseAnalysis.push({
          songId: resp.songId,
          url: resp.url,
          topLevelFields: Object.keys(resp.data),
          songField: resp.data.song || null,
          idField: resp.data.ID || null,
          hasJsonData: !!resp.data.jsonData
        });
      });
    }
    
    results.findings.songLevelData = songLevelData;
    results.findings.networkRequests = {
      total: allNetworkRequests.length,
      songApiCalls: apiResponses.length,
      otherApiCalls: allNetworkRequests.filter(r => r.type === 'other_api').length
    };
    
    // 6. Check for song ID in page source/HTML
    console.log('Checking page source for song identifiers...');
    const pageContent = await page.content();
    const sourceAnalysis = {
      containsSongIds: [],
      containsArtist: false,
      containsSongTitle: false,
      urlPatterns: []
    };
    
    // Search for song IDs in page source
    capturedSongIds.forEach(id => {
      if (pageContent.includes(id)) {
        sourceAnalysis.containsSongIds.push(id);
      }
    });
    
    // Search for artist/song from URL
    const urlArtist = pageMetadata.urlStructure.artist;
    const urlSong = pageMetadata.urlStructure.song;
    if (urlArtist && pageContent.includes(urlArtist)) {
      sourceAnalysis.containsArtist = true;
    }
    if (urlSong && pageContent.includes(urlSong)) {
      sourceAnalysis.containsSongTitle = true;
    }
    
    // Look for URL patterns that might indicate song IDs
    const urlPatterns = pageContent.match(/https?:\/\/[^"'\s]*hooktheory[^"'\s]*/g) || [];
    sourceAnalysis.urlPatterns = [...new Set(urlPatterns)].slice(0, 20);
    
    results.findings.sourceAnalysis = sourceAnalysis;
    
    // 7. Summary
    console.log('\n' + '='.repeat(60));
    console.log('INVESTIGATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`\nSong IDs found: ${songLevelData.allSongIds.length}`);
    console.log(`  ${songLevelData.allSongIds.join(', ')}`);
    
    console.log(`\nCommon fields across all API responses (likely song-level):`);
    Object.keys(songLevelData.commonFields).forEach(key => {
      const field = songLevelData.commonFields[key];
      console.log(`  - ${key}: ${JSON.stringify(field.value)}`);
    });
    
    console.log(`\nUnique fields (vary by section):`);
    Object.keys(songLevelData.uniqueFields).slice(0, 5).forEach(key => {
      console.log(`  - ${key}: ${songLevelData.uniqueFields[key].count} unique values`);
    });
    
    console.log(`\nPage metadata:`);
    console.log(`  - Title: ${pageMetadata.title}`);
    console.log(`  - URL Artist: ${pageMetadata.urlStructure.artist}`);
    console.log(`  - URL Song: ${pageMetadata.urlStructure.song}`);
    console.log(`  - Meta tags: ${Object.keys(pageMetadata.metaTags).length} found`);
    console.log(`  - JSON-LD: ${pageMetadata.jsonLd.length} found`);
    
    console.log(`\nSong IDs in page source: ${sourceAnalysis.containsSongIds.length}`);
    if (sourceAnalysis.containsSongIds.length > 0) {
      console.log(`  ${sourceAnalysis.containsSongIds.join(', ')}`);
    }
    
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
  investigateSongIdentifiers()
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

module.exports = { investigateSongIdentifiers };

