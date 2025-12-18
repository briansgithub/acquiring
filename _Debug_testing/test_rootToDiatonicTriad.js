/**
 * Test and Debug file for rootToDiatonicTriad function
 * 
 * This file provides utilities to test and debug the rootToDiatonicTriad function
 * and all its dependencies.
 * 
 * Usage:
 *   node test_rootToDiatonicTriad.js
 * 
 * Or import specific test functions:
 *   const { testSingleChord, testAllCases } = require('./test_rootToDiatonicTriad.js');
 */

import { rootToDiatonicTriad, getNoteLabel, scaleDegreeToSpecificInterval, sdToToneJSNoteName } from '../web-player/lib/music.js';
import { testCases } from './test_cases_rootToDiatonicTriad.js';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Test a single chord configuration
 */
export function testSingleChord(chordRootSD, key, baseOctave, borrowed = null, chordType = 5, inversion = 0) {
  log(`\n${'='.repeat(80)}`, 'cyan');
  log(`Testing: rootToDiatonicTriad(${chordRootSD}, ${JSON.stringify(key)}, ${baseOctave}, ${JSON.stringify(borrowed)}, ${chordType}, ${inversion})`, 'bright');
  log(`${'='.repeat(80)}`, 'cyan');
  
  try {
    const result = rootToDiatonicTriad(chordRootSD, key, baseOctave, borrowed, chordType, inversion);
    
    log(`\n✓ Result:`, 'green');
    log(`  Notes: [${result.notes.join(', ')}]`, 'green');
    log(`  Chord Degrees: [${result.chordDegrees.join(', ')}]`, 'green');
    
    // Additional debugging info
    log(`\nDebug Info:`, 'yellow');
    log(`  Chord Root SD: ${chordRootSD}`, 'yellow');
    log(`  Key: ${key.tonic} ${key.scale}`, 'yellow');
    log(`  Base Octave: ${baseOctave}`, 'yellow');
    log(`  Borrowed: ${JSON.stringify(borrowed)}`, 'yellow');
    log(`  Chord Type: ${chordType === 5 ? 'Triad' : '7th'}`, 'yellow');
    log(`  Inversion: ${inversion}`, 'yellow');
    
    // Test helper functions
    log(`\nHelper Function Results:`, 'magenta');
    const rootNoteLabel = getNoteLabel(chordRootSD, key);
    log(`  getNoteLabel(${chordRootSD}, ${JSON.stringify(key)}) = ${rootNoteLabel}`, 'magenta');
    
    const specificInterval = scaleDegreeToSpecificInterval(chordRootSD, key.scale);
    log(`  scaleDegreeToSpecificInterval(${chordRootSD}, "${key.scale}") = ${specificInterval}`, 'magenta');
    
    const toneJSNote = sdToToneJSNoteName(chordRootSD, 0, key, baseOctave);
    log(`  sdToToneJSNoteName(${chordRootSD}, 0, ${JSON.stringify(key)}, ${baseOctave}) = ${toneJSNote}`, 'magenta');
    
    return { success: true, result };
  } catch (error) {
    log(`\n✗ Error:`, 'red');
    log(`  ${error.message}`, 'red');
    log(`  Stack: ${error.stack}`, 'red');
    return { success: false, error: error.message };
  }
}

/**
 * Test all cases from test_cases_rootToDiatonicTriad.js
 */
export function testAllCases() {
  log(`\n${'='.repeat(80)}`, 'bright');
  log(`Running All Test Cases`, 'bright');
  log(`${'='.repeat(80)}`, 'bright');
  
  let passed = 0;
  let failed = 0;
  const failures = [];
  
  testCases.forEach((testCase, index) => {
    log(`\n[Test ${index + 1}/${testCases.length}] ${testCase.description || 'Unnamed test'}`, 'blue');
    
    const result = testSingleChord(
      testCase.chordRootSD,
      testCase.key,
      testCase.baseOctave,
      testCase.borrowed,
      testCase.chordType,
      testCase.inversion
    );
    
    if (result.success) {
      passed++;
      
      // Check expected results if provided
      if (testCase.expected) {
        const notesMatch = JSON.stringify(result.result.notes) === JSON.stringify(testCase.expected.notes);
        const degreesMatch = JSON.stringify(result.result.chordDegrees) === JSON.stringify(testCase.expected.chordDegrees);
        
        if (notesMatch && degreesMatch) {
          log(`  ✓ Expected results match!`, 'green');
        } else {
          log(`  ⚠ Results don't match expected:`, 'yellow');
          if (!notesMatch) {
            log(`    Expected notes: [${testCase.expected.notes.join(', ')}]`, 'yellow');
            log(`    Got notes: [${result.result.notes.join(', ')}]`, 'yellow');
          }
          if (!degreesMatch) {
            log(`    Expected degrees: [${testCase.expected.chordDegrees.join(', ')}]`, 'yellow');
            log(`    Got degrees: [${result.result.chordDegrees.join(', ')}]`, 'yellow');
          }
        }
      }
    } else {
      failed++;
      failures.push({ testCase, error: result.error });
    }
  });
  
  log(`\n${'='.repeat(80)}`, 'bright');
  log(`Test Summary: ${passed} passed, ${failed} failed`, failed > 0 ? 'red' : 'green');
  log(`${'='.repeat(80)}`, 'bright');
  
  if (failures.length > 0) {
    log(`\nFailures:`, 'red');
    failures.forEach((failure, index) => {
      log(`  ${index + 1}. ${failure.testCase.description || 'Unnamed test'}`, 'red');
      log(`     Error: ${failure.error}`, 'red');
    });
  }
  
  return { passed, failed, failures };
}

/**
 * Test specific scenarios for debugging
 */
export function testSpecificScenarios() {
  log(`\n${'='.repeat(80)}`, 'bright');
  log(`Testing Specific Scenarios`, 'bright');
  log(`${'='.repeat(80)}`, 'bright');
  
  // Test 1: Basic major triad in C major
  log(`\n[Scenario 1] Basic I chord in C major`, 'cyan');
  testSingleChord(1, { tonic: 'C', scale: 'major' }, 3);
  
  // Test 2: Minor chord in minor key
  log(`\n[Scenario 2] i chord in A minor`, 'cyan');
  testSingleChord(1, { tonic: 'A', scale: 'minor' }, 3);
  
  // Test 3: Inversion
  log(`\n[Scenario 3] First inversion of I chord in C major`, 'cyan');
  testSingleChord(1, { tonic: 'C', scale: 'major' }, 3, null, 5, 1);
  
  // Test 4: 7th chord
  log(`\n[Scenario 4] Dominant 7th (V7) in C major`, 'cyan');
  testSingleChord(5, { tonic: 'C', scale: 'major' }, 3, null, 7, 0);
  
  // Test 5: Borrowed chord
  log(`\n[Scenario 5] Borrowed chord from minor`, 'cyan');
  testSingleChord(4, { tonic: 'C', scale: 'major' }, 3, 'minor', 5, 0);
  
  // Test 6: Custom scale
  log(`\n[Scenario 6] Custom scale intervals`, 'cyan');
  testSingleChord(1, { tonic: 'C', scale: 'major' }, 3, [0, 2, 3, 5, 7, 9, 11], 5, 0);
  
  // Test 7: Different keys
  log(`\n[Scenario 7] I chord in F# major`, 'cyan');
  testSingleChord(1, { tonic: 'F#', scale: 'major' }, 3);
  
  // Test 8: Bb key
  log(`\n[Scenario 8] I chord in Bb major`, 'cyan');
  testSingleChord(1, { tonic: 'Bb', scale: 'major' }, 3);
}

/**
 * Interactive test function - allows manual input
 */
export function interactiveTest() {
  log(`\n${'='.repeat(80)}`, 'bright');
  log(`Interactive Test Mode`, 'bright');
  log(`${'='.repeat(80)}`, 'bright');
  log(`\nEnter chord parameters (or 'q' to quit):`, 'yellow');
  log(`Format: chordRootSD key.tonic key.scale baseOctave [borrowed] [chordType] [inversion]`, 'yellow');
  log(`Example: 1 C major 3`, 'yellow');
  log(`Example: 5 C major 3 null 7 0`, 'yellow');
  log(`Example: 4 C major 3 minor 5 0`, 'yellow');
  
  // Note: This would need readline in Node.js or similar input mechanism
  // For now, just provide the function signature
  log(`\nUse testSingleChord() function directly:`, 'cyan');
  log(`  testSingleChord(chordRootSD, key, baseOctave, borrowed, chordType, inversion)`, 'cyan');
}

// Main execution
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Run all test cases by default
    testAllCases();
  } else if (args[0] === '--scenarios') {
    testSpecificScenarios();
  } else if (args[0] === '--interactive') {
    interactiveTest();
  } else if (args[0] === '--single') {
    // Parse arguments for single test
    // Format: --single chordRootSD tonic scale baseOctave [borrowed] [chordType] [inversion]
    if (args.length < 5) {
      log('Usage: --single chordRootSD tonic scale baseOctave [borrowed] [chordType] [inversion]', 'red');
      process.exit(1);
    }
    
    const chordRootSD = parseInt(args[1]);
    const key = { tonic: args[2], scale: args[3] };
    const baseOctave = parseInt(args[4]);
    const borrowed = args[5] === 'null' ? null : (args[5] || null);
    const chordType = args[6] ? parseInt(args[6]) : 5;
    const inversion = args[7] ? parseInt(args[7]) : 0;
    
    testSingleChord(chordRootSD, key, baseOctave, borrowed, chordType, inversion);
  } else {
    log('Usage:', 'yellow');
    log('  node test_rootToDiatonicTriad.js                    # Run all test cases', 'yellow');
    log('  node test_rootToDiatonicTriad.js --scenarios         # Run specific scenarios', 'yellow');
    log('  node test_rootToDiatonicTriad.js --interactive      # Interactive mode', 'yellow');
    log('  node test_rootToDiatonicTriad.js --single <args>     # Test single chord', 'yellow');
  }
}
