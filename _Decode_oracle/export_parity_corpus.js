const fs = require('fs');
const path = require('path');

async function exportCorpus() {
  const libUrl = (p) => require('url').pathToFileURL(path.join(__dirname, '..', 'web-player', 'lib', p)).href;
  const sym = await import(libUrl('jsonToSymbol.js'));
  const music = await import(libUrl('music.js'));

  const testCases = [
    // 1. Basic Triads
    { id: "C Major I", json: { root: 1 }, key: { tonic: "C", scale: "major" } },
    { id: "C Major V", json: { root: 5 }, key: { tonic: "C", scale: "major" } },
    { id: "C Major vi", json: { root: 6 }, key: { tonic: "C", scale: "major" } },
    { id: "C Major IV", json: { root: 4 }, key: { tonic: "C", scale: "major" } },
    { id: "A Minor i", json: { root: 1 }, key: { tonic: "A", scale: "minor" } },
    { id: "A Minor v", json: { root: 5 }, key: { tonic: "A", scale: "minor" } },

    // 2. Sevenths
    { id: "C Major I7", json: { root: 1, type: 7 }, key: { tonic: "C", scale: "major" } },
    { id: "C Major V7", json: { root: 5, type: 7 }, key: { tonic: "C", scale: "major" } },
    { id: "C Major ii7", json: { root: 2, type: 7 }, key: { tonic: "C", scale: "major" } },
    { id: "C Major vii°7", json: { root: 7, type: 7 }, key: { tonic: "C", scale: "major" } },

    // 3. Inversions
    { id: "C Major I6 (inv 1)", json: { root: 1, inversion: 1 }, key: { tonic: "C", scale: "major" } },
    { id: "C Major I64 (inv 2)", json: { root: 1, inversion: 2 }, key: { tonic: "C", scale: "major" } },
    { id: "C Major V42 (inv 3)", json: { root: 5, type: 7, inversion: 3 }, key: { tonic: "C", scale: "major" } },

    // 4. Suspensions & Omits & Adds
    { id: "Isus4", json: { root: 1, suspensions: [4] }, key: { tonic: "C", scale: "major" } },
    { id: "Isus2", json: { root: 1, suspensions: [2] }, key: { tonic: "C", scale: "major" } },
    { id: "I5 (power chord)", json: { root: 1, omits: [3] }, key: { tonic: "C", scale: "major" } },
    { id: "I(add9)", json: { root: 1, adds: [9] }, key: { tonic: "C", scale: "major" } },

    // 5. Extensions (9, 11, 13)
    { id: "V9", json: { root: 5, type: 9 }, key: { tonic: "C", scale: "major" } },
    { id: "V11", json: { root: 5, type: 11 }, key: { tonic: "C", scale: "major" } },
    { id: "V13", json: { root: 5, type: 13 }, key: { tonic: "C", scale: "major" } },

    // 6. Alterations
    { id: "I+(#5)", json: { root: 1, alterations: ["#5"] }, key: { tonic: "C", scale: "major" } },
    { id: "ii7(b5)", json: { root: 2, type: 7, alterations: ["b5"] }, key: { tonic: "C", scale: "major" } },
    { id: "V7(b9)", json: { root: 5, type: 7, alterations: ["b9"] }, key: { tonic: "C", scale: "major" } },

    // 7. Applied / Secondary Dominants
    { id: "V/V", json: { root: 5, applied: 5 }, key: { tonic: "C", scale: "major" } },
    { id: "V7/vi", json: { root: 6, applied: 5, type: 7 }, key: { tonic: "C", scale: "major" } },
    { id: "vii°7/V", json: { root: 5, applied: 7, type: 7 }, key: { tonic: "C", scale: "major" } },
    { id: "V7/vi(maj)", json: { root: 6, applied: 5, type: 7 }, key: { tonic: "C", scale: "minor" } },

    // 8. Borrowed Chords / Modal Mixture
    { id: "iv(min) in C major", json: { root: 4, borrowed: "minor" }, key: { tonic: "C", scale: "major" } },
    { id: "bVI(min) in C major", json: { root: 6, borrowed: "minor" }, key: { tonic: "C", scale: "major" } },
    { id: "bVII(mix) in C major", json: { root: 7, borrowed: "mixolydian" }, key: { tonic: "C", scale: "major" } },
    { id: "V(hmin) in C minor", json: { root: 5, borrowed: "harmonicMinor" }, key: { tonic: "C", scale: "minor" } },
    { id: "bII(phdm) in C major", json: { root: 2, borrowed: "phrygianDominant" }, key: { tonic: "C", scale: "major" } },

    // 9. Figured Bass & Inversions
    { id: "I65", json: { root: 1, type: 7, inversion: 1 }, key: { tonic: "C", scale: "major" } },
    { id: "V43", json: { root: 5, type: 7, inversion: 2 }, key: { tonic: "C", scale: "major" } },
    { id: "ii42", json: { root: 2, type: 7, inversion: 3 }, key: { tonic: "C", scale: "major" } },
    { id: "Isus46", json: { root: 1, type: 5, suspensions: [4], inversion: 1 }, key: { tonic: "C", scale: "major" } },

    // 10. Advanced Composites
    { id: "iiø7(b5)", json: { root: 2, type: 7, alterations: ["b5"] }, key: { tonic: "C", scale: "major" } },
    { id: "V7(b9b13)", json: { root: 5, type: 7, alterations: ["b9", "b13"] }, key: { tonic: "C", scale: "major" } },
    { id: "V7(∆-sub)", json: { root: 5, applied: 5, type: 7, substitutions: ["tri"] }, key: { tonic: "C", scale: "major" } },

    // 11. Advanced Stress Tests (Fix Log 036+)
    { id: "I△9(no3no5)", json: { root: 1, type: 9, omits: [3, 5] }, key: { tonic: "C", scale: "major" } },
    { id: "iø6(b5)5", json: { root: 1, type: 7, inversion: 1, alterations: ["b5"] }, key: { tonic: "C", scale: "locrian" } },
    { id: "III+△7 (HM)", json: { root: 3, type: 7 }, key: { tonic: "C", scale: "harmonicMinor" } },
    { id: "v13 (Minor)", json: { root: 5, type: 13 }, key: { tonic: "C", scale: "minor" } },
    { id: "iiø65 (Minor)", json: { root: 2, type: 7, inversion: 1 }, key: { tonic: "C", scale: "minor" } }
  ];

  const results = [];
  for (const tc of testCases) {
    if (tc.json.type === undefined) tc.json.type = 5; // Default to 5 for parity
    const symbol = sym.getChordSymbol(tc.json, tc.key);
    const letter = sym.getChordLetterName(tc.json, tc.key);
    const interp = music.chordInterpreter(tc.json, tc.key);
    const pcs = interp && interp.notes ? Array.from(new Set(interp.notes.map(n => {
      const name = String(n).replace(/-?\d+$/, '');
      const noteBase = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
      const m = name.match(/^([A-Ga-g])([#bx]*)/);
      if (!m) return 0;
      let pc = noteBase[m[1].toUpperCase()];
      for (const ch of m[2]) {
        if (ch === '#') pc += 1;
        else if (ch === 'x') pc += 2;
        else if (ch === 'b') pc -= 1;
      }
      return ((pc % 12) + 12) % 12;
    }))).sort((a,b) => a-b) : [];

    results.push({
      id: tc.id,
      json: JSON.stringify(tc.json),
      key: tc.key,
      expectedRoman: symbol,
      expectedLetter: letter,
      expectedPcs: pcs
    });
  }

  const targetDir = path.join(__dirname, '..', 'android', 'app', 'src', 'test', 'resources');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const targetPath = path.join(targetDir, 'corpus_parity.json');
  fs.writeFileSync(targetPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Successfully exported ${results.length} benchmark test cases to ${targetPath}`);
}

exportCorpus().catch(console.error);
