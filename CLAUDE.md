# PDF Print Tests - Claude Code Reference

## Project Overview

This project is a **PDF rendering test harness** for creating **DriveThruRPG-compliant print-ready PDFs** using CSS Paged Media. It compares three rendering engines (PagedJS, Vivliostyle, WeasyPrint) and validates output against print-on-demand requirements.

## Key Concepts

### DriveThruRPG Requirements
- **PDF/X-1a:2001 or PDF/X-3:2002** standard (NOT PDF/X-4)
- **TAC (Total Area Coverage)**: Maximum 240% ink coverage (sum of CMYK percentages)
- **Page Size**: Trim + bleed on **3 outside edges** (not spine)
  - **6×9 trim** → **6.125" × 9.25"** (width +0.125", height +0.25")
  - **8.5×11 trim** → **8.625" × 11.25"**
- **Color Space**: CMYK only (no RGB/Lab/spot colors)
- **All fonts must be embedded** (use `--full-fonts` with WeasyPrint)
- **No crop/registration marks** (just correct page geometry)

### Three Rendering Engines

| Engine | Technology | TAC Handling | Best For |
|--------|-----------|--------------|----------|
| **PagedJS** | Chromium + polyfill | Often exceeds 240% | CSS Paged Media testing |
| **Vivliostyle** | Chromium native | Often exceeds 240% | Full CSS Paged Media spec |
| **WeasyPrint** | Python (non-Chromium) | ~228% (compliant) | DriveThruRPG production |

**WeasyPrint is recommended** for final production as it produces TAC-compliant PDFs without additional processing.

## Running the Pipeline

### Full Pipeline (All Engines)
```bash
bun run test:kitchen-sink
# Equivalent to:
bun run scripts/batch-process.ts --input examples --output output/kitchen-sink --html kitchen-sink.html
```

### Individual Engine Builds
```bash
# PagedJS only
bun run build:pagedjs

# Vivliostyle only
bun run build:vivliostyle

# WeasyPrint only
bun run build:weasyprint
```

### Custom Input/Output
```bash
bun run scripts/batch-process.ts \
  --input /path/to/input \
  --output /path/to/output \
  --html myfile.html
```

### Skip Engines or Steps
```bash
# Skip specific engines
--skip-pagedjs
--skip-vivliostyle
--skip-weasyprint

# Skip processing steps
--skip-convert   # Skip PDF/X conversion
--skip-compare   # Skip comparison report

# Strict mode (fail if not compliant)
--strict
```

## Troubleshooting Output Issues

### TAC (Total Area Coverage) Exceeds 240%

**Symptoms**: DriveThruRPG rejects PDF, comparison report shows red TAC values

**Root Cause**: Chromium-based engines (PagedJS, Vivliostyle) don't limit TAC during RGB→CMYK conversion.

**Solutions**:
1. **Use WeasyPrint** - produces compliant TAC (~228%) by default
2. **Check per-page TAC** in `output/*/comparison-report.md`
3. **Reduce saturated colors** in problematic pages (see report for page numbers)

**Important**: The CGATS21_CRPC1.icc profile used in Ghostscript conversion does NOT automatically reduce TAC - it only handles color space conversion.

### Page Dimensions Wrong

**Expected**: 6.25" × 9.25" (includes bleed)

**Check** `styles/base/print-base.css`:
```css
@page {
  size: 6.25in 9.25in;
  margin: var(--margin-top) var(--margin-outside) var(--margin-bottom) var(--margin-inside);
}
```

### CSS Features Not Working

Different engines have different CSS support:

| Feature | PagedJS | Vivliostyle | WeasyPrint |
|---------|---------|-------------|------------|
| `position: running()` | ✅ | ✅ | ❌ Use `string-set` |
| `env()` variables | ✅ | ✅ | ❌ Use hardcoded values |
| CSS variables in `@page` | Partial | Partial | Partial |
| PDF bookmarks | ❌ | ❌ | ✅ `-weasy-bookmark-level` |
| `target-counter()` | ✅ | ✅ | ✅ |
| `leader()` for TOC | Partial | Partial | ✅ Best support |
| Footnotes | ✅ | ✅ | ✅ |
| Hyphenation | Basic | Basic | ✅ Best support |

### WeasyPrint-Specific Fixes

See `styles/engines/weasyprint/overrides.css` for fixes:
- Replace `position: running()` with `string-set` on headings
- Replace `env(pub-title)` with hardcoded strings
- Force block display for flexbox layouts
- Use explicit measurements instead of viewport units

## CSS Architecture

CSS files are concatenated in order for each engine:

```
styles/
├── common/variables.css      # 1. CSS custom properties
├── base/
│   ├── reset.css            # 2. CSS reset
│   ├── typography.css       # 3. Font definitions
│   └── print-base.css       # 4. @page rules, running headers
├── common/
│   ├── layout.css           # 5. Layout utilities
│   └── components.css       # 6. Component styles
├── engines/
│   ├── pagedjs/
│   │   ├── overrides.css    # 7a. PagedJS-specific fixes
│   │   └── features.css     # 7b. PagedJS features
│   ├── vivliostyle/
│   │   ├── overrides.css    # 7a. Vivliostyle-specific fixes
│   │   └── features.css     # 7b. Vivliostyle features
│   └── weasyprint/
│       ├── overrides.css    # 7a. WeasyPrint-specific fixes
│       └── features.css     # 7b. WeasyPrint features
└── themes/
    └── kitchen-sink.css     # 8. Theme-specific styles
```

## Debugging CSS

### See Concatenated CSS
After a build, check the concatenated CSS in the output directory:
```
output/*/pagedjs-styles.css
output/*/vivliostyle-styles.css
output/*/weasyprint-styles.css
```

### Check @page Rules
Most issues stem from `@page` rules. Look for:
- `size: 6.25in 9.25in;` - correct page dimensions
- Margin values with CSS variables may not resolve in some engines
- Named pages (`@page title`, `@page content`) for special layouts

### Test Single Engine
When debugging CSS issues, test with one engine first:
```bash
bun run scripts/build-weasyprint.ts --input examples/kitchen-sink.html --output output/test.pdf
```

## Validating PDFs

### Manual TAC Check
```bash
bun run scripts/validate-tac.ts output/*/weasyprint-pdfx.pdf
```

### TAC Thresholds
- **≤200%**: Pass (green)
- **200-240%**: Warning (yellow) - acceptable but monitor
- **>240%**: Fail (red) - will be rejected by DriveThruRPG

### PDF Info
```bash
pdfinfo output/*/weasyprint-pdfx.pdf
pdffonts output/*/weasyprint-pdfx.pdf
```

## PDF/X Conversion

Ghostscript converts RGB PDFs to PDF/X-1a:2001 with CMYK color:

```bash
bun run scripts/convert-pdfx.ts \
  --input output/weasyprint-output.pdf \
  --output output/weasyprint-pdfx.pdf
```

**ICC Profile**: Uses `CGATS21_CRPC1.icc` from ttrpg-publishing profile.

**Important**: ICC profile embedding does NOT reduce TAC. The source colors determine TAC - only WeasyPrint produces natively low-TAC output.

## File Locations

| File | Purpose |
|------|---------|
| `scripts/batch-process.ts` | Main pipeline orchestration |
| `scripts/build-pagedjs.ts` | PagedJS build |
| `scripts/build-vivliostyle.ts` | Vivliostyle build |
| `scripts/build-weasyprint.ts` | WeasyPrint build |
| `scripts/convert-pdfx.ts` | Ghostscript PDF/X conversion |
| `scripts/validate-tac.ts` | TAC validation |
| `scripts/compare-pdfs.ts` | Comparison report generator |
| `examples/kitchen-sink.html` | Test document with all CSS features |
| `styles/engines/*/overrides.css` | Engine-specific CSS fixes |
| `output/*/comparison-report.md` | Generated comparison report |

## Common Workflows

### Iterate on CSS
1. Edit CSS files in `styles/`
2. Run `bun run test:kitchen-sink`
3. Check `output/kitchen-sink/comparison-report.md` for TAC and compliance
4. Open PDFs to visually inspect

### Debug WeasyPrint Rendering
1. Check `styles/engines/weasyprint/overrides.css` for known fixes
2. Run WeasyPrint alone: `bun run build:weasyprint`
3. Compare with Chromium-based output for visual differences
4. Add fixes to overrides.css

### Prepare for DriveThruRPG
1. Run full pipeline: `bun run test:kitchen-sink`
2. Check comparison report for TAC compliance
3. Use WeasyPrint PDF/X output (`*-pdfx.pdf`) for upload
4. Verify page dimensions are 6.25" × 9.25"

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `INPUT_DIR` | Input directory path | `./input` |
| `OUTPUT_DIR` | Output directory path | `./output/default-test` |
| `INPUT_FILE` | Direct input file path | - |
| `OUTPUT_FILE` | Direct output file path | - |

## Critical Learnings (2026-01-20)

### WeasyPrint v68+ Native PDF/X Support

**WeasyPrint v68+ can generate PDF/X directly** without Ghostscript conversion:

```bash
# RECOMMENDED: PDF/X-3 (preserves embedded fonts)
weasyprint \
  --base-url . \
  --pdf-variant pdf/x-3 \
  --dpi 300 \
  --full-fonts \
  input.html output.pdf

# NOT RECOMMENDED: PDF/X-1a (converts fonts to outlines - text becomes paths)
weasyprint --base-url . --pdf-variant pdf/x-1a --dpi 300 --full-fonts input.html output.pdf

# PDF/X-4 (supports transparency, but NOT accepted by DriveThruRPG)
weasyprint --pdf-variant pdf/x-4 input.html output.pdf
```

**Key CLI Options:**
| Option | Purpose |
|--------|---------|
| `--base-url .` | Resolve relative paths from current directory |
| `--pdf-variant pdf/x-3` | **Recommended** - preserves embedded fonts |
| `--pdf-variant pdf/x-1a` | Converts fonts to outlines (avoid unless required) |
| `--dpi 300` | Set max resolution for embedded images |
| `--full-fonts` | Embed complete font files (not subsetted) |

**DriveThruRPG Requirement:** Use `pdf/x-3` (preferred) or `pdf/x-1a`. PDF/X-4 is NOT accepted.

### CRITICAL: PDF/X Variant Font Behavior

| Variant | Font Handling | File Size | Recommendation |
|---------|---------------|-----------|----------------|
| **pdf/x-3** | ✅ Preserves embedded fonts | ~890 KB | **Use this** |
| **pdf/x-1a** | ❌ Converts to outlines | ~210 KB | Avoid (fonts become paths) |
| **pdf/x-4** | ✅ Preserves fonts | ~890 KB | Not accepted by DriveThruRPG |

**Why this matters:** PDF/X-1a converts all text to vector paths (outlines). This:
- Makes text non-searchable and non-selectable
- Can cause "mangled" appearance at certain zoom levels
- Increases file size for text-heavy documents
- May cause rendering issues in some PDF viewers

### CRITICAL: TAC Limiting Destroys Fonts

The TAC limiting process (`limit-tac.ts`) **rasterizes PDFs** - it converts pages to TIFF images, applies color transformation, then converts back to PDF. This destroys:
- All embedded fonts (text becomes raster images)
- Vector graphics
- Searchable/selectable text

**The pipeline now skips TAC limiting for WeasyPrint when TAC is already ≤240%** to preserve fonts. If TAC exceeds 240%, the user is warned that fonts will be lost.

### @color-profile CSS Rule for ICC Profiles

WeasyPrint v67+ supports the CSS `@color-profile` at-rule for custom ICC profiles:

```css
/* DriveThruRPG CMYK profile setup */
@color-profile device-cmyk {
  components: cyan, magenta, yellow, black;
  src: url("assets/CGATS21_CRPC1.icc");
}

/* K-only body text (recommended for small type - safest for TAC) */
body {
  color: device-cmyk(0% 0% 0% 100%);
}

/* TAC-safe rich black for large areas */
.dark-background {
  background-color: device-cmyk(50% 40% 40% 100%); /* 230% TAC */
}
```

**Rendering Intent Options:**
| Value | Use Case |
|-------|----------|
| `relative-colorimetric` | Best for most print work (preserves in-gamut colors) |
| `absolute-colorimetric` | Proofing (preserves exact colors) |
| `perceptual` | Photos with out-of-gamut colors |
| `saturation` | Business graphics, charts |

### TAC Management Best Practices

- **K-only for body text**: Use `device-cmyk(0% 0% 0% 100%)` for small type
- **Keep backgrounds mostly-K**: Avoid stacking heavy CMYK over CMYK
- **Watch image overlays**: Dark images over dark backgrounds stack TAC fast
- **TAC-safe rich black**: `device-cmyk(50% 40% 40% 100%)` = 230% TAC

### device-cmyk() Support Matrix

| Engine | device-cmyk() | Gradients with device-cmyk() | Native PDF/X | Font Preservation |
|--------|---------------|------------------------------|--------------|-------------------|
| PagedJS (Chromium) | ❌ No | ❌ No | ❌ No | N/A (uses Ghostscript) |
| Vivliostyle (Chromium) | ❌ No | ❌ No | ❌ No | N/A (uses Ghostscript) |
| WeasyPrint < v63 | ❌ No | ❌ No | ❌ No | N/A |
| WeasyPrint v68+ (pdf/x-3) | ✅ Yes | ❌ Crashes | ✅ Yes | ✅ **Fonts embedded** |
| WeasyPrint v68+ (pdf/x-1a) | ✅ Yes | ❌ Crashes | ✅ Yes | ❌ Fonts → outlines |

**TAC-Safe Rich Black Formula:**
```css
device-cmyk(0.5 0.4 0.4 1)
/* C:50 + M:40 + Y:40 + K:100 = 230% TAC */
```

### Theme Parameter

Build scripts now support `--theme` to control CSS concatenation:
```bash
# Use specific theme
bun run scripts/batch-process.ts --theme dark-theme

# Skip theme CSS
bun run scripts/batch-process.ts --theme none
```

### Ghostscript inkcov Measurement

**Warning:** Ghostscript's `inkcov` device converts ALL colors internally before measuring. This means:
- device-cmyk() values may report ~400% TAC despite being mathematically 230%
- This is a **measurement artifact**, not a compliance failure
- For device-cmyk() PDFs, use Adobe Preflight or print tests to verify actual TAC

### Key CSS Patterns

**Solid colors with device-cmyk() fallback:**
```css
body {
  background-color: #555555;                    /* RGB fallback */
  background-color: device-cmyk(0.5 0.4 0.4 1); /* TAC-safe if supported */
}
```

**Gradients (RGB only - device-cmyk() crashes WeasyPrint):**
```css
.gradient {
  background: linear-gradient(180deg, #1a1a1a 0%, #333333 100%);
  /* DO NOT use device-cmyk() in gradients */
}
```

### CSS Variables in @page Rules

**CSS variables do NOT work in @page rules.** Use hardcoded values:
```css
/* WRONG - variables ignored */
@page { background-color: var(--page-bg); }

/* CORRECT - hardcoded */
@page { background-color: device-cmyk(0.5 0.4 0.4 1); }
```

### Vivliostyle Background Limitation

**Critical:** Vivliostyle does NOT render @page or body backgrounds. This results in low TAC readings but missing content. Do not use Vivliostyle for dark-themed documents.

### Detailed Documentation

See these files for complete information:
- `docs/LEARNINGS.md` - Full session learnings with code examples
- `docs/PROJECT-KNOWLEDGE.md` - Comprehensive project reference
- `docs/TAC-VALIDATION-GUIDE.md` - TAC measurement and troubleshooting
