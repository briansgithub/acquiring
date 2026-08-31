# Extraction Strategies Testing

This directory contains test scripts to evaluate different methods for extracting all lazy-loaded sections from Hooktheory song pages.

## Strategies

### Strategy 1: Network Request Monitoring
**File:** `strategy_1_network_monitoring.js`

Monitors all network requests to capture song IDs as they're loaded. This is the most reliable method - it captures data as it's requested by the browser.

**Approach:**
- Monitor all `api.hooktheory.com/v1/songs/public/` requests
- Capture song IDs from response URLs
- Slow scroll to trigger lazy loading
- Fetch full data for each discovered song ID

**Pros:**
- Most reliable - captures exactly what the page loads
- No need to parse HTML or interact with elements
- Works regardless of how sections are triggered

**Cons:**
- Requires browser automation
- May miss sections if they're not triggered by scrolling

---

### Strategy 2: HTML Parsing
**File:** `strategy_2_html_parsing.js`

Parses the HTML to find section links and hookpad IDs, then fetches data for each discovered section.

**Approach:**
- Parse HTML for section anchors (`<a name="...">`)
- Find h2 section titles
- Extract hookpad IDs from links and JavaScript
- Look for `pushToPendingTheoryTabs` calls
- Fetch data for each discovered hookpad ID

**Pros:**
- Can work without full browser automation (just HTTP request)
- Finds sections even if they haven't loaded yet
- Based on static HTML structure

**Cons:**
- May miss sections that are dynamically generated
- Requires accurate regex patterns
- May find sections that aren't actually used

---

### Strategy 3: Section Link Clicking
**File:** `strategy_3_section_clicking.js`

Finds and clicks each section link to trigger lazy loading, monitoring network requests as sections are activated.

**Approach:**
- Find all links/buttons containing section names
- Click each section link
- Monitor network requests for new song IDs
- Scroll to section anchors
- Fetch data for discovered sections

**Pros:**
- Actively triggers section loading
- Mimics user interaction
- Can find sections that require interaction

**Cons:**
- May click wrong elements
- Requires accurate element selection
- Slower due to clicking and waiting

---

### Strategy 4: Intersection Observer Simulation
**File:** `strategy_4_intersection_observer.js`

Simulates intersection observer behavior by scrolling sections into view, monitoring when sections become visible and trigger their loading.

**Approach:**
- Find all section elements (anchors, h2s, tab divs)
- Scroll each section into viewport one at a time
- Wait for intersection observer to trigger loading
- Monitor network requests
- Fetch data for discovered sections

**Pros:**
- Mimics how lazy loading actually works
- Systematic approach - ensures each section is viewed
- Can detect which sections trigger loading

**Cons:**
- Slower - must scroll to each section individually
- May not work if intersection observer isn't the trigger mechanism

---

## Running Tests

### Run All Strategies
```bash
npm test
# or
node compare_strategies.js
```

### Run Individual Strategy
```bash
npm run strategy1  # Network monitoring
npm run strategy2  # HTML parsing
npm run strategy3  # Section clicking
npm run strategy4  # Intersection observer
```

### Direct Execution
```bash
node strategy_1_network_monitoring.js
node strategy_2_html_parsing.js
node strategy_3_section_clicking.js
node strategy_4_intersection_observer.js
```

## Expected Results

For the test URL (Maple Leaf Rag), we expect to find:
- **Intro** (may have multiple parts)
- **Chorus**
- **Bridge**
- **Outro**

Each section should have:
- Chord objects (array)
- Melody/note objects (array or object with multiple melodies)
- Metadata (keys, tempos, meters, etc.)

## Output Files

Each strategy generates:
- `strategy_X_results.json` - Full results with all section data

The comparison script generates:
- `strategy_comparison.json` - Comparison of all strategies

## Notes

- All strategies use Puppeteer for browser automation
- Network monitoring is generally the most reliable
- HTML parsing can work without full browser but may be less accurate
- Section clicking and intersection observer simulate user behavior
- Results are saved as JSON for analysis

