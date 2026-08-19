# MIDI Tools shortcuts

These Windows shortcuts run the MIDI pipeline without requiring you to type commands.
They work from any location because each launcher automatically switches to the
`diatonic_ring` repository folder first.

## Before the first run

Double-click **`4 - Check Setup.cmd`**. It checks Node.js, project dependencies,
the catalog database, and the configured MIDI data folder, and explains how to fix
anything that is missing.

## What to open

- **`0 - MIDI Tools Menu.cmd`** — open an interactive menu for the common tasks.
- **`1 - Analyze MIDI.cmd`** — enter a `.mid` or `.midi` file and create its
  Hooktheory-compatible analysis JSON.
- **`2 - Theory JSON to MIDI.cmd`** — enter a Hooktheory section `.json` file and
  render it as MIDI.
- **`3 - Start Local API.cmd`** — run the local MIDI analysis service. Leave its
  window open while using the API; press `Ctrl+C` to stop it.
- **`4 - Check Setup.cmd`** — diagnose the local setup without changing data.

## Drag and drop

For the quickest workflow, drag a file from File Explorer and drop it directly on
the matching launcher:

- Drop a `.mid` or `.midi` file on **`1 - Analyze MIDI.cmd`**.
- Drop a section `.json` file on **`2 - Theory JSON to MIDI.cmd`**.

Windows passes the full file path to the tool, including paths containing spaces.
If you start a launcher without dropping a file, the tool prompts you to enter or
paste one. Output locations and any optional settings are shown before processing.

You can also use these launchers from Command Prompt or PowerShell and append the
same options accepted by the underlying command. Put paths containing spaces in
quotes. For example:

```powershell
& '.\shortcuts\1 - Analyze MIDI.cmd' 'C:\Music\Example Song.mid' --top-k 5
```

If a tool fails, its window stays open so you can read the error. Successful
one-shot tasks close normally; the API stays open until you stop it.
