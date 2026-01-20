# PDF Rendering Issues - Visual Review Report

**Date:** 2026-01-20
**Test Examples:** Kitchen Sink (29 pages) & Book (7 pages)
**Renderers:** PagedJS CLI vs Vivliostyle CLI
**Review Method:** Visual inspection of page-by-page screenshots

---

## Executive Summary

Visual review of both test examples reveals critical rendering failures in both PagedJS and Vivliostyle:

- **Vivliostyle**: 8 of 29 pages (28%) render completely blank in kitchen-sink example
- **PagedJS**: Complete build failure on book.html example (exit code 1)
- **Both**: Excessive ink coverage (TAC > 240%) on title pages
- **17 of 29 pages** show visual differences between renderers

---

## Critical Issues

### 🔴 **Issue #1: Vivliostyle Blank Page Rendering Bug**

**Severity:** CRITICAL
**Affected:** Kitchen Sink example
**Impact:** Complete content loss on multiple pages

**Blank/Nearly Blank Pages:**
- Page 6 - "3. Counters & Generated Content"
- Page 9 - "5. Multi-column Layout"
- Page 11 - "6. CSS Fragmentation" (Page Floats section)
- Page 15 - "9. CSS Flexbox"
- Page 16 - Flexbox continued
- Page 21 - "13.4 Hyphenation" / "13.5 Line Breaking"
- Page 22 - "14. CSS Backgrounds & Borders"
- Page 25 - "18. CSS Clip & Mask"

**Pattern:** Pages only show running header at top and page number at bottom, with completely blank content area.

**PagedJS Comparison:** All these pages render correctly with full content in PagedJS.

---

### 🔴 **Issue #2: PagedJS Complete Build Failure**

**Severity:** CRITICAL
**Affected:** Book example (input/book.html)
**Impact:** No PDF output generated

**Details:**
- Build exits with code 1
- No error messages captured in output
- No pagedjs-output.pdf created
- Vivliostyle successfully builds the same file (7 pages, 270 KB)

**Error Message:**
```
PagedJS build: Failed with exit code 1
```

---

### 🔴 **Issue #3: Incorrect Page Dimensions**

**Severity:** CRITICAL
**Affected:** Book example (Vivliostyle)
**Impact:** Fails DriveThruRPG compliance

**Expected:** 6.25" × 9.25" (6" × 9" trim + 0.125" bleed)
**Actual:** 7.524" × 10.524"
**Error:** +20% width, +14% height

**Compliance Result:** ❌ Page dimensions check failed

---

## Page Layout Issues

### Missing Running Headers (PagedJS)

**Severity:** HIGH
**Affected:** Kitchen Sink example, all interior pages

**Observed Behavior:**
- PagedJS: No running headers on any page (only page numbers)
- Vivliostyle: Correct running header "Vivliostyle Kitchen Sink - Feature Verification Test" on all pages

**Visual Comparison:**
- Page 2 PagedJS: No header, content starts higher on page
- Page 2 Vivliostyle: Full running header present

**Impact:** Reduces document navigability and professional appearance

---

### Content Positioning & Spacing Differences

**Severity:** MEDIUM
**Affected:** Multiple pages in Kitchen Sink

**Page 2 - CSS Values:**
- RGBA color box cut off at different positions
- In PagedJS: Shows partial "RGBA" text
- In Vivliostyle: Different clipping with "transparent" text visible

**Page 4 - CSS Selectors:**
- Different text wrapping in ::first-line demonstration
- PagedJS: Text flows differently in the blue highlighted paragraph
- Line breaks occur at different word boundaries

**Page 5 - CSS Selectors:**
- Different vertical spacing between sections
- PagedJS section header: "Selectors" (right-aligned)
- Vivliostyle section header: "CSS Selectors" (right-aligned)
- Content vertical alignment differs by ~1-2 lines

---

## Font & Typography Issues

### Font Embedding Failure in PDF/X Conversion

**Severity:** HIGH
**Affected:** Kitchen Sink PagedJS PDF/X output

**Details:**
- RGB PDF (pagedjs-output.pdf): 42 fonts, all embedded ✅
- PDF/X PDF (pagedjs-pdfx.pdf): 0 fonts embedded ❌

**Vivliostyle Comparison:**
- RGB PDF: 31 fonts, all embedded ✅
- PDF/X PDF: 19 fonts, all embedded ✅

**Impact:**
- Potential text rendering issues when printed
- May fail DriveThruRPG font validation
- Text may substitute with system fonts

---

## Color & Print Compliance Issues

### Excessive Total Area Coverage (TAC)

**Severity:** HIGH
**Affected:** Both renderers, multiple pages
**Limit:** 240% TAC (DriveThruRPG requirement)

**Kitchen Sink - Page 1 (Title Page):**
- PagedJS: 400.0% TAC ❌ (+167% over limit)
- Vivliostyle: 400.0% TAC ❌ (+167% over limit)

**Book - Page 1:**
- Vivliostyle: 297.9% TAC ❌ (+24% over limit)

**Other Affected Pages (Kitchen Sink):**
- Multiple interior pages exceed recommended limits
- Worst offenders: Pages with full-page backgrounds

**Impact:**
- Ink saturation issues during printing
- Longer drying times
- Potential color bleeding
- May be rejected by DriveThruRPG print service

---

### Dramatic TAC Variance Between Renderers

**Severity:** MEDIUM
**Pattern:** Pages rendered blank in Vivliostyle show near-zero TAC

**Examples:**
| Page | Section | PagedJS TAC | Vivliostyle TAC | Notes |
|------|---------|-------------|-----------------|-------|
| 3 | CSS Selectors | 94.5% | 43.5% | -51% difference |
| 6 | Counters | 89.8% | 0.4% | Blank page bug |
| 8 | Multi-column | 78.6% | 4.8% | Partial rendering |
| 9 | Multi-column | 129.8% | 0.1% | Blank page bug |
| 10 | Multi-column | 77.6% | 0.4% | Blank page bug |
| 11 | Fragmentation | 119.9% | 0.1% | Blank page bug |
| 15 | Flexbox | 157.3% | 0.1% | Blank page bug |
| 21 | Typography | 103.6% | 0.2% | Blank page bug |
| 22 | Backgrounds | 128.9% | 0.4% | Blank page bug |
| 23 | Backgrounds | 121.2% | 0.1% | Partial rendering |
| 24 | Backgrounds | 118.8% | 0.4% | Partial rendering |
| 25 | Clip/Mask | 98.9% | 0.2% | Blank page bug |

**Analysis:** Near-zero TAC readings correlate with blank page rendering bug, confirming content is not being painted.

---

## File Size Issues

### Large File Size Variance

**Severity:** LOW
**Pattern:** PagedJS produces significantly larger PDF/X files

**Kitchen Sink Example:**

| Renderer | RGB Size | PDF/X Size | Increase | Ratio |
|----------|----------|------------|----------|-------|
| PagedJS | 1390.1 KB | 8139.7 KB | +6750 KB | 5.8× |
| Vivliostyle | 260.3 KB | 1750.6 KB | +1490 KB | 6.7× |

**Comparison:**
- PagedJS PDF/X is **4.6× larger** than Vivliostyle PDF/X
- Both show large increases during PDF/X conversion (CMYK color space conversion)

**Impact:**
- Slower upload/download times
- Increased storage requirements
- May exceed DriveThruRPG file size limits for some products

---

## Visual Comparison Statistics

### Kitchen Sink Example (29 pages)

**Pages with Visual Differences:** 17 out of 29 (59%)

**Affected Pages:**
1, 2, 4, 5, 6, 9, 10, 11, 13, 15, 16, 19, 21, 22, 23, 24, 25

**Pixel Difference Counts (ImageMagick):**
- Page 1: 27,679 pixels differ (minor differences)
- Page 2: 522,068 pixels differ
- Page 4: 668,073 pixels differ
- Page 5: 808,782 pixels differ
- Page 6: 982,469 pixels differ (blank page)
- Page 9: 983,284 pixels differ (blank page)
- Page 10: 981,618 pixels differ (blank page)
- Page 11: 983,108 pixels differ (blank page)

**Pattern:** Pages with 980k+ pixel differences correspond to blank page rendering bug.

---

## Detailed Page-by-Page Findings

### Page 1 - Title Page
- **Both renderers:** Nearly identical rendering
- **Issue:** Excessive TAC (400%) in both
- **Differences:** 27,679 pixels differ (likely font rendering)

### Page 2 - CSS Values
- **Running header:** Missing in PagedJS ❌
- **RGBA box:** Clipped differently between renderers
- **Content positioning:** Vivliostyle content sits lower due to header

### Page 4 - CSS Selectors
- **Text wrapping:** Different line breaks in ::first-line paragraph
- **Content overflow:** Text wraps at different word boundaries

### Page 5 - CSS Selectors (continued)
- **Spacing:** Different vertical spacing between sections
- **Alignment:** Section headers aligned differently

### Page 6 - Counters & Generated Content
- **PagedJS:** Full content rendered ✅
- **Vivliostyle:** Completely blank ❌ (CRITICAL BUG)

### Page 9 - Multi-column Layout
- **PagedJS:** Two-column layout with rules ✅
- **Vivliostyle:** Completely blank ❌ (CRITICAL BUG)

### Page 11 - CSS Fragmentation
- **PagedJS:** Break properties and examples ✅
- **Vivliostyle:** Completely blank ❌ (CRITICAL BUG)

### Page 15 - CSS Flexbox
- **PagedJS:** Flexbox containers and direction examples ✅
- **Vivliostyle:** Completely blank ❌ (CRITICAL BUG)

### Page 16 - Flexbox (continued)
- **PagedJS:** Flex-grow examples visible ✅
- **Vivliostyle:** Completely blank ❌ (CRITICAL BUG)

### Page 21 - Typography/Hyphenation
- **PagedJS:** Hyphenation and line-breaking examples ✅
- **Vivliostyle:** Completely blank ❌ (CRITICAL BUG)

### Page 22 - CSS Backgrounds & Borders
- **PagedJS:** Background gradients, borders, shadows ✅
- **Vivliostyle:** Completely blank ❌ (CRITICAL BUG)

### Page 25 - Clip & Mask
- **PagedJS:** Clipping examples (partial content at top) ✅
- **Vivliostyle:** Completely blank ❌ (CRITICAL BUG)

---

## Recommendations

### Immediate Actions Required

1. **Vivliostyle Blank Page Bug (CRITICAL)**
   - Investigate why specific CSS features cause complete content loss
   - Test correlation with multi-column, flexbox, and complex layout properties
   - Check if issue is specific to page-break boundaries
   - Review console/error logs for JavaScript exceptions

2. **PagedJS Book Build Failure (CRITICAL)**
   - Enable verbose logging to capture error details
   - Test with simpler HTML to isolate failing component
   - Check if issue is related to page size configuration
   - Verify all dependencies are properly installed

3. **Font Embedding in PDF/X (HIGH)**
   - Review Ghostscript conversion settings for PagedJS
   - Ensure font subsetting is enabled
   - Verify font license allows embedding
   - Test with different PDF/X profiles (PDF/X-1a vs PDF/X-3)

4. **Page Dimensions (CRITICAL)**
   - Review @page size rules in book.html CSS
   - Ensure bleed settings are properly configured
   - Verify Vivliostyle CLI --size parameter
   - Test with explicit page dimensions

### Color/Print Issues

5. **Reduce TAC on Title Pages**
   - Reduce saturation on dark backgrounds
   - Use ICC profiles optimized for lower ink coverage
   - Consider using rich black (C40 M40 Y40 K100) instead of pure black
   - Limit background color density

6. **Add TAC Validation**
   - Add pre-flight check that fails builds exceeding 240% TAC
   - Generate warnings for pages approaching limit
   - Provide recommendations for color reduction

### Testing & Monitoring

7. **Expand Visual Regression Tests**
   - Add automated screenshot comparison to CI/CD
   - Set pixel difference thresholds for pass/fail
   - Create test suite covering all CSS features
   - Test each renderer with identical configurations

8. **Add Compliance Checks**
   - Validate page dimensions before PDF/X conversion
   - Check font embedding in final PDF
   - Verify TAC limits on all pages
   - Test with DriveThruRPG preflight tool

---

## Technical Details

### Test Environment

**System:**
- OS: Linux 6.8.0-90-generic
- Dependencies: Ghostscript 9.55.0, Poppler, ImageMagick

**Renderers:**
- PagedJS CLI: 0.4.3
- Vivliostyle CLI: 10.3.0

**Test Files:**
- Kitchen Sink: examples/kitchen-sink.html (29 pages)
- Book: input/book.html (7 pages)

**Output Locations:**
- Kitchen Sink: output/kitchen-sink/
- Book: output/default-test/

### Validation Tools

- pdfinfo: Page dimensions, PDF version
- pdffonts: Font embedding analysis
- Ghostscript: TAC calculation, PDF/X conversion
- pdftoppm: Screenshot generation (300 DPI PNG)
- ImageMagick compare: Pixel-level difference detection

---

## Appendix: Test Results Summary

### Kitchen Sink Example

| Metric | PagedJS | Vivliostyle | Status |
|--------|---------|-------------|--------|
| Build Success | ✅ Yes | ✅ Yes | Both pass |
| PDF/X Conversion | ✅ Yes | ✅ Yes | Both pass |
| DriveThruRPG Compliant | ✅ Yes | ✅ Yes | Both pass |
| Compliance Score | 8/10 | 8/10 | Equivalent |
| Page Count | 29 | 29 | ✅ Same |
| Page Dimensions | 6.25" × 9.25" | 6.25" × 9.25" | ✅ Same |
| Fonts Embedded (PDF/X) | 0/0 ❌ | 19/19 ✅ | Vivliostyle better |
| Max TAC | 400.0% ❌ | 400.0% ❌ | Both fail |
| File Size (PDF/X) | 8140 KB | 1751 KB | Vivliostyle smaller |
| Blank Pages | 0 ✅ | 8 ❌ | PagedJS better |
| Visual Differences | - | 17 pages | 59% differ |

### Book Example

| Metric | PagedJS | Vivliostyle | Status |
|--------|---------|-------------|--------|
| Build Success | ❌ No | ✅ Yes | Vivliostyle only |
| PDF/X Conversion | - | ✅ Yes | Vivliostyle only |
| DriveThruRPG Compliant | - | ❌ No | Failed dims |
| Compliance Score | 0/10 | 3/10 | Both fail |
| Page Count | - | 7 | - |
| Page Dimensions | - | 7.52" × 10.52" ❌ | Wrong size |
| Fonts Embedded (PDF/X) | - | 8/8 ✅ | - |
| Max TAC | - | 297.9% ❌ | Over limit |

---

## Conclusion

Both renderers have critical issues that prevent production use:

**Vivliostyle:**
- ✅ Successfully builds both examples
- ✅ Proper font embedding
- ✅ Smaller file sizes
- ❌ **CRITICAL:** 28% of pages render blank
- ❌ Wrong page dimensions on book example
- ❌ Excessive TAC on title pages

**PagedJS:**
- ✅ No blank page issues
- ✅ Correct page dimensions
- ❌ **CRITICAL:** Complete build failure on book example
- ❌ Font embedding failure in PDF/X
- ❌ Large file sizes (4.6× larger)
- ❌ Missing running headers
- ❌ Excessive TAC on title pages

**Recommendation:** Neither renderer is production-ready without addressing critical bugs. Vivliostyle's blank page bug is more severe due to silent content loss, while PagedJS's build failure is at least obvious and prevents bad output.
