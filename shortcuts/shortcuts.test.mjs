import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const shortcutsDirectory = path.dirname(fileURLToPath(import.meta.url));
const launchers = new Map([
  ['0 - MIDI Tools Menu.cmd', 'menu'],
  ['1 - Analyze MIDI.cmd', 'analyze'],
  ['2 - Theory JSON to MIDI.cmd', 'render'],
  ['3 - Start Local API.cmd', 'serve'],
  ['4 - Check Setup.cmd', 'doctor'],
]);

for (const [filename, command] of launchers) {
  test(`${filename} is a portable ${command} launcher`, async () => {
    const source = await readFile(path.join(shortcutsDirectory, filename), 'utf8');

    assert.match(source, /pushd "%~dp0\.\."/i);
    assert.match(
      source,
      new RegExp(`node "tools\\\\midi-tools\\\\index\\.mjs" ${command} %\\*`, 'i'),
    );
    assert.match(source, /set "MIDI_TOOLS_EXIT=%ERRORLEVEL%"/i);
    assert.match(source, /pause >nul/i);
    assert.match(source, /exit \/b %MIDI_TOOLS_EXIT%/i);
  });
}

test('root MIDI_TOOLS.cmd opens the menu and supports drag-and-drop arguments', async () => {
  const source = await readFile(path.join(shortcutsDirectory, '..', 'MIDI_TOOLS.cmd'), 'utf8');
  assert.match(source, /pushd "%~dp0"/i);
  assert.match(source, /node "tools\\midi-tools\\index\.mjs" %\*/i);
  assert.match(source, /exit \/b %MIDI_TOOLS_EXIT%/i);
});
