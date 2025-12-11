/**
 * Compare all extraction strategies
 * Run all strategies and compare their effectiveness
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const OUTPUT_DIR = path.join(__dirname);

async function runStrategy(scriptName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running ${scriptName}...`);
  console.log('='.repeat(60));
  
  try {
    const { stdout, stderr } = await execAsync(`node ${scriptName}`, {
      cwd: OUTPUT_DIR,
      timeout: 120000 // 2 minute timeout
    });
    
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    
    return { success: true, output: stdout, error: stderr };
  } catch (error) {
    console.error(`Error running ${scriptName}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function loadResults(strategyNumber) {
  const resultsFile = path.join(OUTPUT_DIR, `strategy_${strategyNumber}_results.json`);
  
  if (fs.existsSync(resultsFile)) {
    try {
      return JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function compareStrategies() {
  console.log('='.repeat(60));
  console.log('COMPARING EXTRACTION STRATEGIES');
  console.log('='.repeat(60));
  
  const strategies = [
    { number: 1, name: 'Network Request Monitoring', script: 'strategy_1_network_monitoring.js' },
    { number: 2, name: 'HTML Parsing', script: 'strategy_2_html_parsing.js' },
    { number: 3, name: 'Section Link Clicking', script: 'strategy_3_section_clicking.js' },
    { number: 4, name: 'Intersection Observer Simulation', script: 'strategy_4_intersection_observer.js' }
  ];
  
  const results = {};
  
  // Run each strategy
  for (const strategy of strategies) {
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`STRATEGY ${strategy.number}: ${strategy.name}`);
    console.log('='.repeat(60));
    
    const runResult = await runStrategy(strategy.script);
    results[strategy.number] = {
      name: strategy.name,
      runSuccess: runResult.success,
      runError: runResult.error
    };
    
    // Load results if available
    const data = await loadResults(strategy.number);
    if (data) {
      results[strategy.number].data = {
        sectionsFound: data.capturedSongIds?.length || data.discoveredSections?.length || 0,
        sectionsWithData: Object.keys(data.fullSectionData || {}).length,
        totalChords: Object.values(data.fullSectionData || {}).reduce((sum, s) => sum + (s.chords?.length || 0), 0),
        totalNotes: Object.values(data.fullSectionData || {}).reduce((sum, s) => {
          const notes = s.notes;
          if (Array.isArray(notes)) return sum + notes.length;
          if (typeof notes === 'object' && notes !== null) {
            return sum + Object.values(notes).reduce((nSum, m) => nSum + (Array.isArray(m) ? m.length : 0), 0);
          }
          return sum;
        }, 0),
        songIds: data.capturedSongIds || data.discoveredSections?.map(s => s.hookpadId).filter(Boolean) || []
      };
    }
  }
  
  // Generate comparison report
  console.log('\n\n' + '='.repeat(60));
  console.log('COMPARISON REPORT');
  console.log('='.repeat(60));
  
  const comparison = {
    timestamp: new Date().toISOString(),
    strategies: results,
    bestStrategy: null,
    recommendations: []
  };
  
  let maxSections = 0;
  let bestStrategyNum = null;
  
  for (const [num, result] of Object.entries(results)) {
    if (result.data) {
      console.log(`\nStrategy ${num}: ${result.name}`);
      console.log(`  Sections Found: ${result.data.sectionsFound}`);
      console.log(`  Sections With Data: ${result.data.sectionsWithData}`);
      console.log(`  Total Chords: ${result.data.totalChords}`);
      console.log(`  Total Notes: ${result.data.totalNotes}`);
      console.log(`  Song IDs: ${result.data.songIds.join(', ')}`);
      
      if (result.data.sectionsFound > maxSections) {
        maxSections = result.data.sectionsFound;
        bestStrategyNum = num;
      }
    } else {
      console.log(`\nStrategy ${num}: ${result.name}`);
      console.log(`  Status: ${result.runSuccess ? 'Completed' : 'Failed'}`);
      if (result.runError) {
        console.log(`  Error: ${result.runError}`);
      }
    }
  }
  
  if (bestStrategyNum) {
    comparison.bestStrategy = bestStrategyNum;
    console.log(`\n\n🏆 Best Strategy: Strategy ${bestStrategyNum} (${results[bestStrategyNum].name})`);
    console.log(`   Found ${maxSections} sections`);
    
    // Check if we found all expected sections (4-5)
    if (maxSections >= 4) {
      comparison.recommendations.push('Strategy successfully found all expected sections');
    } else {
      comparison.recommendations.push(`Strategy found ${maxSections} sections, but expected 4-5`);
    }
  }
  
  // Save comparison
  const comparisonFile = path.join(OUTPUT_DIR, 'strategy_comparison.json');
  fs.writeFileSync(comparisonFile, JSON.stringify(comparison, null, 2));
  console.log(`\n✓ Comparison saved to: ${comparisonFile}`);
  
  return comparison;
}

compareStrategies().catch(console.error);

