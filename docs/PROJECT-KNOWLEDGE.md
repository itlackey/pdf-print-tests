# PDF Print Tests: Comprehensive Project Knowledge

**Last Updated:** 2026-01-20
**Status:** Production Ready

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Tools & Technologies](#tools--technologies)
4. [DriveThruRPG Requirements](#drivethrurpg-requirements)
5. [CSS Paged Media Specifications](#css-paged-media-specifications)
6. [Tool Comparison: PagedJS vs Vivliostyle](#tool-comparison-pagedjs-vs-vivliostyle)
7. [Pipeline Stages](#pipeline-stages)
8. [Common Issues & Solutions](#common-issues--solutions)
9. [File Structure](#file-structure)
10. [Development Guide](#development-guide)
11. [Testing Strategy](#testing-strategy)

---

## Project Overview

### Purpose

This project is a **PDF/X-1a test harness** designed to evaluate and compare two CSS Paged Media rendering engines:
- **PagedJS CLI** - Browser-based polyfill approach
- **Vivliostyle CLI** - Native CSS Paged Media renderer

The primary goal is to determine which tool produces better print-ready PDFs for **DriveThruRPG** and other print-on-demand (POD) services.

### Key Objectives

1. **Compliance Testing**: Verify both tools can produce DriveThruRPG-compliant PDF/X-1a files
2. **Feature Testing**: Test advanced CSS Paged Media features (floats, shapes, multi-column, etc.)
3. **Visual Comparison**: Identify rendering differences between the two tools
4. **Quality Metrics**: Measure TAC (Total Area Coverage), font embedding, color accuracy

### Target Use Case

Creating print-ready PDFs for tabletop RPG books (like Dimm City) that need to be submitted to POD services with strict technical requirements.

---

## Architecture

### High-Level Flow

```
┌─────────────────┐
│  HTML + CSS     │
│  (Source)       │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼────┐
│PagedJS│  │Vivlio │
└───┬──┘  └──┬────┘
    │         │
    │ RGB PDFs│
    └────┬────┘
         │
    ┌────▼────────┐
    │ Ghostscript │
    │ PDF/X Conv. │
    └────┬────────┘
         │
    ┌────▼────────┐
    │ Validation  │
    │ & Compare   │
    └─────────────┘
```

### Component Responsibilities

| Component | Purpose | Tools Used |
|-----------|---------|------------|
| **Build Scripts** | Generate initial PDFs from HTML/CSS | PagedJS CLI, Vivliostyle CLI |
| **Conversion** | Transform RGB PDFs to CMYK PDF/X-1a | Ghostscript 9.55+ |
| **Validation** | Check compliance with DriveThruRPG specs | Poppler (pdfinfo, pdffonts) |
| **Comparison** | Visual diff and metric comparison | ImageMagick, Poppler (pdftoppm) |
| **Orchestration** | Coordinate pipeline execution | Bun.js + TypeScript |

---

## Tools & Technologies

### 1. PagedJS CLI

**Version Tested:** Latest (as of 2026-01)
**Engine:** Chromium + Polyfill
**Language:** JavaScript/Node.js

#### How It Works

1. Loads HTML in headless Chromium browser
2. Injects PagedJS polyfill library to handle CSS Paged Media
3. Renders pages using browser's layout engine
4. Generates PDF using Puppeteer's PDF output

#### Command Syntax

```bash
pagedjs-cli input.html -o output.pdf \
  --timeout 60000 \
  --browserArgs '--no-sandbox,--disable-setuid-sandbox' \
  --style additional.css
```

#### Key Options

| Flag | Purpose | Notes |
|------|---------|-------|
| `-o, --output` | Output PDF path | Required |
| `-s, --page-size` | Page size override | Format: "6.25in x 9.25in" |
| `-w, -h` | Width/height in mm | **Broken**: Doesn't work correctly with CSS sizes |
| `--style` | Additional stylesheet | Can pass extra CSS file |
| `--timeout` | Render timeout (ms) | Default: 60000 |
| `--browserArgs` | Chromium flags | Required in Docker: `--no-sandbox` |

#### Strengths

- **Mature polyfill**: PagedJS is widely used and battle-tested
- **Browser fidelity**: Uses real browser rendering engine
- **CSS compatibility**: Handles complex CSS well (transforms, filters, etc.)
- **Debugging**: Can debug in actual browser

#### Weaknesses

- **Large output files**: Generates significantly larger PDFs (1390 KB vs 260 KB for same content)
- **Font handling**: Sometimes doubles font file size in output
- **CLI options**: `-w/-h` flags don't work as documented
- **CSS marks/bleed**: Ignores or misinterprets CSS `marks` and `bleed` properties

#### Quirks Discovered

1. **Page size from CSS preferred**: Don't pass `-w/-h` if you have `@page { size: ... }` in CSS
2. **Crop marks add space**: CSS `marks: crop cross` adds extra space around page
3. **Bleed adds space**: CSS `bleed: 0.125in` adds space OUTSIDE the page, not inside
4. **Font embedding**: Always embeds fonts, but Ghostscript may strip them during PDF/X conversion

---

### 2. Vivliostyle CLI

**Version Tested:** Latest (as of 2026-01)
**Engine:** Native CSS Paged Media + Playwright
**Language:** TypeScript/Node.js

#### How It Works

1. Uses Vivliostyle.js renderer (native CSS Paged Media implementation)
2. Renders through Playwright browser automation
3. Processes pages using Chromium's print engine
4. Generates PDF with Skia/PDF renderer

#### Command Syntax

```bash
vivliostyle build input.html \
  -o output.pdf \
  --size "6.25in,9.25in" \
  --timeout 120 \
  --log-level info
```

#### Key Options

| Flag | Purpose | Notes |
|------|---------|-------|
| `-o, --output` | Output PDF path | Required |
| `-s, --size` | Page size | Format: "6.25in,9.25in" (comma-separated) |
| `--crop-marks` | Add crop marks | Adds space outside page |
| `--bleed` | Bleed area size | Format: "3mm" or "0.125in" |
| `--press-ready` | PDF/X-1a mode | We don't use (do our own conversion) |
| `-t, --timeout` | Build timeout (seconds) | Default: 120 |
| `--theme` | Theme package | Can apply packaged themes |
| `--style` | Additional CSS | Extra stylesheet URL/path |

#### Strengths

- **Smaller files**: Generates much smaller PDFs (260 KB vs 1390 KB)
- **Native renderer**: Built specifically for CSS Paged Media
- **Press-ready option**: Has built-in PDF/X conversion (though we don't use it)
- **Clean output**: More efficient PDF structure

#### Weaknesses

- **Less CSS support**: Some advanced CSS features may not work
- **TAC inconsistency**: Many pages show very low TAC values, suggesting possible rendering issues
- **Limited debugging**: Can't easily debug layout issues
- **Font handling**: Sometimes doesn't embed all fonts properly

#### Quirks Discovered

1. **Size parameter required**: Even with CSS `@page { size }`, pass `--size` to CLI for reliability
2. **Comma-separated sizes**: Uses "6.25in,9.25in" (comma) not "6.25in x 9.25in" (x)
3. **CSS marks ignored**: Like PagedJS, doesn't handle `marks: crop cross` correctly
4. **Low TAC on some pages**: Investigation needed - may indicate missing content rendering
5. **Producer metadata**: Output shows "Skia/PDF m143" as producer

---

### 3. Ghostscript (PDF/X Conversion)

**Version Required:** 9.55.0 or higher
**Purpose:** RGB to CMYK + PDF/X-1a compliance

#### Why We Need It

Neither PagedJS nor Vivliostyle can directly produce PDF/X-1a compliant files. Ghostscript:
1. Converts RGB colors to CMYK using ICC profiles
2. Adds PDF/X-1a metadata and structure
3. Ensures compliance with ISO 15930-1:2001 standard
4. Manages color profiles and output intents

#### Command Used

```bash
gs -dPDFX=true \
   -dBATCH -dNOPAUSE -dSAFER \
   -sDEVICE=pdfwrite \
   -sColorConversionStrategy=CMYK \
   -dProcessColorModel=/DeviceCMYK \
   -sOutputICCProfile=/path/to/default_cmyk.icc \
   -sOutputFile=output-pdfx.pdf \
   input.pdf
```

#### Key Parameters

| Parameter | Purpose |
|-----------|---------|
| `-dPDFX=true` | Enable PDF/X mode |
| `-sColorConversionStrategy=CMYK` | Convert all colors to CMYK |
| `-dProcessColorModel=/DeviceCMYK` | Set output color model |
| `-sOutputICCProfile` | ICC profile for CMYK conversion |
| `-dPDFA=0` | Disable PDF/A (conflicts with PDF/X) |

#### ICC Profile Location

Default Ghostscript CMYK profile:
```
/usr/share/color/icc/ghostscript/default_cmyk.icc
```

#### Side Effects

1. **Font subsetting/removal**: May remove or subset fonts aggressively
2. **File size increase**: CMYK conversion often increases file size
3. **Color shifts**: RGB→CMYK conversion may alter colors slightly
4. **Metadata changes**: Adds PDF/X metadata, changes producer info

---

### 4. Validation Tools (Poppler Utils)

#### pdfinfo

**Purpose:** Extract PDF metadata and page information

```bash
pdfinfo file.pdf
```

**Key Metrics Extracted:**
- Page count
- Page dimensions (in points, convert to inches: pts/72)
- PDF version
- Producer metadata
- Encryption status

#### pdffonts

**Purpose:** List embedded fonts

```bash
pdffonts file.pdf
```

**Output Format:**
```
name                   type         emb sub uni object ID
---------------------- ------------ --- --- --- ---------
BAAAAA+LiberationSerif TrueType     yes yes yes    10  0
```

**Columns:**
- `emb`: "yes" if embedded
- `sub`: "yes" if subsetted
- `uni`: "yes" if Unicode

**Critical for Compliance:** All fonts MUST be embedded for DriveThruRPG.

#### pdftoppm

**Purpose:** Convert PDF pages to images for visual comparison

```bash
pdftoppm -png -r 150 input.pdf output_prefix
```

**Parameters:**
- `-png`: Output PNG format
- `-r 150`: Resolution (150 DPI sufficient for visual diff)
- Output: `output_prefix-01.png`, `output_prefix-02.png`, etc.

---

### 5. ImageMagick (Visual Comparison)

**Purpose:** Pixel-by-pixel comparison of rendered PDFs

```bash
compare -metric AE \
  page1-pagedjs.png \
  page1-vivlio.png \
  diff-output.png
```

**Metrics:**
- **AE**: Absolute Error (pixel count)
- **Threshold**: 1000 pixels = significant difference

**Use Case:** Identify which pages render differently between tools.

---

## DriveThruRPG Requirements

### Official Specifications

| Requirement | Value | Validation Method |
|-------------|-------|-------------------|
| **Page Size** | 6.25" × 9.25" (±2%) | pdfinfo page dimensions |
| **Trim Size** | 6" × 9" | Calculated (page size - bleed) |
| **Bleed** | 0.125" all edges | Included in page size |
| **Color Space** | CMYK only | pdfinfo or Acrobat preflight |
| **Max TAC** | ≤240% recommended, ≤300% max | Calculated from CMYK values |
| **PDF Standard** | PDF/X-1a:2001 | PDF version 1.3 or 1.4 |
| **Fonts** | All embedded | pdffonts check |
| **Encryption** | None | pdfinfo check |
| **Crop Marks** | Not wanted for POD | Must not add extra space |

### TAC (Total Area Coverage)

**Definition:** Sum of C + M + Y + K percentages at any pixel

**Example:**
- Cyan: 50%
- Magenta: 40%
- Yellow: 30%
- Black: 20%
- **TAC:** 140%

**DriveThruRPG Limits:**
- ≤240%: Recommended (faster drying, less issues)
- ≤300%: Maximum acceptable
- >300%: May be rejected

**Common TAC Issues:**
1. Rich blacks (C:60, M:40, Y:40, K:100) = 240% TAC
2. Full backgrounds with overlaid dark text can exceed limits
3. Pure black backgrounds using all four colors = 400% TAC ⚠️

### Bleed Area Explained

```
┌─────────────────────────────────┐
│ ← 0.125" bleed                  │
│  ┌─────────────────────────┐    │
│  │                         │    │ ← 9.25" total page height
│  │   6" × 9" trim area    │    │
│  │   (safe content)       │    │
│  │                         │    │
│  └─────────────────────────┘    │
│                   bleed 0.125" →│
└─────────────────────────────────┘
     ← 6.25" total page width →
```

**Important:** The bleed area is INCLUDED in the page size, not added outside it.

---

## CSS Paged Media Specifications

### @page Rule Syntax

```css
@page {
  size: 6.25in 9.25in;           /* Final page size with bleed */
  margin: 0.75in 0.625in;         /* Top/bottom, left/right */

  /* DO NOT USE for DriveThruRPG: */
  /* marks: crop cross;  */       /* Adds space outside page */
  /* bleed: 0.125in;     */       /* Adds space outside page */
}
```

### Variable Resolution Issues

**Problem:** CSS custom properties don't work in `@page` rules with PagedJS/Vivliostyle.

**Broken:**
```css
:root {
  --page-width: 6.25in;
  --page-height: 9.25in;
}
@page {
  size: var(--page-width) var(--page-height); /* Doesn't work! */
}
```

**Working:**
```css
@page {
  size: 6.25in 9.25in; /* Hardcoded values required */
  margin: var(--margin-top) var(--margin-outside); /* Variables OK here */
}
```

### Page Margins & Boxes

```css
@page {
  margin: 0.75in 0.625in 1in 0.625in; /* top, right, bottom, left */

  /* Margin boxes for headers/footers */
  @top-center {
    content: "Chapter Title";
    font-size: 9pt;
  }

  @bottom-center {
    content: counter(page);
    font-size: 9pt;
  }
}

/* First page customization */
@page :first {
  @bottom-center {
    content: none; /* No page number on first page */
  }
}

/* Left/right pages (for mirrored margins) */
@page :left {
  margin-left: 0.75in;
  margin-right: 0.625in;
}

@page :right {
  margin-left: 0.625in;
  margin-right: 0.75in;
}
```

### Advanced CSS Features Tested

#### 1. CSS Shapes with Floats

```css
.circle-float {
  float: left;
  width: 200px;
  height: 200px;
  shape-outside: circle(50%);
  clip-path: circle(50%);
}
```

**Result:** Both tools handle basic circles well.

#### 2. Polygon Shapes

```css
.diamond-float {
  float: right;
  width: 150px;
  height: 150px;
  shape-outside: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
}
```

**Result:** Works in both, but visual rendering differs slightly.

#### 3. Multi-Column Layout

```css
.two-column {
  column-count: 2;
  column-gap: 0.25in;
  column-rule: 1px solid #ccc;
}
```

**Result:** Both tools support multi-column, but break points differ.

#### 4. Break Control

```css
.no-break {
  page-break-inside: avoid;
  break-inside: avoid; /* Modern syntax */
}

.force-break {
  page-break-before: always;
  break-before: page; /* Modern syntax */
}
```

**Result:** Generally respected by both tools, but not always perfect.

#### 5. Running Headers

```css
h1 {
  string-set: chapter-title content();
}

@page {
  @top-center {
    content: string(chapter-title);
  }
}
```

**Result:** PagedJS handles well, Vivliostyle support varies.

---

## Tool Comparison: PagedJS vs Vivliostyle

### Feature Matrix

| Feature | PagedJS | Vivliostyle | Notes |
|---------|---------|-------------|-------|
| **Basic @page rules** | ✅ Excellent | ✅ Excellent | Both handle well |
| **Page margins** | ✅ Excellent | ✅ Excellent | Both handle well |
| **Margin boxes** | ✅ Excellent | ⚠️ Good | PagedJS more reliable |
| **CSS Shapes** | ✅ Excellent | ⚠️ Good | Both work, visual diffs |
| **Multi-column** | ✅ Good | ✅ Good | Different break points |
| **Floats** | ✅ Excellent | ✅ Good | PagedJS more accurate |
| **Fonts** | ✅ Always embeds | ⚠️ Sometimes missing | PagedJS more reliable |
| **File size** | ⚠️ Large (1390 KB) | ✅ Small (260 KB) | Vivliostyle more efficient |
| **TAC consistency** | ✅ Consistent | ⚠️ Many low values | Possible rendering gaps |
| **CLI page size** | ⚠️ Buggy | ✅ Works | Use CSS for PagedJS |
| **Documentation** | ✅ Excellent | ⚠️ Limited | PagedJS better docs |
| **Community** | ✅ Active | ⚠️ Smaller | PagedJS more popular |

### Visual Differences Observed

From 29-page kitchen sink test:
- **17 pages showed visual differences**
- Most differences in complex layouts (shapes, floats, multi-column)
- Text rendering slightly different (font rendering engine variations)
- Color handling similar but not identical

### Performance

| Metric | PagedJS | Vivliostyle |
|--------|---------|-------------|
| **Build time** | 2.76s | 4.70s |
| **RGB output size** | 1390 KB | 260 KB |
| **PDF/X time** | 34.52s | 4.12s |
| **PDF/X output size** | 8140 KB | 1751 KB |

**Key Takeaway:** Vivliostyle produces smaller files but PagedJS has faster build time. PDF/X conversion time heavily depends on input file complexity.

### Recommendation Matrix

| Use Case | Recommended Tool | Reason |
|----------|------------------|--------|
| **Simple layouts** | Either | Both work well |
| **Complex shapes/floats** | PagedJS | More accurate rendering |
| **Large documents** | Vivliostyle | Smaller file sizes |
| **Font-heavy docs** | PagedJS | Better font embedding |
| **Production print** | PagedJS | More consistent TAC |
| **Quick proofs** | Vivliostyle | Faster PDF/X conversion |

---

## Pipeline Stages

### Stage 1: Build (RGB PDFs)

**Purpose:** Generate initial PDFs from HTML/CSS using CSS Paged Media renderers.

**Input:** HTML file + CSS stylesheets
**Output:** RGB PDFs (not yet print-ready)

**Scripts:**
- `scripts/build-pagedjs.ts`
- `scripts/build-vivliostyle.ts`

**Key Steps:**
1. Validate input HTML exists
2. Execute CLI with appropriate flags
3. Check output PDF was created
4. Return success/failure + metadata

**Common Issues:**
- Timeout for complex documents (increase `--timeout`)
- Missing fonts (ensure web fonts load)
- Sandbox errors in Docker (use `--no-sandbox`)

---

### Stage 2: Convert to PDF/X

**Purpose:** Transform RGB PDFs to CMYK PDF/X-1a compliant files.

**Input:** RGB PDFs from Stage 1
**Output:** PDF/X-1a CMYK PDFs (print-ready)

**Script:** `scripts/convert-pdfx.ts`

**Ghostscript Process:**
1. Load RGB PDF
2. Convert colors to CMYK using ICC profile
3. Add PDF/X metadata
4. Embed/subset fonts as needed
5. Write compliant PDF/X file

**Side Effects:**
- File size usually increases (CMYK data + metadata)
- Fonts may be subsetted or removed
- Color shifts possible (RGB→CMYK conversion)
- Some transparency may be flattened

**Configuration:**
```typescript
const GS_PDFX_ARGS = [
  '-dPDFX=true',
  '-dBATCH',
  '-dNOPAUSE',
  '-dSAFER',
  '-sDEVICE=pdfwrite',
  '-sColorConversionStrategy=CMYK',
  '-dProcessColorModel=/DeviceCMYK',
  '-sOutputICCProfile=/usr/share/color/icc/ghostscript/default_cmyk.icc',
];
```

---

### Stage 3: Validation

**Purpose:** Check PDF compliance with DriveThruRPG requirements.

**Input:** PDF/X files from Stage 2
**Output:** Validation results (pass/fail per requirement)

**Script:** `scripts/validate-pdfs.ts`

**Checks Performed:**

| Check | Tool | Method |
|-------|------|--------|
| Page dimensions | pdfinfo | Parse "Page size" field |
| Page count | pdfinfo | Parse "Pages" field |
| PDF version | pdfinfo | Parse "PDF version" field |
| Color space | pdfinfo + manual | Check for RGB/DeviceRGB |
| Fonts embedded | pdffonts | Parse output, check "emb" column |
| Encryption | pdfinfo | Check for "Encrypted: no" |
| TAC calculation | Manual | Extract CMYK, sum percentages |

**TAC Calculation:**
```typescript
// Extract CMYK values from each page
// For each pixel/region:
const tac = cyan + magenta + yellow + black;
// Track maximum TAC across all pages
```

**Validation Output:**
```typescript
interface ValidationResult {
  valid: boolean;
  compliant: boolean;
  pages: number;
  dimensions: { widthIn: number; heightIn: number };
  colorSpace: string;
  fonts: { total: number; embedded: number };
  maxTAC: number;
  pdfVersion: string;
  encrypted: boolean;
  warnings: string[];
  errors: string[];
}
```

---

### Stage 4: Visual Comparison

**Purpose:** Identify visual differences between PagedJS and Vivliostyle outputs.

**Input:** PDF/X files from both tools
**Output:** Diff images + metrics

**Script:** `scripts/compare-pdfs.ts`

**Process:**
1. Convert both PDFs to PNG images (150 DPI)
2. Compare each page pair pixel-by-pixel
3. Generate diff images highlighting differences
4. Count total different pixels
5. Save diff images with red highlighting

**ImageMagick Compare:**
```bash
compare -metric AE \
  pagedjs-page-01.png \
  vivlio-page-01.png \
  diff-page-01.png
```

**Threshold:** 1000 pixels = significant difference

**Output:**
- `visual-diff/diff-page-XX.png` - Highlighted differences
- Pixel count per page
- List of pages with differences

---

### Stage 5: Reporting

**Purpose:** Generate comprehensive comparison report.

**Input:** All validation and comparison data
**Output:** Markdown report

**Script:** `scripts/batch-process.ts` (generates report)

**Report Sections:**
1. **Executive Summary** - Compliance status, scores
2. **Tool Outputs** - Individual tool results
3. **Compliance Checks** - Detailed pass/fail table
4. **Feature Comparison** - Side-by-side metrics
5. **Visual Comparison** - Diff summary
6. **TAC by Page** - Per-page ink coverage table
7. **Recommendations** - Action items
8. **Technical Details** - Test configuration

**Sample Output:**
```markdown
| Check | Result | Expected | Actual |
|-------|--------|----------|--------|
| Page Dimensions | ✅ | 6.25" × 9.25" | 6.250" × 9.250" |
| Color Space | ✅ | CMYK | CMYK |
| Max TAC | ⚠️ | ≤ 240% | 400.0% (page 1) |
| Fonts Embedded | ✅ | All fonts | 19/19 embedded |
```

---

## Common Issues & Solutions

### Issue 1: Wrong Page Dimensions

**Symptom:** Output PDFs are 7.52" × 10.52" or other unexpected sizes.

**Root Cause:** CSS `marks: crop cross` and `bleed: 0.125in` add space OUTSIDE the page.

**Solution:**
```css
/* WRONG - adds extra space */
@page {
  size: 6.25in 9.25in;
  marks: crop cross;  /* Adds ~0.5" around page */
  bleed: 0.125in;     /* Adds 0.125" outside */
}

/* CORRECT - final size is what you specify */
@page {
  size: 6.25in 9.25in;
  /* Bleed is INCLUDED in size, not added */
  /* No marks for POD services */
}
```

---

### Issue 2: Font Embedding Detection Failing

**Symptom:** pdffonts shows embedded fonts but validation says "0 embedded".

**Root Cause:** Incorrect parsing of pdffonts output format.

**Solution:**
```typescript
// WRONG - doesn't handle all output formats
const isEmbedded = parts[3] === 'yes';

// CORRECT - pattern matching
const embeddedMatch = line.match(/\byes\b.*\byes\b/);
const isEmbedded = !!embeddedMatch;
```

---

### Issue 3: PagedJS -w/-h Flags Produce Wrong Size

**Symptom:** Specifying `-w 158.75 -h 234.95` produces tiny 1.65" × 2.44" pages.

**Root Cause:** PagedJS -w/-h options conflict with CSS size declarations.

**Solution:** Don't use `-w/-h` flags. Let CSS `@page { size }` control dimensions.

```bash
# WRONG
pagedjs-cli input.html -o output.pdf -w 158.75 -h 234.95

# CORRECT
pagedjs-cli input.html -o output.pdf
# (CSS controls size)
```

---

### Issue 4: Vivliostyle Ignores --size Parameter

**Symptom:** Passing `--size "6.25in,9.25in"` is ignored.

**Root Cause:** CSS `marks` and `bleed` properties override CLI size.

**Solution:** Remove `marks` and `bleed` from CSS, keep CLI `--size` parameter.

```css
/* Remove these: */
/* marks: crop cross; */
/* bleed: 0.125in; */
```

```bash
# Keep this:
vivliostyle build input.html -o output.pdf --size "6.25in,9.25in"
```

---

### Issue 5: TAC Shows 400% (Maximum)

**Symptom:** Validation reports 400% TAC on some pages.

**Root Cause:** Actually accurate - full-coverage backgrounds using all CMYK channels.

**Solution:**
1. Check if page actually has full-coverage background
2. If yes, optimize colors to use less ink:
   - Rich black: C:60, M:40, Y:40, K:100 = 240% TAC
   - Avoid mixing all four channels at high percentages
3. Use ICC profiles designed for lower TAC limits

---

### Issue 6: Visual Diff Shows Many Differences

**Symptom:** 17+ pages show pixel differences between tools.

**Root Cause:** Expected - different rendering engines produce slightly different output.

**Analysis:**
- Font rendering: Different anti-aliasing algorithms
- Shape rendering: Slight variations in curves and edges
- Layout: Minor differences in line breaking and spacing
- Color: Different color conversion algorithms

**Action:** Review diff images manually to determine if differences are acceptable.

---

### Issue 7: Ghostscript Removes All Fonts

**Symptom:** PDF/X version shows "0 fonts embedded" but original had 42.

**Root Cause:** Aggressive font subsetting or conversion to outlines.

**Solutions:**
1. Check if fonts are actually missing or just subsetted differently
2. Try different Ghostscript font embedding flags:
   ```bash
   -dEmbedAllFonts=true
   -dSubsetFonts=false
   ```
3. May not be an actual issue if text still renders correctly

---

### Issue 8: Docker Sandbox Errors

**Symptom:** "Failed to move to new namespace: PID namespaces supported, Network namespace supported, but failed"

**Root Cause:** Docker container restrictions prevent Chromium sandboxing.

**Solution:** Pass sandbox bypass flags to browser:
```bash
pagedjs-cli --browserArgs '--no-sandbox,--disable-setuid-sandbox'
```

---

### Issue 9: CSS Variables Not Working in @page

**Symptom:** `@page { size: var(--page-width) var(--page-height); }` produces default size.

**Root Cause:** Neither PagedJS nor Vivliostyle resolve CSS custom properties in `@page` context.

**Solution:** Use hardcoded values in `@page`, variables elsewhere:
```css
:root {
  --margin-top: 0.75in;
}

@page {
  size: 6.25in 9.25in;  /* Hardcoded - required */
  margin: var(--margin-top) 0.625in;  /* Variables OK here */
}
```

---

## File Structure

```
pdf-print-tests/
├── package.json               # Dependencies (PagedJS, Vivliostyle, etc.)
├── bun.lock                   # Lockfile
├── tsconfig.json              # TypeScript configuration
│
├── examples/                  # Test HTML/CSS files
│   ├── kitchen-sink.html      # Comprehensive test document
│   └── kitchen-sink.css       # Test stylesheet
│
├── scripts/                   # Build and test scripts
│   ├── run-all.ts            # Main orchestrator
│   ├── batch-process.ts      # Pipeline execution
│   ├── build-pagedjs.ts      # PagedJS builder
│   ├── build-vivliostyle.ts  # Vivliostyle builder
│   ├── convert-pdfx.ts       # Ghostscript PDF/X converter
│   ├── validate-pdfs.ts      # DriveThruRPG compliance checker
│   ├── compare-pdfs.ts       # Visual diff generator
│   └── check-deps.ts         # Dependency verification
│
└── output/                    # Generated outputs (gitignored)
    └── kitchen-sink/project/
        ├── pagedjs-output.pdf      # RGB PDF from PagedJS
        ├── pagedjs-pdfx.pdf        # CMYK PDF/X from PagedJS
        ├── vivliostyle-output.pdf  # RGB PDF from Vivliostyle
        ├── vivliostyle-pdfx.pdf    # CMYK PDF/X from Vivliostyle
        ├── comparison-report.md    # Detailed comparison report
        └── visual-diff/            # Diff images
            ├── diff-page-01.png
            ├── diff-page-02.png
            └── ...
```

---

## Development Guide

### Prerequisites

```bash
# System dependencies
sudo apt-get install -y \
  ghostscript \
  poppler-utils \
  imagemagick

# Bun.js runtime
curl -fsSL https://bun.sh/install | bash

# Project dependencies
bun install
```

### Running Tests

```bash
# Full pipeline (both tools)
INPUT_DIR=./examples OUTPUT_DIR=./output bun run test

# PagedJS only
INPUT_DIR=./examples OUTPUT_DIR=./output bun run test -- --skip-vivliostyle

# Vivliostyle only
INPUT_DIR=./examples OUTPUT_DIR=./output bun run test -- --skip-pagedjs

# Skip PDF/X conversion (faster, for layout testing)
bun run test -- --skip-convert

# Skip validation
bun run test -- --skip-validate

# Skip comparison
bun run test -- --skip-compare
```

### Adding New Test Cases

1. Create new HTML/CSS in `examples/`
2. Set `INPUT_DIR` to the directory containing your HTML
3. Run pipeline
4. Review `comparison-report.md`

### Modifying Page Size

Edit the `TARGET_PAGE` configuration in `batch-process.ts`:

```typescript
const TARGET_PAGE = {
  trimWidthIn: 6,      // Change these
  trimHeightIn: 9,
  bleedIn: 0.125,
  // Calculated properties update automatically
};
```

### Extending Validation Rules

Add checks to `validate-pdfs.ts`:

```typescript
export function validatePdf(pdfPath: string): ValidationResult {
  // Add custom checks here
  const myCheck = checkCustomRequirement(pdfPath);

  return {
    // Include in result
    myCheck,
    compliant: dimensionsOK && colorsOK && myCheck,
  };
}
```

---

## Testing Strategy

### Test Pyramid

```
         ┌─────────────┐
         │  Integration│  ← Full pipeline tests
         │    Tests    │
         ├─────────────┤
         │   Unit      │  ← Individual script tests
         │   Tests     │
         ├─────────────┤
         │  Feature    │  ← CSS feature tests
         │  Tests      │
         └─────────────┘
```

### Feature Test Matrix

| CSS Feature | Test Case | PagedJS | Vivliostyle |
|-------------|-----------|---------|-------------|
| Basic @page | Simple margins | ✅ | ✅ |
| Floats | Text wrap | ✅ | ✅ |
| CSS Shapes | Circle float | ✅ | ⚠️ |
| CSS Shapes | Polygon float | ✅ | ⚠️ |
| Multi-column | 2-column text | ✅ | ✅ |
| Page breaks | Avoid breaks | ✅ | ⚠️ |
| Running headers | Chapter titles | ✅ | ⚠️ |
| Tables | Multi-page | ✅ | ✅ |
| Images | Full-bleed | ✅ | ✅ |

### Regression Testing

After making changes:
1. Run full pipeline: `bun run test`
2. Check all compliance metrics stay green
3. Review visual diff for unexpected changes
4. Compare file sizes (shouldn't change drastically)
5. Verify TAC values remain reasonable

### Performance Benchmarks

| Operation | Target Time | Actual (29 pages) |
|-----------|-------------|-------------------|
| PagedJS build | < 5s | 2.76s ✅ |
| Vivliostyle build | < 10s | 4.70s ✅ |
| PDF/X conversion | < 60s | 34.52s / 4.12s ✅ |
| Validation | < 5s | ~2s ✅ |
| Visual diff | < 30s | ~10s ✅ |
| Total pipeline | < 120s | 61.19s ✅ |

---

## Troubleshooting Checklist

### Build Failures

- [ ] Check HTML file exists
- [ ] Verify all CSS files load
- [ ] Ensure web fonts are accessible
- [ ] Increase timeout for large documents
- [ ] Check browser sandbox flags in Docker
- [ ] Verify no JavaScript errors in HTML

### PDF/X Conversion Failures

- [ ] Check Ghostscript is installed (`gs --version`)
- [ ] Verify ICC profile exists
- [ ] Ensure input PDF is valid
- [ ] Check disk space for output
- [ ] Review Ghostscript error messages

### Validation Failures

- [ ] Check page dimensions in CSS
- [ ] Remove `marks: crop cross` from CSS
- [ ] Remove `bleed` property from CSS
- [ ] Verify fonts are loading
- [ ] Check TAC on problem pages
- [ ] Review color values in CSS

### Visual Diff Issues

- [ ] Verify both PDFs generated
- [ ] Check pdftoppm is installed
- [ ] Ensure ImageMagick is installed
- [ ] Check disk space for temp images
- [ ] Verify diff threshold is reasonable

---

## Future Improvements

### Planned Features

1. **Multiple ICC Profiles**: Support different color profiles (US Web Coated, Japan Color, etc.)
2. **TAC Reduction**: Auto-reduce TAC in problem areas
3. **Font Optimization**: Better control over font embedding/subsetting
4. **Parallel Processing**: Run both tools simultaneously
5. **Web Interface**: Visual test runner and comparison viewer
6. **CI/CD Integration**: Automated regression testing
7. **More Tests**: Expanded feature coverage

### Research Needed

1. **Vivliostyle TAC Issue**: Why are many pages showing very low TAC?
2. **Font Subsetting**: Why does Ghostscript strip fonts differently?
3. **Color Accuracy**: Quantify color shift from RGB→CMYK
4. **Performance**: Optimize PDF/X conversion for large documents

---

## Glossary

| Term | Definition |
|------|------------|
| **Bleed** | Extra area around page edge where background extends (prevents white edges when trimmed) |
| **CMYK** | Cyan, Magenta, Yellow, Key (black) - subtractive color model for printing |
| **Crop Marks** | Lines showing where to trim the printed page |
| **DriveThruRPG** | Print-on-demand service for RPG books |
| **ICC Profile** | Color management file defining color space characteristics |
| **PDF/X** | ISO standard for print-ready PDFs (PDF/X-1a:2001 is most common) |
| **POD** | Print-on-demand service |
| **TAC** | Total Area Coverage - sum of CMYK percentages (max 400%) |
| **Trim Size** | Final book dimensions after cutting off bleed |

---

## References

### Documentation

- [PagedJS Documentation](https://pagedjs.org/documentation/)
- [Vivliostyle Documentation](https://vivliostyle.org/documents/)
- [CSS Paged Media Spec](https://www.w3.org/TR/css-page-3/)
- [PDF/X-1a Standard](https://www.iso.org/standard/39940.html)
- [DriveThruRPG File Specs](https://help.drivethrurpg.com/hc/en-us/articles/360001076426)

### Tools

- [Ghostscript](https://www.ghostscript.com/)
- [Poppler Utils](https://poppler.freedesktop.org/)
- [ImageMagick](https://imagemagick.org/)
- [Bun.js](https://bun.sh/)

---

**End of Document**
