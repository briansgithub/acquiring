#!/usr/bin/env python3
"""
Extract song data from Hooktheory TheoryTab pages.

Usage:
    python extract_song_data.py <song_url> [output_directory] [--novisual] [--no-open] [--newcache]
    
Examples:
    # Extract with visual labels (default) and automatically open visualization
    python extract_song_data.py https://hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag
    
    # Extract without visual labels (faster, no browser required)
    python extract_song_data.py https://hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag --novisual
    
    # Extract to specific directory without opening browser
    python extract_song_data.py https://hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag ./songs --no-open
    
    # Extract with fresh cache (clears cached files before running)
    python extract_song_data.py https://hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag --newcache
"""

import sys
import re
import json
import os
import requests
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from typing import List, Dict, Optional
import time
import webbrowser
import http.server
import socketserver
import threading

# Add chord_extraction to path to allow imports
sys.path.append(os.path.join(os.path.dirname(__file__), 'chord_extraction'))
try:
    import extract_chords_with_browser
    VISUAL_EXTRACTION_AVAILABLE = True
except ImportError as e:
    # Don't print error here, just mark as unavailable
    # The user might not have installed dependencies
    VISUAL_EXTRACTION_AVAILABLE = False


class HooktheorySongExtractor:
    """Extract song sections and data from Hooktheory TheoryTab pages."""
    
    def __init__(self, song_url: str):
        self.song_url = song_url
        self.base_url = self._extract_base_url(song_url)
        self.sections = []
        self.song_id = None
        self.song_title = None
        self._chord_labels = None  # Store visual chord labels if extracted
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def _extract_base_url(self, url: str) -> str:
        """Extract base URL from song URL."""
        parsed = urlparse(url)
        # Remove fragment if present
        base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        return base.rstrip('/')
    
    def _extract_song_info(self, html: str) -> Dict[str, str]:
        """Extract song ID and title from HTML."""
        song_info = {}
        
        # Try to extract title from <title> tag
        title_match = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
        if title_match:
            title = title_match.group(1)
            # Clean up title (remove " - Hooktheory" suffix if present)
            title = re.sub(r'\s*-\s*Hooktheory.*$', '', title, flags=re.IGNORECASE)
            # Remove "Chords, Melody, and Music Theory Analysis" suffix if present
            title = re.sub(r'\s*Chords,?\s*Melody,?\s*and\s*Music\s*Theory\s*Analysis.*$', '', title, flags=re.IGNORECASE)
            # Extract just the song name (before "by" or "Chords")
            # Pattern: "Song Name by Artist" or "Song Name Chords"
            song_match = re.match(r'^([^b]+?)\s+(?:by\s+[^C]+|Chords)', title, re.IGNORECASE)
            if song_match:
                song_info['title'] = song_match.group(1).strip()
            else:
                song_info['title'] = title.strip()
        
        # Try to extract from meta description
        if 'title' not in song_info:
            meta_match = re.search(r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']+)["\']', html)
            if meta_match:
                desc = meta_match.group(1)
                # Try to extract song name from description
                # Pattern: "Song Name by Artist" or just "Song Name"
                match = re.search(r'^([^,]+?)(?:\s+by\s+[^,]+)?', desc)
                if match:
                    song_info['title'] = match.group(1).strip()
        
        # Extract song ID from JavaScript params (most reliable)
        # Look for params["idOfSong"] = NUMBER;
        id_matches = re.findall(r'params\["idOfSong"\]\s*=\s*(\d+)', html)
        if id_matches:
            # Use the first one (usually the intro)
            song_info['id'] = int(id_matches[0])
        
        return song_info
    
    def parse_sections(self, html: str) -> List[Dict]:
        """
        Parse HTML to find all sections with players.
        
        Looks for the pattern:
        - <a name="..."> anchor
        - <h2> with section title
        - Link containing idOfSong parameter
        - <div id="tab-XXXXX"> player container
        """
        sections = []
        
        # Pattern to find sections: anchor -> h2 title -> idOfSong link -> tab div
        section_pattern = re.compile(
            r'<a\s+name="([^"]+)"[^>]*></a>'  # Anchor with name
            r'[\s\S]*?'  # Non-greedy match anything
            r'<h2[^>]*>([^<]+)</h2>'  # H2 with title
            r'[\s\S]*?'  # Non-greedy match anything
            r'idOfSong=([^"&\s]+)'  # Hookpad ID in URL
            r'[\s\S]*?'  # Non-greedy match anything
            r'<div\s+id="tab-(\d+)"',  # Tab div with numeric ID
            re.IGNORECASE
        )
        
        matches = section_pattern.finditer(html)
        
        for match in matches:
            anchor_name = match.group(1)
            title = match.group(2).strip()
            hookpad_id = match.group(3)
            song_id = int(match.group(4))
            
            sections.append({
                'anchor': anchor_name,
                'title': title,
                'hookpad_id': hookpad_id,
                'song_id': song_id
            })
        
        # Alternative: Parse from JavaScript params if HTML pattern doesn't work
        if not sections:
            sections = self._parse_sections_from_js(html)
        
        return sections
    
    def _parse_sections_from_js(self, html: str) -> List[Dict]:
        """Fallback: Parse sections from JavaScript params objects."""
        sections = []
        
        # Find all pushToPendingTheoryTabs calls
        # Pattern: pushToPendingTheoryTabs("tab-XXXXX", params);
        # Then find the params object with idOfSong
        tab_pattern = re.compile(
            r'pushToPendingTheoryTabs\("tab-(\d+)",\s*params\)',
            re.IGNORECASE
        )
        
        # Find corresponding section titles by looking backwards from each tab
        tab_matches = list(tab_pattern.finditer(html))
        
        for tab_match in tab_matches:
            tab_id = int(tab_match.group(1))
            
            # Look backwards for the section title and anchor
            start_pos = max(0, tab_match.start() - 2000)  # Look back 2000 chars
            context = html[start_pos:tab_match.start()]
            
            # Find anchor name
            anchor_match = re.search(r'<a\s+name="([^"]+)"[^>]*>', context, re.IGNORECASE)
            anchor = anchor_match.group(1) if anchor_match else f"section_{tab_id}"
            
            # Find h2 title
            h2_match = re.search(r'<h2[^>]*>([^<]+)</h2>', context, re.IGNORECASE)
            title = h2_match.group(1).strip() if h2_match else f"Section {tab_id}"
            
            # Find hookpad ID from params
            params_context = html[max(0, tab_match.start() - 500):tab_match.start()]
            hookpad_match = re.search(r'idOfSong["\']?\s*[:=]\s*["\']?([^"\'&,\s]+)', params_context, re.IGNORECASE)
            hookpad_id = hookpad_match.group(1) if hookpad_match else None
            
            # If we can't find hookpad ID, try to get it from the link near the h2
            if not hookpad_id:
                link_match = re.search(r'href=["\'][^"\']*idOfSong=([^"&\s]+)', context, re.IGNORECASE)
                hookpad_id = link_match.group(1) if link_match else None
            
            if hookpad_id:
                sections.append({
                    'anchor': anchor,
                    'title': title,
                    'hookpad_id': hookpad_id,
                    'song_id': tab_id
                })
        
        return sections
    
    def fetch_section_data(self, hookpad_id: str) -> Optional[Dict]:
        """Fetch section data from Hooktheory API."""
        api_url = f"https://api.hooktheory.com/v1/songs/public/{hookpad_id}"
        params = {'fields': 'ID,xmlData,song,jsonData'}
        
        try:
            # Use a reasonable timeout and add connection timeout
            response = self.session.get(api_url, params=params, timeout=(10, 30))
            response.raise_for_status()
            return response.json()
        except requests.Timeout:
            print(f"  ⚠ Timeout fetching data for {hookpad_id}")
            return None
        except requests.RequestException as e:
            print(f"  ⚠ Error fetching data for {hookpad_id}: {e}")
            return None
    
    def extract_all(self, use_visual: bool = True, use_cache: bool = True) -> Dict:
        """Extract all sections and data from the song page."""
        print(f"Fetching page: {self.song_url}")
        
        fetched_visually = False
        
        # Try visual extraction first if enabled and available (default behavior)
        if use_visual and VISUAL_EXTRACTION_AVAILABLE:
            print("Attempting visual extraction using browser...")
            try:
                result = extract_chords_with_browser.fetch_page_and_labels(self.song_url, wait_time=15, use_cache=use_cache, verbose=True)
                if result and result.get('html'):
                    self._html = result['html']
                    self._chord_labels = result.get('labels')
                    fetched_visually = True
                    print("✓ Visual extraction successful")
                    if self._chord_labels:
                        print(f"  Captured labels for {len(self._chord_labels)} sections")
                else:
                    print("⚠ Visual extraction returned no data, falling back to standard request")
            except Exception as e:
                print(f"⚠ Visual extraction failed: {e}")
                print("Falling back to standard request")
        elif use_visual and not VISUAL_EXTRACTION_AVAILABLE:
            print("⚠ Visual extraction enabled but dependencies not available.")
            print("  Install browser automation: pip install playwright && playwright install")
            print("  Or use --novisual flag to skip visual extraction")
            print("Falling back to standard request")
        
        # Fallback to standard request if not fetched visually
        if not fetched_visually:
            # Fetch the HTML page
            try:
                # Use connection timeout (10s) and read timeout (30s)
                response = self.session.get(self.song_url, timeout=(10, 30))
                response.raise_for_status()
                html = response.text
                # Store HTML for later use (avoid duplicate fetch)
                self._html = html
            except requests.Timeout:
                print(f"Error: Timeout while fetching page. The server may be slow or unreachable.")
                sys.exit(1)
            except requests.RequestException as e:
                print(f"Error fetching page: {e}")
                sys.exit(1)
        else:
            # Use the visually fetched HTML
            html = self._html
        
        # Extract song info
        song_info = self._extract_song_info(html)
        self.song_id = song_info.get('id')
        self.song_title = song_info.get('title', 'Unknown Song')
        
        if not self.song_id:
            print("Warning: Could not extract song ID. Using first section ID.")
        
        print(f"\nSong: {self.song_title}")
        if self.song_id:
            print(f"Song ID: {self.song_id}")
        
        # Parse sections
        print("\nParsing sections...")
        self.sections = self.parse_sections(html)
        
        if not self.sections:
            print("No sections found!")
            return {}
        
        print(f"Found {len(self.sections)} sections:")
        for i, section in enumerate(self.sections, 1):
            print(f"  {i}. {section['title']} (ID: {section['song_id']}, Hookpad: {section['hookpad_id']})")
        
        # Fetch data for each section
        print(f"\nFetching section data ({len(self.sections)} sections)...")
        sections_data = {}
        
        for i, section in enumerate(self.sections, 1):
            print(f"  [{i}/{len(self.sections)}] Fetching {section['title']}...", end=' ', flush=True)
            data = self.fetch_section_data(section['hookpad_id'])
            
            if data:
                sections_data[section['song_id']] = {
                    'section_info': section,
                    'data': data
                }
                print("✓")
            else:
                print("✗")
            
            # Be polite to the API - only delay between calls, not after the last one
            if i < len(self.sections):
                time.sleep(0.5)
        
        return {
            'song_info': {
                'title': self.song_title,
                'id': self.song_id,
                'url': self.song_url
            },
            'sections': sections_data
        }
    
    def save_to_folder(self, output_dir: str = None) -> str:
        """Save all extracted data to a folder."""
        if not self.sections:
            print("No sections to save. Run extract_all() first.")
            return None
        
        # Create folder name
        if not self.song_id:
            self.song_id = self.sections[0]['song_id'] if self.sections else 0
        
        # Sanitize folder name and remove "Chords, Melody, and Music Theory Analysis" if present
        clean_title = re.sub(r'\s*Chords,?\s*Melody,?\s*and\s*Music\s*Theory\s*Analysis.*$', '', self.song_title, flags=re.IGNORECASE)
        safe_title = re.sub(r'[<>:"/\\|?*]', '_', clean_title)
        folder_name = f"{self.song_id} - {safe_title}"
        
        if output_dir:
            folder_path = Path(output_dir) / folder_name
        else:
            folder_path = Path(folder_name)
        
        folder_path.mkdir(parents=True, exist_ok=True)
        
        print(f"\nSaving data to: {folder_path}")
        
        # Save sections metadata
        sections_metadata = []
        
        for section in self.sections:
            song_id = section['song_id']
            filename = f"section_{section['anchor']}_{song_id}.json"
            
            sections_metadata.append({
                'anchor': section['anchor'],
                'title': section['title'],
                'hookpad_id': section['hookpad_id'],
                'song_id': song_id,
                'filename': filename
            })
            
            # Save section data if we have it
            if hasattr(self, '_extracted_data') and song_id in self._extracted_data.get('sections', {}):
                section_data = self._extracted_data['sections'][song_id]['data']
                file_path = folder_path / filename
                try:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(section_data, f, indent=2, ensure_ascii=False)
                    print(f"  ✓ Saved: {filename}")
                except (IOError, OSError) as e:
                    print(f"  ✗ Error saving {filename}: {e}")
        
        # Save metadata
        try:
            metadata_path = folder_path / 'sections_metadata.json'
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(sections_metadata, f, indent=2, ensure_ascii=False)
            print(f"  ✓ Saved: sections_metadata.json")
        except (IOError, OSError) as e:
            print(f"  ✗ Error saving sections_metadata.json: {e}")
        
        # Save song info
        try:
            song_info_path = folder_path / 'song_info.json'
            song_info = {
                'title': self.song_title,
                'id': self.song_id,
                'url': self.song_url,
                'sections_count': len(self.sections)
            }
            with open(song_info_path, 'w', encoding='utf-8') as f:
                json.dump(song_info, f, indent=2, ensure_ascii=False)
            print(f"  ✓ Saved: song_info.json")
        except (IOError, OSError) as e:
            print(f"  ✗ Error saving song_info.json: {e}")
        
        # Save visual chord labels if we have them (raw extraction only, no computation)
        if self._chord_labels and VISUAL_EXTRACTION_AVAILABLE:
            try:
                extract_chords_with_browser.save_chord_labels_to_song_folder(str(folder_path), self._chord_labels)
            except Exception as e:
                print(f"  ⚠ Error saving chord labels: {e}")
        
        # Save original HTML (optional, for debugging)
        if hasattr(self, '_html'):
            try:
                html_path = folder_path / 'source.html'
                with open(html_path, 'w', encoding='utf-8') as f:
                    f.write(self._html)
                print(f"  ✓ Saved: source.html")
            except (IOError, OSError) as e:
                print(f"  ✗ Error saving source.html: {e}")
        
        # Copy visualization HTML to the output folder
        try:
            viz_source = Path(__file__).parent / 'visualize_circular_chords.html'
            if viz_source.exists():
                viz_dest = folder_path / 'visualize_circular_chords.html'
                import shutil
                shutil.copy2(viz_source, viz_dest)
                print(f"  ✓ Saved: visualize_circular_chords.html")
        except Exception as e:
            print(f"  ⚠ Could not copy visualizer: {e}")
        
        return str(folder_path)


class ShutdownHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP handler that supports graceful shutdown via /shutdown endpoint."""
    
    def do_GET(self):
        """Handle GET requests, including shutdown endpoint."""
        if self.path == '/shutdown':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'{"status": "shutting down"}')
            # Schedule shutdown in a separate thread to allow response to be sent
            def shutdown_server():
                time.sleep(0.1)  # Small delay to ensure response is sent
                threading.Thread(target=self.server.shutdown, daemon=True).start()
            threading.Thread(target=shutdown_server, daemon=True).start()
        else:
            # Default behavior for all other requests
            super().do_GET()
    
    def log_message(self, format, *args):
        """Suppress default logging for cleaner output."""
        pass


def start_visualization_server(folder_path: str, port: int = 8080):
    """Start a simple HTTP server to serve the visualization."""
    original_dir = os.getcwd()
    try:
        os.chdir(folder_path)
        
        handler = ShutdownHTTPRequestHandler
        httpd = socketserver.TCPServer(("", port), handler)
        httpd.allow_reuse_address = True
        
        # Open browser after a short delay
        def open_browser():
            time.sleep(1)
            webbrowser.open(f'http://localhost:{port}/visualize_circular_chords.html')
        
        browser_thread = threading.Thread(target=open_browser, daemon=True)
        browser_thread.start()
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped.")
            httpd.shutdown()
    finally:
        os.chdir(original_dir)


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    song_url = sys.argv[1]
    
    # Check for flags
    use_visual = '--novisual' not in sys.argv  # Visual extraction is now default
    no_open = '--no-open' in sys.argv
    new_cache = '--newcache' in sys.argv
    
    # Clear cache if --newcache flag is present
    if new_cache and VISUAL_EXTRACTION_AVAILABLE:
        print("\nClearing cache files...")
        try:
            extract_chords_with_browser.clear_cache()
        except Exception as e:
            print(f"  ⚠ Error clearing cache: {e}")
    
    # Get output dir (argument 2 if not a flag)
    output_dir = None
    if len(sys.argv) > 2:
        # Check if argv[2] is not a flag
        if not sys.argv[2].startswith('--'):
            output_dir = sys.argv[2]
    
    # Create extractor
    extractor = HooktheorySongExtractor(song_url)
    
    # Extract all data (HTML is fetched and stored in extract_all)
    # Pass use_cache=False if --newcache was used
    extracted_data = extractor.extract_all(use_visual=use_visual, use_cache=not new_cache)
    extractor._extracted_data = extracted_data
    
    # Save to folder (HTML is already stored in extractor._html from extract_all)
    folder_path = extractor.save_to_folder(output_dir)
    
    if folder_path:
        print(f"\n✓ Extraction complete! Data saved to: {folder_path}")
        
        # Check for visualizer exists
        viz_path = Path(folder_path) / 'visualize_circular_chords.html'
        if viz_path.exists():
            # Check for --no-open flag
            # auto_open handled above
            auto_open = not no_open
            
            if auto_open:
                print(f"\n🚀 Launching visualization...")
                print(f"   Server will start on http://localhost:8080")
                print(f"   Press Ctrl+C to stop the server\n")
                try:
                    start_visualization_server(folder_path)
                except OSError as e:
                    if "Address already in use" in str(e) or "Only one usage" in str(e):
                        print(f"\n⚠ Port 8080 is already in use.")
                        print(f"   Open manually: file:///{viz_path.as_posix().replace(chr(92), '/')}")
                    else:
                        print(f"\n⚠ Could not start server: {e}")
                        print(f"   Open manually: file:///{viz_path.as_posix().replace(chr(92), '/')}")
            else:
                abs_path = Path(folder_path).absolute()
                print(f"\n📊 Visualization available at:")
                print(f"   file:///{abs_path.as_posix().replace(chr(92), '/')}/visualize_circular_chords.html")
                print(f"\n   Or start a server manually:")
                print(f"   cd \"{folder_path}\"")
                print(f"   python -m http.server 8080")
        else:
            print(f"\n⚠ Visualizer not found. Make sure visualize_circular_chords.html exists.")
    else:
        print("\n✗ Extraction failed!")


if __name__ == '__main__':
    main()

