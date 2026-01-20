# TAC Validation Quick Reference Guide

## What is TAC?

**TAC (Total Area Coverage)** is the sum of all ink percentages (Cyan + Magenta + Yellow + Black) on a printed page.

- **DriveThruRPG Limit:** ≤240% TAC
- **Safe Zone:** ≤200% TAC
- **Warning Zone:** 200-240% TAC
- **Fail Zone:** >240% TAC

## Quick Start

### Validate a Single PDF
```bash
# Standard validation report
bun run scripts/validate-tac.ts path/to/file.pdf

# JSON output (for scripting)
bun run scripts/validate-tac.ts path/to/file.pdf --json

# Quiet mode (summary only)
bun run scripts/validate-tac.ts path/to/file.pdf --quiet
```

### Run Full Pipeline with TAC Validation
```bash
# Full pipeline (includes TAC validation)
bun run scripts/run-all.ts

# Skip builds, just validate existing PDFs
bun run scripts/run-all.ts --skip-pagedjs --skip-vivliostyle
```

### View TAC Results
```bash
# Check batch summary
cat output/batch-summary.md

# View detailed comparison report
cat output/default-test/comparison-report.md
```

## Understanding TAC Output

### Console Output
```
🔍 Checking PagedJS PDF/X...
   ❌ Failed: 1 page(s) exceed 240% TAC limit (max: 397.1%)
   📄 Pages over limit: 1
   💡 Use CGATS21_CRPC1.icc profile for color conversion
```

### Status Indicators
- ✅ **Pass:** All pages ≤200% TAC (safe)
- ⚠️ **Warning:** Some pages 200-240% TAC (risky)
- ❌ **Fail:** Some pages >240% TAC (non-compliant)

## How to Fix High TAC

### Problem: Pages Exceed 240% TAC

**Recommended Solutions:**

1. **Use CGATS21_CRPC1.icc Color Profile**
   ```bash
   # Convert with ICC profile in Ghostscript
   gs -dBATCH -dNOPAUSE -sDEVICE=pdfwrite \
      -sColorConversionStrategy=CMYK \
      -sDefaultRGBProfile=CGATS21_CRPC1.icc \
      -o output.pdf input.pdf
   ```

2. **Convert Images to CMYK Before Placing**
   - Open images in Photoshop/GIMP
   - Convert to CMYK color mode
   - Use GRACoL or SWOP profiles
   - Save and re-place in document

3. **Use Pure Black for Text**
   - Black text: 0% C, 0% M, 0% Y, 100% K
   - Avoid "rich black" (C+M+Y+K) for text
   - Reserve rich black for large solid areas only

4. **Reduce Image Saturation**
   - Lower color saturation by 10-20%
   - Use adjustment layers for non-destructive editing
   - Test print to verify color quality

5. **Check for Overlapping Colors**
   - Look for areas where multiple color objects overlap
   - Use transparency flattening
   - Combine overlapping elements when possible

### Problem: Pages in Warning Zone (200-240%)

**Recommendations:**
- Consider reducing saturation slightly
- Test print to verify acceptable quality
- May be acceptable for low-ink printing processes
- Consider reducing if printing on absorbent paper

### Problem: Extremely High TAC (>300%)

**Likely Causes:**
- Rich black used extensively
- RGB to CMYK conversion issues
- Overlapping color areas
- Unoptimized images

**Solutions:**
- Check for black text using rich black (C+M+Y+K)
- Re-convert images with proper ICC profiles
- Flatten transparency
- Optimize color separations

## TAC by Page Type

### Cover Pages / Full Bleed Backgrounds
- Expected TAC: 250-400% (high)
- **Action:** Use CGATS21_CRPC1.icc profile
- **Target:** Reduce to ≤240%

### Text-Heavy Pages
- Expected TAC: 50-150% (low)
- **Action:** Use pure black (0/0/0/100) for text
- **Target:** Keep ≤200%

### Mixed Content (Text + Images)
- Expected TAC: 150-220% (medium)
- **Action:** Optimize images, use proper ICC profiles
- **Target:** Keep ≤200%

### Map/Diagram Pages
- Expected TAC: 200-300% (medium-high)
- **Action:** Reduce color saturation, use spot colors
- **Target:** Reduce to ≤220%

## Batch Summary Interpretation

```markdown
- **PagedJS:** build=✅, pdfx=✅
  - TAC: ❌ Max=397.1%, Avg=224.3%
  - ⚠️ 1 page(s) exceed 240% TAC limit
```

### Reading the Summary:
- **Build Status:** ✅ = successful, ❌ = failed, ⏭️ = skipped
- **TAC Status:** ✅ = pass, ⚠️ = warning, ❌ = fail
- **Max TAC:** Highest TAC found on any page
- **Avg TAC:** Average TAC across all pages
- **Pages Over Limit:** Count of pages exceeding 240%

## Comparison Report TAC Section

The comparison report includes:

1. **TAC Summary Table**
   - Max TAC for both renderers
   - Average TAC for both renderers
   - Page counts for over-limit and warning zones

2. **Pages Requiring Attention**
   - Lists all pages >240% TAC
   - Provides per-page recommendations
   - Shows pages in warning zone (200-240%)

3. **Ink Coverage by Page**
   - Side-by-side TAC comparison per page
   - Status indicator for each page
   - Visual identification of problem pages

## API Usage (Programmatic)

```typescript
import { validateTAC } from "./scripts/validate-tac.ts";

// Validate a PDF
const result = await validateTAC("path/to/file.pdf");

// Check results
if (!result.passed) {
  console.error(`TAC validation failed: ${result.maxTAC}%`);
  console.error(`Pages over limit: ${result.pagesOverLimit.join(", ")}`);

  // Get recommendations
  for (const rec of result.recommendations) {
    console.log(`- ${rec}`);
  }
}

// Access per-page data
for (const page of result.perPage) {
  if (page.status === "fail") {
    console.log(`Page ${page.page}: ${page.tac}% TAC`);
    if (page.recommendation) {
      console.log(`  → ${page.recommendation}`);
    }
  }
}
```

## Troubleshooting

### TAC Validation Skipped
```
⚠️  TAC validation skipped: Error message
```
**Causes:**
- Ghostscript not installed
- PDF file not found
- Invalid PDF structure

**Solutions:**
1. Install Ghostscript: `sudo apt install ghostscript`
2. Verify PDF exists and is readable
3. Check PDF is valid: `pdfinfo file.pdf`

### TAC Shows as 0% for All Pages
**Causes:**
- PDF is in RGB color space
- PDF not properly converted to CMYK

**Solutions:**
1. Ensure PDF/X conversion ran successfully
2. Check PDF color space: `pdfinfo file.pdf`
3. Re-run PDF/X conversion step

### Different TAC Values Between Renderers
**This is Normal:**
- PagedJS and Vivliostyle render slightly differently
- Different rendering engines = different color handling
- Compare relative trends, not absolute values
- Focus on which renderer stays under 240% TAC

## Best Practices

1. **Run TAC Validation Early**
   - Validate during development, not just before release
   - Catch TAC issues before they multiply

2. **Use ICC Profiles from the Start**
   - Set up CMYK color profiles in your design tool
   - Use CGATS21_CRPC1 or similar low-TAC profiles

3. **Monitor TAC Trends**
   - Track TAC changes between builds
   - Look for sudden TAC increases (indicates new issues)

4. **Test Print Samples**
   - DriveThruRPG compliance doesn't guarantee visual quality
   - Order sample prints to verify appearance

5. **Document TAC Decisions**
   - Note why certain pages have high TAC
   - Document accepted risks (e.g., cover pages)
   - Track TAC reduction efforts

## Exit Codes

When running `validate-tac.ts` directly:
- **0:** TAC validation passed (all pages ≤240%)
- **1:** TAC validation failed (some pages >240%)

When running `run-all.ts`:
- **0:** All builds successful (TAC failures are warnings)
- **1:** Build failures (use `--strict` to fail on TAC issues)

## Additional Resources

- Original check_ink.ts: `~/.hyphn/profiles/ttrpg-publishing/skills/pdfx-print-pipeline/scripts/check_ink.ts`
- DriveThruRPG specifications: [publisher resources](https://www.drivethrurpg.com/pub_resources.php)
- GRACoL ICC Profiles: [Download](https://www.idealliance.org/graCol)
- PDF/X standards: ISO 15930 series

## Quick Command Cheat Sheet

```bash
# Validate single PDF
bun run scripts/validate-tac.ts output/default-test/pagedjs-pdfx.pdf

# Full pipeline with TAC
bun run scripts/run-all.ts

# Just validate existing PDFs
bun run scripts/run-all.ts --skip-pagedjs --skip-vivliostyle

# View TAC in batch summary
cat output/batch-summary.md | grep -A 5 "TAC:"

# Check comparison report TAC section
grep -A 20 "TAC (Total Area Coverage)" output/default-test/comparison-report.md

# Count pages over limit
grep "exceed 240% TAC" output/batch-summary.md

# Get JSON output for scripting
bun run scripts/validate-tac.ts output/file.pdf --json | jq '.maxTAC'
```

## Support

If TAC validation issues persist:
1. Check Ghostscript version: `gs --version`
2. Verify PDF/X conversion: `pdfinfo output/file.pdf`
3. Review PROJECT-KNOWLEDGE.md for additional context
4. Check TAC-VALIDATION-INTEGRATION.md for implementation details
