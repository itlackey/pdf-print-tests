# Key Learnings: PDF Rendering Engine Comparison

## Session 2026-01-20: Dark Theme & CMYK Color Handling

### Critical Discovery: device-cmyk() Support Is Extremely Limited

**Finding:** The CSS Color Level 4 `device-cmyk()` function has very limited support across rendering engines.

| Engine | device-cmyk() Support | Gradients with device-cmyk() |
|--------|----------------------|------------------------------|
| PagedJS (Chromium) | ❌ No | ❌ No |
| Vivliostyle (Chromium) | ❌ No | ❌ No |
| WeasyPrint < v63 | ❌ No | ❌ No |
| WeasyPrint v68+ | ✅ Yes | ❌ Crashes with NotImplementedError |

**Impact:** Cannot use `device-cmyk()` for TAC-controlled colors in Chromium-based engines. WeasyPrint v68+ supports it for solid colors only.

**Solution Pattern:**
```css
/* Always provide RGB fallback BEFORE device-cmyk() */
body {
  background-color: #555555;                    /* RGB fallback */
  background-color: device-cmyk(0.5 0.4 0.4 1); /* TAC-safe if supported */
}

/* For gradients, ONLY use RGB - device-cmyk() crashes WeasyPrint */
.gradient-bg {
  background: linear-gradient(180deg, #1a1a1a 0%, #333333 100%);
  /* DO NOT use device-cmyk() in gradients */
}
```

---

### Critical Discovery: Ghostscript inkcov Measures After Internal Conversion

**Finding:** The Ghostscript `inkcov` device measures TAC by first converting ALL content to CMYK internally. This means:

1. RGB colors are converted to CMYK using Ghostscript's default (or specified) ICC profile
2. Even `device-cmyk()` colors in the PDF may be converted again
3. Reported TAC reflects Ghostscript's color conversion, NOT necessarily the actual CMYK values in the PDF

**Impact:** A PDF with proper `device-cmyk(0.5 0.4 0.4 1)` (230% TAC) may still report ~400% TAC because Ghostscript converts it differently during measurement.

**Example Observed:**
```
Input: device-cmyk(0.5 0.4 0.4 1) = 230% TAC by definition
Ghostscript inkcov reports: ~398% TAC (4-plate rich black)
```

**Root Cause:** The `inkcov` device doesn't preserve device CMYK values - it processes all colors through its conversion pipeline.

**Workaround:** Consider validating actual CMYK values in the PDF using other tools (e.g., Adobe Preflight) rather than relying solely on Ghostscript inkcov for device-cmyk() content.

---

### Critical Discovery: Vivliostyle Does NOT Render @page or Body Backgrounds

**Finding:** Vivliostyle CLI does NOT render backgrounds set on `@page` or `body` elements. This results in very low TAC readings (17% vs 398%) because there's no actual background color in the output.

**Symptoms:**
- Vivliostyle PDFs show 11-17% TAC while PagedJS/WeasyPrint show 398% TAC
- Visual inspection confirms backgrounds are missing in Vivliostyle output
- Page count may differ (11 pages vs 16 pages)

**Impact:** Vivliostyle appears "TAC-compliant" but is actually missing content.

**Recommendation:** Do not use Vivliostyle for documents with dark backgrounds. Use WeasyPrint for production.

---

### The linkicc -k Flag Does NOT Limit TAC

**Finding:** The Little CMS `linkicc` tool's `-k` flag controls **K preservation (GCR - Gray Component Replacement)**, NOT TAC limiting.

**What -k does:** Preserves the black (K) channel during profile transformation
**What -k does NOT do:** Automatically reduce Total Area Coverage to 240%

**Impact:** Cannot use linkicc -k as a TAC limiting solution.

**Alternative:** Use an ICC profile with built-in TAC limits (e.g., CGATS21_CRPC1.icc which limits to ~300%) or manually adjust colors in source files.

---

### CSS Variables Do NOT Resolve in @page Rules

**Finding:** CSS custom properties (variables) do not work in `@page` rules across all tested engines.

**Broken:**
```css
:root {
  --page-bg: device-cmyk(0.5 0.4 0.4 1);
}
@page {
  background-color: var(--page-bg); /* IGNORED - no variable resolution */
}
```

**Working:**
```css
@page {
  background-color: device-cmyk(0.5 0.4 0.4 1); /* Hardcoded required */
}
```

**Impact:** Cannot use variables to manage colors in @page rules. Must use hardcoded values.

---

### WeasyPrint Gradient Crash with device-cmyk()

**Finding:** WeasyPrint v68+ crashes with `NotImplementedError` when `device-cmyk()` is used inside CSS gradients.

**Error:**
```
NotImplementedError: ... in tinycss2/color4.py
```

**Cause:** tinycss2 tries to convert device-cmyk() to sRGB for gradient processing but device-cmyk() cannot be reliably converted.

**Solution:**
```css
/* WRONG - crashes WeasyPrint */
.bg {
  background: linear-gradient(180deg, device-cmyk(0 0 0 1) 0%, device-cmyk(0.5 0.4 0.4 1) 100%);
}

/* CORRECT - use RGB fallback for gradients */
.bg {
  background: linear-gradient(180deg, #000000 0%, #333333 100%);
}
```

---

### Any Dark RGB Color Converts to ~400% TAC Rich Black

**Finding:** Ghostscript's default RGB→CMYK conversion converts ANY dark color (including pure black #000000) to a 4-plate rich black with ~400% TAC.

**Colors Tested:**
| RGB Input | Ghostscript TAC Output |
|-----------|------------------------|
| #000000 (pure black) | ~399% TAC |
| #1a1a1a (near-black) | ~398% TAC |
| #333333 (dark gray) | ~398% TAC |
| #555555 (medium gray) | ~398% TAC |

**Impact:** Cannot achieve low TAC with dark backgrounds using RGB colors - they all convert to high-TAC rich black.

**Solution:** Use very light colors (e.g., #d0dce8 = ~40-80% TAC) or use device-cmyk() with WeasyPrint.

---

### Dimm City Field Guide TAC Solution

**Finding:** The Dimm City Field Guide project solved TAC compliance by using:

```css
device-cmyk(0.5 0.4 0.4 1)
/* C:50 + M:40 + Y:40 + K:100 = 230% TAC */
```

This is a "TAC-safe rich black" that:
1. Produces a deep, rich black appearance
2. Stays within the 240% TAC limit
3. Avoids the ~400% TAC that Ghostscript generates from RGB black

**Required:** WeasyPrint v67+ (not Chromium-based engines)

---

### WeasyPrint v67+ Native PDF/X Generation

**Finding:** WeasyPrint v67 added native PDF/X generation, eliminating the need for Ghostscript conversion.

**DriveThruRPG-Ready Command:**
```bash
weasyprint \
  --base-url . \
  --pdf-variant pdf/x-1a \
  --dpi 300 \
  --full-fonts \
  book.html interior.pdf
```

**Key Options Discovered:**
| Option | Purpose |
|--------|---------|
| `--base-url .` | Resolve relative paths from current directory |
| `--pdf-variant pdf/x-1a` | DriveThruRPG-compatible PDF/X |
| `--dpi 300` | Print-quality image resolution |
| `--full-fonts` | Embed complete fonts (not subsetted) |

**Benefits:**
1. **Preserves device-cmyk() colors**: No double-conversion through Ghostscript
2. **No TAC measurement artifacts**: device-cmyk() colors stay as specified
3. **Simpler pipeline**: One command instead of two
4. **Smaller files**: Direct generation is more efficient

**Critical DriveThruRPG Finding:**
| Variant | DriveThruRPG Status |
|---------|---------------------|
| `pdf/x-1a` | ✅ Accepted (but see font warning below) |
| `pdf/x-3` | ✅ **Recommended** (preserves fonts) |
| `pdf/x-4` | ❌ **NOT accepted** |
| `pdf/x-5g` | ❌ Not accepted |

**Impact:** Despite PDF/X-4 being preferred for modern print workflows, DriveThruRPG explicitly requires PDF/X-1a or PDF/X-3.

---

### CRITICAL: PDF/X-1a Converts Fonts to Outlines

**Finding:** WeasyPrint's `--pdf-variant pdf/x-1a` converts ALL fonts to vector outlines (paths). This destroys searchable/selectable text.

**Symptoms:**
- Fonts appear "mangled" or rough at certain zoom levels
- Text is not searchable in PDF viewer
- Text cannot be selected or copied
- `pdffonts output.pdf` shows 0 embedded fonts

**Font Preservation by PDF/X Variant:**
| Variant | Font Handling | File Size | Recommendation |
|---------|---------------|-----------|----------------|
| **pdf/x-3** | ✅ Fonts embedded | ~890 KB | **Use this** |
| **pdf/x-1a** | ❌ Fonts → outlines | ~210 KB | Avoid |
| **pdf/x-4** | ✅ Fonts embedded | ~890 KB | Not accepted by DriveThruRPG |

**Solution:**
```bash
# CORRECT - preserves fonts
weasyprint --pdf-variant pdf/x-3 --full-fonts input.html output.pdf

# WRONG - converts fonts to outlines
weasyprint --pdf-variant pdf/x-1a --full-fonts input.html output.pdf
```

**Impact:** Always use `pdf/x-3` for WeasyPrint output. DriveThruRPG accepts both variants.

---

### CRITICAL: TAC Limiting Rasterizes PDFs (Destroys Fonts)

**Finding:** The TAC limiting process (`limit-tac.ts`) uses a TIFF pipeline that **rasterizes all PDF content**. This destroys:
- All embedded fonts (text becomes raster images)
- Vector graphics (become raster images)
- Searchable/selectable text

**How it works:**
1. PDF pages → TIFF images (rasterization)
2. Apply ICC profile to limit TAC
3. TIFF images → PDF pages (re-assembly)

**Symptoms after TAC limiting:**
- `pdffonts output.pdf` shows 0 fonts
- Text appears pixelated at high zoom
- File size may be larger or smaller depending on content
- PDF is essentially a "scanned document"

**Solution:** Skip TAC limiting when TAC is already ≤240%. The pipeline now automatically:
1. Checks TAC before limiting
2. If TAC ≤ 240%: Copies original (preserves fonts)
3. If TAC > 240%: Applies limiting (warns about font loss)

**Best Practice:** Design for TAC compliance from the start using `device-cmyk()` colors to avoid needing TAC limiting.

---

### K-Only Text for TAC Safety

**Finding:** Using K-only (black only) for body text is the safest approach for TAC compliance.

```css
body {
  color: device-cmyk(0% 0% 0% 100%); /* Pure K = 100% TAC */
}
```

**Benefits:**
1. **Lowest possible TAC** for text content
2. **Sharper text rendering** (single plate alignment)
3. **Reduces TAC headroom** used by text, leaving more for images/backgrounds

**When to use rich black vs K-only:**
| Content | Recommended |
|---------|-------------|
| Body text (small type) | K-only: `device-cmyk(0% 0% 0% 100%)` |
| Large headlines | K-only or TAC-safe rich black |
| Large solid backgrounds | TAC-safe rich black: `device-cmyk(50% 40% 40% 100%)` |

---

### DriveThruRPG Common Failure Points

**Finding:** 90% of DriveThruRPG upload failures are caused by these issues:

1. **Page size doesn't include bleed**
   - For 6×9 trim: final must be **6.125" × 9.25"** (not 6.25" × 9.25")
   - Bleed is 0.125" on outside 3 edges only

2. **RGB colors in the PDF**
   - Use `device-cmyk()` for all CSS colors
   - Define `@color-profile device-cmyk { src: url(ICC); }`

3. **TAC exceeds 240%**
   - Use K-only text
   - Keep backgrounds mostly-K
   - Avoid heavy image overlays on dark backgrounds

4. **Fonts not properly embedded**
   - Use `--full-fonts` flag
   - Verify with `pdffonts output.pdf`

5. **Wrong PDF/X variant**
   - Use `pdf/x-1a` (not pdf/x-4)
   - DriveThru explicitly requires X-1a or X-3

---

### @color-profile CSS Rule for ICC Profiles (v67+)

**Finding:** WeasyPrint v67+ supports the CSS `@color-profile` at-rule for custom ICC profiles with rendering intents.

**Usage:**
```css
@color-profile device-cmyk {
  src: url("CGATS21_CRPC1.icc");
  rendering-intent: relative-colorimetric;
}

body {
  background-color: device-cmyk(0.5 0.4 0.4 1);
}
```

**Rendering Intents:**
| Intent | Best For |
|--------|----------|
| `relative-colorimetric` | General print (preserves in-gamut colors) |
| `absolute-colorimetric` | Proofing (exact colors) |
| `perceptual` | Photos with out-of-gamut colors |
| `saturation` | Business graphics, charts |

**Impact:** Full control over color conversion without Ghostscript, including TAC-limiting ICC profiles.

---

### Theme Parameter for Build Scripts

**Finding:** The build scripts (PagedJS, Vivliostyle, WeasyPrint) now support a `--theme` parameter to control which theme CSS is concatenated.

**Usage:**
```bash
# Use dark-theme (or any custom theme)
bun run scripts/batch-process.ts --theme dark-theme

# Skip theme CSS entirely
bun run scripts/batch-process.ts --theme none

# Default behavior (kitchen-sink theme)
bun run scripts/batch-process.ts
```

**Impact:** Allows testing dark themes without kitchen-sink.css overriding backgrounds with white.

---

## Most Valuable Insights

### 1. Silent Failures Are More Dangerous Than Obvious Ones
**Learning:** Vivliostyle's blank page bug is more dangerous than PagedJS's build failure because it silently loses content without warning. A failed build is obvious; missing content pages might not be caught until after printing.

**Impact:** Always prefer fail-fast approaches over silent degradation.

**Application:** Add validation that checks for blank pages after rendering, measure content density per page, alert if below threshold.

---

### 2. PDF/X Conversion Introduces New Failure Modes
**Learning:** Both renderers produced acceptable RGB PDFs, but Ghostscript PDF/X conversion revealed issues:
- Font embedding can fail during conversion (PagedJS: 42 fonts → 0 fonts)
- Color space conversion dramatically increases file size (5-6× larger)
- TAC issues only become apparent after CMYK conversion

**Impact:** Testing must include the full pipeline, not just initial PDF generation.

**Application:** Always validate the final PDF/X output, not just intermediate RGB PDFs.

---

### 3. Each Rendering Engine Has Incompatible CSS Feature Support
**Learning:** Specific CSS features trigger failures in one engine but not the other:
- Vivliostyle: Multi-column layouts, Flexbox, complex backgrounds cause blank pages
- PagedJS: Some page sizing configurations cause complete build failures
- Both handle basic typography and simple layouts well

**Impact:** "Write once, run anywhere" doesn't work for CSS Paged Media. Need engine-specific workarounds.

**Application:**
- Maintain compatibility matrices for CSS features per engine
- Create engine-specific CSS overrides when needed
- Test all advanced CSS features in both engines before using in production

---

### 4. Running Headers Are Not Automatic
**Learning:** PagedJS does not automatically generate running headers from content, while Vivliostyle does. This is a fundamental architectural difference, not a bug.

**Impact:** Document structure and CSS must explicitly define running header behavior for each engine.

**Application:** Use `@page` margin boxes with `string-set` and `content: string()` to explicitly define running headers in CSS, ensuring consistency across engines.

---

### 5. Visual Regression Testing Is Essential
**Learning:** 59% of pages had visual differences between engines, most of which would not be caught by validation tools (pdfinfo, pdffonts). Only pixel-level comparison revealed the extent of the problems.

**Impact:** Automated visual comparison must be part of the build pipeline.

**Application:**
- Screenshot every page at 300 DPI
- Run ImageMagick pixel comparison
- Set threshold for acceptable differences
- Fail build if critical pages differ beyond threshold

---

### 6. TAC (Ink Coverage) Is a Hidden Compliance Killer
**Learning:** Both engines passed structural PDF/X validation but failed DriveThruRPG requirements due to excessive ink coverage (400% vs 240% limit). Standard PDF tools don't check TAC by default.

**Impact:** Must explicitly calculate and validate TAC for print compliance.

**Application:**
- Add Ghostscript TAC calculation to validation pipeline
- Warn on pages >200% TAC
- Fail build on pages >240% TAC
- Provide color reduction recommendations

---

### 7. Page Dimensions Must Be Explicitly Configured for Bleed
**Learning:** Vivliostyle rendered book.html at wrong dimensions (7.52" × 10.52" instead of 6.25" × 9.25"). The CSS or CLI configuration didn't properly specify trim + bleed.

**Impact:** Page size configuration is fragile and engine-specific.

**Application:**
- Always specify page size in multiple places: CSS `@page` size, CLI flags, and HTML meta
- Validate output page dimensions match expected size ±2%
- Document exact page size calculation: `trim_width + (2 × bleed)` for final size

---

### 8. File Size Variance Indicates Different Rendering Approaches
**Learning:** PagedJS PDF/X files were 4.6× larger than Vivliostyle for identical content. This suggests fundamentally different rendering approaches:
- PagedJS may be embedding full images/resources repeatedly
- Vivliostyle likely using more efficient PDF compression
- Neither is obviously "wrong," but has storage/bandwidth implications

**Impact:** File size affects upload times, storage costs, and user experience.

**Application:**
- Monitor file size as a quality metric
- Investigate compression settings for outliers
- Consider file size when choosing rendering engine for large documents

---

### 9. Font Subsetting Behavior Differs Between Engines
**Learning:** After PDF/X conversion:
- PagedJS: 0 fonts embedded (critical failure)
- Vivliostyle: 19 fonts embedded (proper subsetting)

Both had all fonts embedded in RGB versions, so the issue is in how they interact with Ghostscript during PDF/X conversion.

**Impact:** Font embedding can silently fail during format conversion.

**Application:**
- Always validate font embedding in final output
- Test PDF/X conversion with multiple font types
- Consider pre-subsetting fonts before PDF generation

---

### 10. Different Engines Need Different Fallback Strategies
**Learning:** No single rendering engine handles all use cases:
- PagedJS: Better for simple documents, fails on complex layouts
- Vivliostyle: Better for standards compliance, has critical blank page bug

**Impact:** Need fallback strategy and ability to switch engines per document type.

**Application:**
- Design system to support multiple rendering engines
- Use feature detection to choose appropriate engine
- Maintain engine-specific CSS overrides
- Test critical documents with both engines

---

## Architectural Insights

### CSS Paged Media Is Not Standardized Enough
Despite both engines claiming CSS Paged Media support, implementations differ significantly. The spec has ambiguity, and real-world rendering varies.

**Recommendation:** Treat CSS Paged Media like early browser CSS - need vendor prefixes, feature detection, and graceful degradation.

---

### Ghostscript Is a Critical Dependency
PDF/X conversion via Ghostscript introduced more failures than the rendering engines themselves. It's a necessary but fragile part of the pipeline.

**Recommendation:**
- Lock Ghostscript version
- Test new Ghostscript releases before upgrading
- Consider alternative PDF/X conversion tools as backup

---

### Print Validation Requires Domain-Specific Tools
Generic PDF validation tools (pdfinfo, pdffonts) don't check print-specific requirements like TAC, bleed, trim marks. Need specialized tools or custom validation.

**Recommendation:**
- Build custom validation combining multiple tools
- Include print service requirements (DriveThruRPG, etc.) in validation
- Generate preflight reports for every build

---

## Testing Strategy Refinements

### What to Test

1. **Visual Output** (most important)
   - Pixel-perfect screenshot comparison
   - Check for blank pages
   - Verify content didn't shift between pages

2. **Print Compliance**
   - TAC on every page
   - Page dimensions (trim + bleed)
   - Font embedding
   - Color space (CMYK)
   - PDF version compliance

3. **Build Reliability**
   - Success/failure rate across different HTML inputs
   - Error message quality
   - Graceful degradation

4. **File Quality**
   - File size trends
   - Font subsetting correctness
   - Image compression ratios

### What NOT to Rely On

1. ❌ Build success alone (doesn't mean output is correct)
2. ❌ PDF structure validation alone (doesn't catch visual issues)
3. ❌ Single engine testing (need comparison to detect issues)
4. ❌ RGB PDF validation (must test final PDF/X output)

---

## Implementation Patterns

### Pattern: Engine-Specific CSS Organization

```
styles/
  ├── common.css           # Shared styles
  ├── pagedjs.css         # PagedJS-specific overrides
  ├── vivliostyle.css     # Vivliostyle-specific overrides
  └── print-base.css      # Print-specific base styles
```

Load order:
1. print-base.css (foundational print styles)
2. common.css (shared document styles)
3. {engine}.css (engine-specific overrides)

### Pattern: Feature Detection & Fallbacks

```css
/* Common: try advanced feature */
.multi-column {
  column-count: 2;
  column-gap: 0.25in;
}

/* PagedJS override: fallback to simpler layout if multi-column fails */
/* (loaded conditionally via build script) */
```

### Pattern: Validation Pipeline

```
1. Render → RGB PDF
2. Validate RGB structure
3. Convert → PDF/X
4. Validate PDF/X compliance
5. Generate screenshots
6. Visual comparison
7. TAC analysis
8. Generate report
9. Pass/Fail decision
```

---

## Risk Assessment

### High-Risk Areas
1. ✅ Multi-column layouts (Vivliostyle blank page bug)
2. ✅ Flexbox in paged context (Vivliostyle blank page bug)
3. ✅ Complex backgrounds (blank page bug, TAC issues)
4. ✅ Custom page sizes (PagedJS build failures)
5. ✅ Font embedding through PDF/X conversion

### Low-Risk Areas
1. ✅ Basic typography
2. ✅ Simple tables
3. ✅ Standard page sizes (letter, A4)
4. ✅ Single-column text
5. ✅ Basic images

---

## Recommended Next Steps

### Immediate (Fix Critical Bugs)
1. Debug Vivliostyle blank page issue (multi-column, flexbox triggers)
2. Debug PagedJS book.html build failure
3. Fix font embedding in PagedJS PDF/X pipeline
4. Correct page dimensions configuration for book example

### Short-term (Improve Tooling)
1. Add TAC validation to build pipeline
2. Implement visual regression testing
3. Create engine-specific CSS override system
4. Add preflight validation report generation

### Long-term (Architectural)
1. Build engine selection logic (choose best engine per document)
2. Create CSS feature compatibility matrix
3. Implement automated fallback strategies
4. Add monitoring/alerting for production builds

---

## Success Metrics

### Build Quality
- ✅ 0% blank pages in output
- ✅ <5% visual difference between engines for same input
- ✅ 100% font embedding success rate
- ✅ <240% TAC on all pages

### Reliability
- ✅ >95% build success rate
- ✅ <1% silent failures (build succeeds but output wrong)
- ✅ All failures detected before PDF/X conversion

### Performance
- ✅ <30s build time for 50-page document
- ✅ <10MB file size for typical 100-page book
- ✅ <2s validation pipeline per PDF

---

## Knowledge Gaps to Investigate

1. **Why does Vivliostyle produce blank pages for specific CSS features?**
   - Is it a JavaScript exception being swallowed?
   - Page break calculation bug?
   - Memory/resource issue?

2. **Why does PagedJS font embedding fail during PDF/X conversion?**
   - Ghostscript configuration issue?
   - Font format incompatibility?
   - PDF structure problem?

3. **What triggers PagedJS build failures?**
   - Specific CSS properties?
   - Page size calculations?
   - Resource loading issues?

4. **Can we predict which CSS features will fail in each engine?**
   - Pattern analysis of failures
   - Feature compatibility testing
   - Create automated feature detection

---

## Conclusion

The most valuable learning: **CSS Paged Media rendering is still immature technology**. Both engines have critical bugs, neither is production-ready without extensive testing and workarounds. Success requires:

1. **Defense in depth:** Multiple validation layers
2. **Visual verification:** Can't trust structure validation alone
3. **Engine-specific CSS:** Treat engines like browser vendors
4. **Comprehensive testing:** Test full pipeline, not just components
5. **Fallback strategies:** No single engine handles all cases

Print PDF generation is closer to "compiler engineering" than "web development" - it requires the same rigor as building critical systems.
