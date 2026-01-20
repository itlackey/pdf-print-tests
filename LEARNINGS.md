# Key Learnings: PDF Rendering Engine Comparison

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
