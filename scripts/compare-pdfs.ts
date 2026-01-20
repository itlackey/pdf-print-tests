#!/usr/bin/env bun
/**
 * Compare PagedJS, Vivliostyle, and WeasyPrint PDF outputs
 * Generates a comprehensive markdown report with three-way comparison
 */

import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePdf, type ValidationResult, type PdfInfo } from "./validate-pdfs.ts";
import { validateTAC, type TACValidationResult } from "./validate-tac.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

interface ComparisonReport {
  generatedAt: string;
  summary: ComparisonSummary;
  pagedjs: {
    rgb: ValidationResult | null;
    pdfx: ValidationResult | null;
    tacValidation?: TACValidationResult | null;
    buildDuration?: number;
    convertDuration?: number;
  };
  vivliostyle: {
    rgb: ValidationResult | null;
    pdfx: ValidationResult | null;
    tacValidation?: TACValidationResult | null;
    buildDuration?: number;
    convertDuration?: number;
  };
  weasyprint: {
    rgb: ValidationResult | null;
    pdfx: ValidationResult | null;
    tacValidation?: TACValidationResult | null;
    buildDuration?: number;
    convertDuration?: number;
  };
  featureComparison: FeatureComparison[];
  visualComparison: VisualComparison | null;
  recommendations: string[];
}

interface ComparisonSummary {
  winner: "pagedjs" | "vivliostyle" | "weasyprint" | "tie" | "inconclusive";
  pagedJsScore: number;
  vivliostyleScore: number;
  weasyprintScore: number;
  pagedJsCompliant: boolean;
  vivliostyleCompliant: boolean;
  weasyprintCompliant: boolean;
}

interface FeatureComparison {
  feature: string;
  pagedjs: string;
  vivliostyle: string;
  weasyprint: string;
  difference: "same" | "different" | "pagedjs-better" | "vivliostyle-better" | "weasyprint-better";
  notes: string;
}

interface VisualComparison {
  pagesCompared: number;
  differencesFound: number;
  differenceImages: string[];
}

/**
 * Compare two PDF files visually using pdftoppm and ImageMagick
 */
async function compareVisually(
  pdf1: string,
  pdf2: string,
  outputDir: string
): Promise<VisualComparison | null> {
  console.log(`\n🖼️  Visual comparison...`);

  if (!existsSync(pdf1) || !existsSync(pdf2)) {
    console.log(`   ⚠️  Cannot compare - one or both PDFs missing`);
    return null;
  }

  const diffDir = join(outputDir, "visual-diff");
  if (!existsSync(diffDir)) {
    mkdirSync(diffDir, { recursive: true });
  }

  try {
    // Convert PDFs to images
    console.log(`   Converting PDFs to images...`);

    const pdf1Dir = join(diffDir, "pagedjs");
    const pdf2Dir = join(diffDir, "vivliostyle");
    const diffImgDir = join(diffDir, "diff");

    for (const dir of [pdf1Dir, pdf2Dir, diffImgDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Convert both PDFs to PNG images
    await $`pdftoppm -png -r 150 ${pdf1} ${pdf1Dir}/page`.quiet();
    await $`pdftoppm -png -r 150 ${pdf2} ${pdf2Dir}/page`.quiet();

    // Get list of pages
    const pdf1Pages = readdirSync(pdf1Dir)
      .filter((f) => f.endsWith(".png"))
      .sort();
    const pdf2Pages = readdirSync(pdf2Dir)
      .filter((f) => f.endsWith(".png"))
      .sort();

    const pageCount = Math.min(pdf1Pages.length, pdf2Pages.length);
    let differencesFound = 0;
    const differenceImages: string[] = [];

    console.log(`   Comparing ${pageCount} pages...`);

    // Compare each page
    for (let i = 0; i < pageCount; i++) {
      const page1 = join(pdf1Dir, pdf1Pages[i]);
      const page2 = join(pdf2Dir, pdf2Pages[i]);
      const diffImg = join(diffImgDir, `diff-page-${i + 1}.png`);

      try {
        // Use ImageMagick compare to find differences
        const result = await $`compare -metric AE ${page1} ${page2} ${diffImg}`.quiet().nothrow();

        // compare returns non-zero if images differ
        const diffPixels = parseInt(result.stderr.toString().trim()) || 0;
        if (diffPixels > 100) {
          // Threshold for "different"
          differencesFound++;
          differenceImages.push(diffImg);
          console.log(`   Page ${i + 1}: ${diffPixels} pixels differ`);
        }
      } catch (error) {
        // ImageMagick compare can fail if images are different sizes
        differencesFound++;
        console.log(`   Page ${i + 1}: Different dimensions or format`);
      }
    }

    console.log(
      `   Found ${differencesFound} pages with visible differences`
    );

    return {
      pagesCompared: pageCount,
      differencesFound,
      differenceImages,
    };
  } catch (error) {
    console.log(`   ⚠️  Visual comparison failed: ${error}`);
    return null;
  }
}

/**
 * Compare feature support between the three renderers
 */
function compareFeatures(
  pagedjs: PdfInfo | null,
  vivliostyle: PdfInfo | null,
  weasyprint: PdfInfo | null
): FeatureComparison[] {
  const comparisons: FeatureComparison[] = [];

  // Page dimensions
  comparisons.push({
    feature: "Page Dimensions",
    pagedjs: pagedjs?.pageSize
      ? `${pagedjs.pageSize.width.toFixed(3)}" × ${pagedjs.pageSize.height.toFixed(3)}"`
      : "N/A",
    vivliostyle: vivliostyle?.pageSize
      ? `${vivliostyle.pageSize.width.toFixed(3)}" × ${vivliostyle.pageSize.height.toFixed(3)}"`
      : "N/A",
    weasyprint: weasyprint?.pageSize
      ? `${weasyprint.pageSize.width.toFixed(3)}" × ${weasyprint.pageSize.height.toFixed(3)}"`
      : "N/A",
    difference:
      pagedjs?.pageSize &&
      vivliostyle?.pageSize &&
      weasyprint?.pageSize &&
      Math.abs(pagedjs.pageSize.width - vivliostyle.pageSize.width) < 0.01 &&
      Math.abs(pagedjs.pageSize.height - vivliostyle.pageSize.height) < 0.01 &&
      Math.abs(pagedjs.pageSize.width - weasyprint.pageSize.width) < 0.01 &&
      Math.abs(pagedjs.pageSize.height - weasyprint.pageSize.height) < 0.01
        ? "same"
        : "different",
    notes: "Should match 6.25\" × 9.25\" (6×9 trim + 0.125\" bleed)",
  });

  // Page count
  comparisons.push({
    feature: "Page Count",
    pagedjs: pagedjs?.pageCount?.toString() || "N/A",
    vivliostyle: vivliostyle?.pageCount?.toString() || "N/A",
    weasyprint: weasyprint?.pageCount?.toString() || "N/A",
    difference:
      pagedjs?.pageCount === vivliostyle?.pageCount && pagedjs?.pageCount === weasyprint?.pageCount
        ? "same"
        : "different",
    notes: "All three should produce same page count",
  });

  // Color space
  comparisons.push({
    feature: "Color Space",
    pagedjs: pagedjs?.colorSpace || "N/A",
    vivliostyle: vivliostyle?.colorSpace || "N/A",
    weasyprint: weasyprint?.colorSpace || "N/A",
    difference:
      pagedjs?.colorSpace === vivliostyle?.colorSpace && pagedjs?.colorSpace === weasyprint?.colorSpace
        ? "same"
        : "different",
    notes: "Should be CMYK after PDF/X conversion",
  });

  // Font embedding
  const pjFontsEmbedded =
    pagedjs?.fonts?.filter((f) => f.embedded).length ?? 0;
  const pjFontsTotal = pagedjs?.fonts?.length ?? 0;
  const vsFontsEmbedded =
    vivliostyle?.fonts?.filter((f) => f.embedded).length ?? 0;
  const vsFontsTotal = vivliostyle?.fonts?.length ?? 0;
  const wpFontsEmbedded =
    weasyprint?.fonts?.filter((f) => f.embedded).length ?? 0;
  const wpFontsTotal = weasyprint?.fonts?.length ?? 0;

  comparisons.push({
    feature: "Fonts Embedded",
    pagedjs: `${pjFontsEmbedded}/${pjFontsTotal}`,
    vivliostyle: `${vsFontsEmbedded}/${vsFontsTotal}`,
    weasyprint: `${wpFontsEmbedded}/${wpFontsTotal}`,
    difference:
      pjFontsEmbedded === pjFontsTotal && vsFontsEmbedded === vsFontsTotal && wpFontsEmbedded === wpFontsTotal
        ? "same"
        : "different",
    notes: "All fonts should be embedded",
  });

  // Max ink coverage
  const pjMaxTac = pagedjs?.inkCoverage?.reduce(
    (max, p) => Math.max(max, p.tac),
    0
  ) ?? 0;
  const vsMaxTac = vivliostyle?.inkCoverage?.reduce(
    (max, p) => Math.max(max, p.tac),
    0
  ) ?? 0;
  const wpMaxTac = weasyprint?.inkCoverage?.reduce(
    (max, p) => Math.max(max, p.tac),
    0
  ) ?? 0;

  // Determine which renderer has best TAC (lowest under 240%)
  let tacDiff: "same" | "different" | "pagedjs-better" | "vivliostyle-better" | "weasyprint-better" = "different";
  const allCompliant = pjMaxTac <= 240 && vsMaxTac <= 240 && wpMaxTac <= 240;

  if (allCompliant) {
    // All compliant - best is lowest value
    const minTac = Math.min(pjMaxTac, vsMaxTac, wpMaxTac);
    if (wpMaxTac === minTac && wpMaxTac < pjMaxTac - 5 && wpMaxTac < vsMaxTac - 5) {
      tacDiff = "weasyprint-better";
    } else if (pjMaxTac === minTac && pjMaxTac < vsMaxTac - 5 && pjMaxTac < wpMaxTac - 5) {
      tacDiff = "pagedjs-better";
    } else if (vsMaxTac === minTac && vsMaxTac < pjMaxTac - 5 && vsMaxTac < wpMaxTac - 5) {
      tacDiff = "vivliostyle-better";
    } else if (Math.abs(pjMaxTac - vsMaxTac) < 5 && Math.abs(pjMaxTac - wpMaxTac) < 5) {
      tacDiff = "same";
    }
  } else {
    // Some non-compliant - best is the compliant one(s)
    const wpCompliant = wpMaxTac <= 240;
    const pjCompliant = pjMaxTac <= 240;
    const vsCompliant = vsMaxTac <= 240;

    if (wpCompliant && !pjCompliant && !vsCompliant) {
      tacDiff = "weasyprint-better";
    } else if (pjCompliant && !vsCompliant && !wpCompliant) {
      tacDiff = "pagedjs-better";
    } else if (vsCompliant && !pjCompliant && !wpCompliant) {
      tacDiff = "vivliostyle-better";
    }
  }

  comparisons.push({
    feature: "Max Ink (TAC)",
    pagedjs: `${pjMaxTac.toFixed(1)}%`,
    vivliostyle: `${vsMaxTac.toFixed(1)}%`,
    weasyprint: `${wpMaxTac.toFixed(1)}%`,
    difference: tacDiff,
    notes: "Should be ≤240% for DriveThruRPG",
  });

  // File size
  const pjSize = (pagedjs?.fileSize ?? 0) / 1024;
  const vsSize = (vivliostyle?.fileSize ?? 0) / 1024;
  const wpSize = (weasyprint?.fileSize ?? 0) / 1024;

  const minSize = Math.min(pjSize, vsSize, wpSize);
  let sizeDiff: "same" | "different" | "pagedjs-better" | "vivliostyle-better" | "weasyprint-better" = "different";

  if (wpSize === minSize && wpSize < pjSize * 0.9 && wpSize < vsSize * 0.9) {
    sizeDiff = "weasyprint-better";
  } else if (pjSize === minSize && pjSize < vsSize * 0.9 && pjSize < wpSize * 0.9) {
    sizeDiff = "pagedjs-better";
  } else if (vsSize === minSize && vsSize < pjSize * 0.9 && vsSize < wpSize * 0.9) {
    sizeDiff = "vivliostyle-better";
  } else if (Math.abs(pjSize - vsSize) / Math.max(pjSize, vsSize) < 0.1 &&
             Math.abs(pjSize - wpSize) / Math.max(pjSize, wpSize) < 0.1) {
    sizeDiff = "same";
  }

  comparisons.push({
    feature: "File Size",
    pagedjs: `${pjSize.toFixed(1)} KB`,
    vivliostyle: `${vsSize.toFixed(1)} KB`,
    weasyprint: `${wpSize.toFixed(1)} KB`,
    difference: sizeDiff,
    notes: "Smaller is generally better for upload",
  });

  // PDF version
  comparisons.push({
    feature: "PDF Version",
    pagedjs: pagedjs?.pdfVersion || "N/A",
    vivliostyle: vivliostyle?.pdfVersion || "N/A",
    weasyprint: weasyprint?.pdfVersion || "N/A",
    difference:
      pagedjs?.pdfVersion === vivliostyle?.pdfVersion && pagedjs?.pdfVersion === weasyprint?.pdfVersion
        ? "same"
        : "different",
    notes: "Should be 1.4 for PDF/X-1a compatibility",
  });

  return comparisons;
}

/**
 * Generate the markdown report
 */
function generateMarkdownReport(report: ComparisonReport): string {
  const lines: string[] = [];

  lines.push(`# PDF/X Test Harness Report`);
  lines.push(``);
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(``);
  lines.push(`## Executive Summary`);
  lines.push(``);
  lines.push(`| Metric | PagedJS | Vivliostyle | WeasyPrint |`);
  lines.push(`|--------|---------|-------------|------------|`);
  lines.push(`| DriveThruRPG Compliant | ${report.summary.pagedJsCompliant ? "✅ Yes" : "❌ No"} | ${report.summary.vivliostyleCompliant ? "✅ Yes" : "❌ No"} | ${report.summary.weasyprintCompliant ? "✅ Yes" : "❌ No"} |`);
  lines.push(`| Compliance Score | ${report.summary.pagedJsScore}/10 | ${report.summary.vivliostyleScore}/10 | ${report.summary.weasyprintScore}/10 |`);
  lines.push(``);

  const winnerText = {
    pagedjs: "**PagedJS** produces better results for this test",
    vivliostyle: "**Vivliostyle** produces better results for this test",
    weasyprint: "**WeasyPrint** produces better results for this test",
    tie: "All renderers produce **equivalent** results",
    inconclusive: "**Inconclusive** - insufficient data for comparison",
  };
  lines.push(`**Verdict:** ${winnerText[report.summary.winner]}`);
  lines.push(``);

  // PagedJS Section
  lines.push(`---`);
  lines.push(``);
  lines.push(`## PagedJS Output`);
  lines.push(``);

  if (report.pagedjs.rgb) {
    lines.push(`### RGB PDF (Before PDF/X Conversion)`);
    lines.push(``);
    lines.push(`- **File:** \`${report.pagedjs.rgb.filename}\``);
    lines.push(`- **Valid:** ${report.pagedjs.rgb.valid ? "✅" : "❌"}`);
    if (report.pagedjs.rgb.info) {
      lines.push(`- **Pages:** ${report.pagedjs.rgb.info.pageCount}`);
      lines.push(`- **Dimensions:** ${report.pagedjs.rgb.info.pageSize?.width?.toFixed(3)}" × ${report.pagedjs.rgb.info.pageSize?.height?.toFixed(3)}"`);
      lines.push(`- **File Size:** ${((report.pagedjs.rgb.info.fileSize ?? 0) / 1024).toFixed(1)} KB`);
      lines.push(`- **Producer:** ${report.pagedjs.rgb.info.producer}`);
    }
    lines.push(``);
  }

  if (report.pagedjs.pdfx) {
    lines.push(`### PDF/X Output (DriveThruRPG Ready)`);
    lines.push(``);
    lines.push(`- **File:** \`${report.pagedjs.pdfx.filename}\``);
    lines.push(`- **Compliant:** ${report.pagedjs.pdfx.valid ? "✅ Yes" : "❌ No"}`);
    lines.push(``);

    if (report.pagedjs.pdfx.checks.length > 0) {
      lines.push(`#### Compliance Checks`);
      lines.push(``);
      lines.push(`| Check | Result | Expected | Actual |`);
      lines.push(`|-------|--------|----------|--------|`);
      for (const check of report.pagedjs.pdfx.checks) {
        const icon = check.passed ? "✅" : check.severity === "warning" ? "⚠️" : "❌";
        lines.push(`| ${check.name} | ${icon} | ${check.expected} | ${check.actual} |`);
      }
      lines.push(``);
    }

    if (report.pagedjs.pdfx.errors.length > 0) {
      lines.push(`#### Errors`);
      lines.push(``);
      for (const error of report.pagedjs.pdfx.errors) {
        lines.push(`- ❌ ${error}`);
      }
      lines.push(``);
    }

    if (report.pagedjs.pdfx.warnings.length > 0) {
      lines.push(`#### Warnings`);
      lines.push(``);
      for (const warning of report.pagedjs.pdfx.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push(``);
    }
  }

  // Vivliostyle Section
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Vivliostyle Output`);
  lines.push(``);

  if (report.vivliostyle.rgb) {
    lines.push(`### RGB PDF (Before PDF/X Conversion)`);
    lines.push(``);
    lines.push(`- **File:** \`${report.vivliostyle.rgb.filename}\``);
    lines.push(`- **Valid:** ${report.vivliostyle.rgb.valid ? "✅" : "❌"}`);
    if (report.vivliostyle.rgb.info) {
      lines.push(`- **Pages:** ${report.vivliostyle.rgb.info.pageCount}`);
      lines.push(`- **Dimensions:** ${report.vivliostyle.rgb.info.pageSize?.width?.toFixed(3)}" × ${report.vivliostyle.rgb.info.pageSize?.height?.toFixed(3)}"`);
      lines.push(`- **File Size:** ${((report.vivliostyle.rgb.info.fileSize ?? 0) / 1024).toFixed(1)} KB`);
      lines.push(`- **Producer:** ${report.vivliostyle.rgb.info.producer}`);
    }
    lines.push(``);
  }

  if (report.vivliostyle.pdfx) {
    lines.push(`### PDF/X Output (DriveThruRPG Ready)`);
    lines.push(``);
    lines.push(`- **File:** \`${report.vivliostyle.pdfx.filename}\``);
    lines.push(`- **Compliant:** ${report.vivliostyle.pdfx.valid ? "✅ Yes" : "❌ No"}`);
    lines.push(``);

    if (report.vivliostyle.pdfx.checks.length > 0) {
      lines.push(`#### Compliance Checks`);
      lines.push(``);
      lines.push(`| Check | Result | Expected | Actual |`);
      lines.push(`|-------|--------|----------|--------|`);
      for (const check of report.vivliostyle.pdfx.checks) {
        const icon = check.passed ? "✅" : check.severity === "warning" ? "⚠️" : "❌";
        lines.push(`| ${check.name} | ${icon} | ${check.expected} | ${check.actual} |`);
      }
      lines.push(``);
    }

    if (report.vivliostyle.pdfx.errors.length > 0) {
      lines.push(`#### Errors`);
      lines.push(``);
      for (const error of report.vivliostyle.pdfx.errors) {
        lines.push(`- ❌ ${error}`);
      }
      lines.push(``);
    }

    if (report.vivliostyle.pdfx.warnings.length > 0) {
      lines.push(`#### Warnings`);
      lines.push(``);
      for (const warning of report.vivliostyle.pdfx.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push(``);
    }
  }

  // WeasyPrint Section
  lines.push(`---`);
  lines.push(``);
  lines.push(`## WeasyPrint Output`);
  lines.push(``);

  if (report.weasyprint.rgb) {
    lines.push(`### RGB PDF (Before PDF/X Conversion)`);
    lines.push(``);
    lines.push(`- **File:** \`${report.weasyprint.rgb.filename}\``);
    lines.push(`- **Valid:** ${report.weasyprint.rgb.valid ? "✅" : "❌"}`);
    if (report.weasyprint.rgb.info) {
      lines.push(`- **Pages:** ${report.weasyprint.rgb.info.pageCount}`);
      lines.push(`- **Dimensions:** ${report.weasyprint.rgb.info.pageSize?.width?.toFixed(3)}" × ${report.weasyprint.rgb.info.pageSize?.height?.toFixed(3)}"`);
      lines.push(`- **File Size:** ${((report.weasyprint.rgb.info.fileSize ?? 0) / 1024).toFixed(1)} KB`);
      lines.push(`- **Producer:** ${report.weasyprint.rgb.info.producer}`);
    }
    lines.push(``);
  }

  if (report.weasyprint.pdfx) {
    lines.push(`### PDF/X Output (DriveThruRPG Ready)`);
    lines.push(``);
    lines.push(`- **File:** \`${report.weasyprint.pdfx.filename}\``);
    lines.push(`- **Compliant:** ${report.weasyprint.pdfx.valid ? "✅ Yes" : "❌ No"}`);
    lines.push(``);

    if (report.weasyprint.pdfx.checks.length > 0) {
      lines.push(`#### Compliance Checks`);
      lines.push(``);
      lines.push(`| Check | Result | Expected | Actual |`);
      lines.push(`|-------|--------|----------|--------|`);
      for (const check of report.weasyprint.pdfx.checks) {
        const icon = check.passed ? "✅" : check.severity === "warning" ? "⚠️" : "❌";
        lines.push(`| ${check.name} | ${icon} | ${check.expected} | ${check.actual} |`);
      }
      lines.push(``);
    }

    if (report.weasyprint.pdfx.errors.length > 0) {
      lines.push(`#### Errors`);
      lines.push(``);
      for (const error of report.weasyprint.pdfx.errors) {
        lines.push(`- ❌ ${error}`);
      }
      lines.push(``);
    }

    if (report.weasyprint.pdfx.warnings.length > 0) {
      lines.push(`#### Warnings`);
      lines.push(``);
      for (const warning of report.weasyprint.pdfx.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push(``);
    }
  }

  // Three-Way Comparison Section
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Three-Way Comparison`);
  lines.push(``);
  lines.push(`### Feature Comparison Table`);
  lines.push(``);
  lines.push(`| Feature | PagedJS | Vivliostyle | WeasyPrint | Best |`);
  lines.push(`|---------|---------|-------------|------------|------|`);

  for (const feature of report.featureComparison) {
    const diffIcon = {
      same: "✅ Same",
      different: "🔄 Different",
      "pagedjs-better": "PagedJS",
      "vivliostyle-better": "Vivliostyle",
      "weasyprint-better": "**WeasyPrint**",
    };
    lines.push(`| ${feature.feature} | ${feature.pagedjs} | ${feature.vivliostyle} | ${feature.weasyprint} | ${diffIcon[feature.difference]} |`);
  }
  lines.push(``);

  // Visual Comparison
  if (report.visualComparison) {
    lines.push(`### Visual Comparison`);
    lines.push(``);
    lines.push(`- **Pages Compared:** ${report.visualComparison.pagesCompared}`);
    lines.push(`- **Pages with Differences:** ${report.visualComparison.differencesFound}`);
    lines.push(``);

    if (report.visualComparison.differencesFound > 0) {
      lines.push(`Visual difference images saved in \`visual-diff/\` subdirectory`);
      lines.push(``);
    } else {
      lines.push(`✅ No significant visual differences detected between renderers.`);
      lines.push(``);
    }
  }

  // TAC Validation Section
  lines.push(`### TAC (Total Area Coverage) Validation`);
  lines.push(``);

  const pjTac = report.pagedjs.tacValidation;
  const vsTac = report.vivliostyle.tacValidation;
  const wpTac = report.weasyprint.tacValidation;

  if (pjTac || vsTac || wpTac) {
    lines.push(`| Metric | PagedJS | Vivliostyle | WeasyPrint | Limit |`);
    lines.push(`|--------|---------|-------------|------------|-------|`);

    const pjMaxTac = pjTac ? `${pjTac.maxTAC.toFixed(1)}%` : "N/A";
    const vsMaxTac = vsTac ? `${vsTac.maxTAC.toFixed(1)}%` : "N/A";
    const wpMaxTac = wpTac ? `${wpTac.maxTAC.toFixed(1)}%` : "N/A";
    const pjMaxIcon = pjTac && pjTac.maxTAC > 240 ? "❌" : pjTac && pjTac.maxTAC > 200 ? "⚠️" : "✅";
    const vsMaxIcon = vsTac && vsTac.maxTAC > 240 ? "❌" : vsTac && vsTac.maxTAC > 200 ? "⚠️" : "✅";
    const wpMaxIcon = wpTac && wpTac.maxTAC > 240 ? "❌" : wpTac && wpTac.maxTAC > 200 ? "⚠️" : "✅";
    lines.push(`| Max TAC | ${pjMaxIcon} ${pjMaxTac} | ${vsMaxIcon} ${vsMaxTac} | ${wpMaxIcon} ${wpMaxTac} | ≤240% |`);

    const pjAvgTac = pjTac ? `${pjTac.averageTAC.toFixed(1)}%` : "N/A";
    const vsAvgTac = vsTac ? `${vsTac.averageTAC.toFixed(1)}%` : "N/A";
    const wpAvgTac = wpTac ? `${wpTac.averageTAC.toFixed(1)}%` : "N/A";
    lines.push(`| Avg TAC | ${pjAvgTac} | ${vsAvgTac} | ${wpAvgTac} | ≤200% |`);

    const pjOverLimit = pjTac ? pjTac.pagesOverLimit.length : 0;
    const vsOverLimit = vsTac ? vsTac.pagesOverLimit.length : 0;
    const wpOverLimit = wpTac ? wpTac.pagesOverLimit.length : 0;
    const pjOverIcon = pjOverLimit > 0 ? "❌" : "✅";
    const vsOverIcon = vsOverLimit > 0 ? "❌" : "✅";
    const wpOverIcon = wpOverLimit > 0 ? "❌" : "✅";
    lines.push(`| Pages >240% | ${pjOverIcon} ${pjOverLimit} | ${vsOverIcon} ${vsOverLimit} | ${wpOverIcon} ${wpOverLimit} | 0 |`);

    const pjWarnPages = pjTac ? pjTac.pagesWithWarnings.length : 0;
    const vsWarnPages = vsTac ? vsTac.pagesWithWarnings.length : 0;
    const wpWarnPages = wpTac ? wpTac.pagesWithWarnings.length : 0;
    const pjWarnIcon = pjWarnPages > 0 ? "⚠️" : "✅";
    const vsWarnIcon = vsWarnPages > 0 ? "⚠️" : "✅";
    const wpWarnIcon = wpWarnPages > 0 ? "⚠️" : "✅";
    lines.push(`| Pages 200-240% | ${pjWarnIcon} ${pjWarnPages} | ${vsWarnIcon} ${vsWarnPages} | ${wpWarnIcon} ${wpWarnPages} | 0 |`);

    lines.push(``);

    // Add detailed page-by-page TAC if there are issues
    if (pjOverLimit > 0 || vsOverLimit > 0 || wpOverLimit > 0 || pjWarnPages > 0 || vsWarnPages > 0 || wpWarnPages > 0) {
      lines.push(`#### Pages Requiring Attention`);
      lines.push(``);

      if (pjOverLimit > 0) {
        lines.push(`**PagedJS - Pages Over 240% TAC:**`);
        lines.push(``);
        const overPages = pjTac!.perPage.filter(p => p.status === "fail");
        for (const p of overPages.slice(0, 10)) {
          lines.push(`- Page ${p.page}: ${p.tac.toFixed(1)}% TAC`);
          if (p.recommendation) {
            lines.push(`  - ${p.recommendation}`);
          }
        }
        if (overPages.length > 10) {
          lines.push(`- ... and ${overPages.length - 10} more pages`);
        }
        lines.push(``);
      }

      if (vsOverLimit > 0) {
        lines.push(`**Vivliostyle - Pages Over 240% TAC:**`);
        lines.push(``);
        const overPages = vsTac!.perPage.filter(p => p.status === "fail");
        for (const p of overPages.slice(0, 10)) {
          lines.push(`- Page ${p.page}: ${p.tac.toFixed(1)}% TAC`);
          if (p.recommendation) {
            lines.push(`  - ${p.recommendation}`);
          }
        }
        if (overPages.length > 10) {
          lines.push(`- ... and ${overPages.length - 10} more pages`);
        }
        lines.push(``);
      }

      if (wpOverLimit > 0) {
        lines.push(`**WeasyPrint - Pages Over 240% TAC:**`);
        lines.push(``);
        const overPages = wpTac!.perPage.filter(p => p.status === "fail");
        for (const p of overPages.slice(0, 10)) {
          lines.push(`- Page ${p.page}: ${p.tac.toFixed(1)}% TAC`);
          if (p.recommendation) {
            lines.push(`  - ${p.recommendation}`);
          }
        }
        if (overPages.length > 10) {
          lines.push(`- ... and ${overPages.length - 10} more pages`);
        }
        lines.push(``);
      }

      if (pjWarnPages > 0 || vsWarnPages > 0 || wpWarnPages > 0) {
        lines.push(`**Pages in Warning Zone (200-240% TAC):**`);
        lines.push(``);

        if (pjWarnPages > 0) {
          lines.push(`- PagedJS: ${pjTac!.pagesWithWarnings.slice(0, 10).join(", ")}${pjWarnPages > 10 ? ` ... (${pjWarnPages} total)` : ""}`);
        }
        if (vsWarnPages > 0) {
          lines.push(`- Vivliostyle: ${vsTac!.pagesWithWarnings.slice(0, 10).join(", ")}${vsWarnPages > 10 ? ` ... (${vsWarnPages} total)` : ""}`);
        }
        if (wpWarnPages > 0) {
          lines.push(`- WeasyPrint: ${wpTac!.pagesWithWarnings.slice(0, 10).join(", ")}${wpWarnPages > 10 ? ` ... (${wpWarnPages} total)` : ""}`);
        }
        lines.push(``);
      }
    }
  }

  // Ink Coverage Detail (keep existing per-page table)
  lines.push(`### Ink Coverage by Page`);
  lines.push(``);

  const pjInk = report.pagedjs.pdfx?.info?.inkCoverage || [];
  const vsInk = report.vivliostyle.pdfx?.info?.inkCoverage || [];
  const wpInk = report.weasyprint.pdfx?.info?.inkCoverage || [];
  const maxPages = Math.max(pjInk.length, vsInk.length, wpInk.length);

  if (maxPages > 0) {
    lines.push(`| Page | PagedJS TAC | Vivliostyle TAC | WeasyPrint TAC | Status |`);
    lines.push(`|------|-------------|-----------------|----------------|--------|`);

    for (let i = 0; i < maxPages; i++) {
      const pj = pjInk[i];
      const vs = vsInk[i];
      const wp = wpInk[i];
      const pjTacVal = pj ? pj.tac : 0;
      const vsTacVal = vs ? vs.tac : 0;
      const wpTacVal = wp ? wp.tac : 0;
      const pjTacStr = pj ? `${pj.tac.toFixed(1)}%` : "N/A";
      const vsTacStr = vs ? `${vs.tac.toFixed(1)}%` : "N/A";
      const wpTacStr = wp ? `${wp.tac.toFixed(1)}%` : "N/A";

      // Determine status based on max TAC between all three renderers
      const maxTacForPage = Math.max(pjTacVal, vsTacVal, wpTacVal);
      let status = "✅";
      if (maxTacForPage > 240) status = "❌ Over limit";
      else if (maxTacForPage > 200) status = "⚠️ Warning";

      lines.push(`| ${i + 1} | ${pjTacStr} | ${vsTacStr} | ${wpTacStr} | ${status} |`);
    }
    lines.push(``);
  }

  // Recommendations
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Recommendations`);
  lines.push(``);

  if (report.recommendations.length > 0) {
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
  } else {
    lines.push(`- Both renderers produce acceptable output for print-on-demand.`);
  }
  lines.push(``);

  // Technical Details
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Technical Details`);
  lines.push(``);
  lines.push(`### Test Configuration`);
  lines.push(``);
  lines.push(`- **Trim Size:** 6" × 9" (standard trade paperback)`);
  lines.push(`- **Bleed:** 0.125" all edges`);
  lines.push(`- **Final Page Size:** 6.25" × 9.25"`);
  lines.push(`- **Target:** DriveThruRPG PDF/X-1a:2001`);
  lines.push(`- **Max Ink Coverage:** 240% TAC`);
  lines.push(`- **Color Space:** CMYK`);
  lines.push(``);

  lines.push(`### Layout Features Tested`);
  lines.push(``);
  lines.push(`1. **Title Page** - Full bleed background, centered typography`);
  lines.push(`2. **Two-Column Text** - Circle float with \`shape-outside: circle()\``);
  lines.push(`3. **Stat Block** - Diamond float with \`shape-outside: polygon()\``);
  lines.push(`4. **Map Layout** - Custom shapes, grid positioning`);
  lines.push(`5. **Rules Page** - Scroll float with \`shape-outside: inset()\`, tables`);
  lines.push(``);

  lines.push(`### Tools Used`);
  lines.push(``);
  lines.push(`- **PagedJS CLI:** Chromium-based CSS Paged Media polyfill`);
  lines.push(`- **Vivliostyle CLI:** Native CSS Paged Media renderer (Chromium-based)`);
  lines.push(`- **WeasyPrint:** Python-based CSS Paged Media renderer (non-Chromium)`);
  lines.push(`- **Ghostscript:** PDF/X conversion and CMYK color transformation`);
  lines.push(`- **Poppler Utils:** PDF analysis (pdfinfo, pdffonts)`);
  lines.push(`- **ImageMagick:** Visual comparison`);
  lines.push(``);

  return lines.join("\n");
}

/**
 * Calculate scores and determine winner
 */
function calculateSummary(
  pagedjs: ValidationResult | null,
  vivliostyle: ValidationResult | null,
  weasyprint: ValidationResult | null
): ComparisonSummary {
  let pjScore = 0;
  let vsScore = 0;
  let wpScore = 0;

  if (pagedjs?.valid) pjScore += 5;
  if (vivliostyle?.valid) vsScore += 5;
  if (weasyprint?.valid) wpScore += 5;

  // Additional points for passed checks
  for (const check of pagedjs?.checks || []) {
    if (check.passed) pjScore += 0.5;
  }
  for (const check of vivliostyle?.checks || []) {
    if (check.passed) vsScore += 0.5;
  }
  for (const check of weasyprint?.checks || []) {
    if (check.passed) wpScore += 0.5;
  }

  // Cap at 10
  pjScore = Math.min(10, Math.round(pjScore));
  vsScore = Math.min(10, Math.round(vsScore));
  wpScore = Math.min(10, Math.round(wpScore));

  let winner: "pagedjs" | "vivliostyle" | "weasyprint" | "tie" | "inconclusive";
  if (!pagedjs && !vivliostyle && !weasyprint) {
    winner = "inconclusive";
  } else {
    const maxScore = Math.max(pjScore, vsScore, wpScore);
    const winners = [];
    if (pjScore === maxScore) winners.push("pagedjs");
    if (vsScore === maxScore) winners.push("vivliostyle");
    if (wpScore === maxScore) winners.push("weasyprint");

    if (winners.length > 1) {
      winner = "tie";
    } else {
      winner = winners[0] as "pagedjs" | "vivliostyle" | "weasyprint";
    }
  }

  return {
    winner,
    pagedJsScore: pjScore,
    vivliostyleScore: vsScore,
    weasyprintScore: wpScore,
    pagedJsCompliant: pagedjs?.valid ?? false,
    vivliostyleCompliant: vivliostyle?.valid ?? false,
    weasyprintCompliant: weasyprint?.valid ?? false,
  };
}

/**
 * Generate recommendations based on validation results
 */
function generateRecommendations(
  pagedjs: ValidationResult | null,
  vivliostyle: ValidationResult | null,
  weasyprint: ValidationResult | null,
  tacPagedjs?: TACValidationResult | null,
  tacVivliostyle?: TACValidationResult | null,
  tacWeasyprint?: TACValidationResult | null
): string[] {
  const recommendations: string[] = [];

  // Check for common issues
  if (pagedjs?.errors.length || vivliostyle?.errors.length || weasyprint?.errors.length) {
    recommendations.push(
      "Review and fix validation errors before uploading to DriveThruRPG."
    );
  }

  // TAC-specific recommendations from dedicated validation
  if (tacPagedjs?.pagesOverLimit.length || tacVivliostyle?.pagesOverLimit.length || tacWeasyprint?.pagesOverLimit.length) {
    const compliantEngines = [];
    if (!tacPagedjs?.pagesOverLimit.length) compliantEngines.push("PagedJS");
    if (!tacVivliostyle?.pagesOverLimit.length) compliantEngines.push("Vivliostyle");
    if (!tacWeasyprint?.pagesOverLimit.length) compliantEngines.push("WeasyPrint");

    if (compliantEngines.length > 0) {
      recommendations.push(
        `✅ ${compliantEngines.join(", ")} ${compliantEngines.length === 1 ? "produces" : "produce"} TAC-compliant PDFs. Use ${compliantEngines.length === 1 ? "this renderer" : "one of these renderers"} for DriveThruRPG uploads.`
      );
    } else {
      recommendations.push(
        "Critical: All engines exceed 240% TAC limit on some pages. DriveThruRPG may reject these PDFs."
      );
      recommendations.push(
        "Use CGATS21_CRPC1.icc profile for CMYK conversion to reduce TAC."
      );
      recommendations.push(
        "Convert images to CMYK before placing in document to avoid color space issues."
      );
    }
  } else if (tacPagedjs?.pagesWithWarnings.length || tacVivliostyle?.pagesWithWarnings.length || tacWeasyprint?.pagesWithWarnings.length) {
    recommendations.push(
      "Warning: Some pages are close to 240% TAC limit (200-240%). Consider reducing color saturation for safer print results."
    );
  }

  // Fallback to old method if TAC validation not available
  const pjTac = pagedjs?.info?.inkCoverage?.reduce(
    (max, p) => Math.max(max, p.tac),
    0
  ) ?? 0;
  const vsTac = vivliostyle?.info?.inkCoverage?.reduce(
    (max, p) => Math.max(max, p.tac),
    0
  ) ?? 0;
  const wpTac = weasyprint?.info?.inkCoverage?.reduce(
    (max, p) => Math.max(max, p.tac),
    0
  ) ?? 0;

  if (!tacPagedjs && !tacVivliostyle && !tacWeasyprint && (pjTac > 240 || vsTac > 240 || wpTac > 240)) {
    recommendations.push(
      "Some pages exceed 240% TAC. Consider reducing color saturation or using ICC profiles optimized for lower ink coverage."
    );
  }

  // Dimension check
  const checkDimensions = (result: ValidationResult | null, name: string) => {
    if (result?.info?.pageSize) {
      const { width, height } = result.info.pageSize;
      if (Math.abs(width - 6.25) > 0.1 || Math.abs(height - 9.25) > 0.1) {
        recommendations.push(
          `${name} page dimensions differ from expected. Check @page size rules include bleed.`
        );
      }
    }
  };

  checkDimensions(pagedjs, "PagedJS");
  checkDimensions(vivliostyle, "Vivliostyle");
  checkDimensions(weasyprint, "WeasyPrint");

  // Font recommendations
  const unembeddedPJ =
    pagedjs?.info?.fonts?.filter((f) => !f.embedded).length ?? 0;
  const unembeddedVS =
    vivliostyle?.info?.fonts?.filter((f) => !f.embedded).length ?? 0;
  const unembeddedWP =
    weasyprint?.info?.fonts?.filter((f) => !f.embedded).length ?? 0;

  if (unembeddedPJ > 0 || unembeddedVS > 0 || unembeddedWP > 0) {
    recommendations.push(
      "Ensure all fonts are embedded. Use web fonts or system fonts that allow embedding."
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "All outputs appear compliant. Verify visual quality before final upload."
    );
  }

  return recommendations;
}

/**
 * Run the full comparison and generate report
 */
export async function runComparison(): Promise<ComparisonReport> {
  const defaultDir =
    process.env.OUTPUT_DIR && process.env.OUTPUT_DIR.trim().length > 0
      ? process.env.OUTPUT_DIR
      : join(ROOT, "output", "default-test");

  // Back-compat: if default-test doesn't exist but ROOT/output contains PDFs, use ROOT/output.
  const projectDir =
    existsSync(join(defaultDir, "pagedjs-output.pdf")) ||
    existsSync(join(defaultDir, "vivliostyle-output.pdf")) ||
    existsSync(join(defaultDir, "weasyprint-output.pdf"))
      ? defaultDir
      : join(ROOT, "output");

  return runComparisonInDir(projectDir);
}

export async function runComparisonInDir(outputDir: string): Promise<ComparisonReport> {
  console.log(`\n📊 Running PDF Comparison...\n`);
  console.log(`${"=".repeat(60)}`);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Validate all PDFs
  const pagedJsRgb = existsSync(join(outputDir, "pagedjs-output.pdf"))
    ? await validatePdf(join(outputDir, "pagedjs-output.pdf"))
    : null;

  const pagedJsPdfx = existsSync(join(outputDir, "pagedjs-pdfx.pdf"))
    ? await validatePdf(join(outputDir, "pagedjs-pdfx.pdf"))
    : null;

  const vivliostyleRgb = existsSync(join(outputDir, "vivliostyle-output.pdf"))
    ? await validatePdf(join(outputDir, "vivliostyle-output.pdf"))
    : null;

  const vivliostylePdfx = existsSync(join(outputDir, "vivliostyle-pdfx.pdf"))
    ? await validatePdf(join(outputDir, "vivliostyle-pdfx.pdf"))
    : null;

  const weasyprintRgb = existsSync(join(outputDir, "weasyprint-output.pdf"))
    ? await validatePdf(join(outputDir, "weasyprint-output.pdf"))
    : null;

  const weasyprintPdfx = existsSync(join(outputDir, "weasyprint-pdfx.pdf"))
    ? await validatePdf(join(outputDir, "weasyprint-pdfx.pdf"))
    : null;

  // TAC Validation
  const pagedJsTacValidation = existsSync(join(outputDir, "pagedjs-pdfx.pdf"))
    ? await validateTAC(join(outputDir, "pagedjs-pdfx.pdf"))
    : null;

  const vivliostyleTacValidation = existsSync(join(outputDir, "vivliostyle-pdfx.pdf"))
    ? await validateTAC(join(outputDir, "vivliostyle-pdfx.pdf"))
    : null;

  const weasyprintTacValidation = existsSync(join(outputDir, "weasyprint-pdfx.pdf"))
    ? await validateTAC(join(outputDir, "weasyprint-pdfx.pdf"))
    : null;

  // Compare features
  const featureComparison = compareFeatures(
    pagedJsPdfx?.info || null,
    vivliostylePdfx?.info || null,
    weasyprintPdfx?.info || null
  );

  // Visual comparison of PDF/X outputs
  const visualComparison =
    pagedJsPdfx && vivliostylePdfx
      ? await compareVisually(
          join(outputDir, "pagedjs-pdfx.pdf"),
          join(outputDir, "vivliostyle-pdfx.pdf"),
          outputDir
        )
      : null;

  // Calculate summary
  const summary = calculateSummary(pagedJsPdfx, vivliostylePdfx, weasyprintPdfx);

  // Generate recommendations
  const recommendations = generateRecommendations(
    pagedJsPdfx,
    vivliostylePdfx,
    weasyprintPdfx,
    pagedJsTacValidation,
    vivliostyleTacValidation,
    weasyprintTacValidation
  );

  // Build report
  const report: ComparisonReport = {
    generatedAt: new Date().toISOString(),
    summary,
    pagedjs: {
      rgb: pagedJsRgb,
      pdfx: pagedJsPdfx,
      tacValidation: pagedJsTacValidation,
    },
    vivliostyle: {
      rgb: vivliostyleRgb,
      pdfx: vivliostylePdfx,
      tacValidation: vivliostyleTacValidation,
    },
    weasyprint: {
      rgb: weasyprintRgb,
      pdfx: weasyprintPdfx,
      tacValidation: weasyprintTacValidation,
    },
    featureComparison,
    visualComparison,
    recommendations,
  };

  // Generate markdown
  const markdown = generateMarkdownReport(report);

  // Save report
  const reportPath = join(outputDir, "comparison-report.md");
  await Bun.write(reportPath, markdown);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`\n📄 Report saved to: ${reportPath}`);

  return report;
}

// Run if called directly
if (import.meta.main) {
  const args = process.argv.slice(2);
  const dirFlagIndex = args.findIndex((a) => a === "--dir" || a === "--output");
  const dir = dirFlagIndex >= 0 ? args[dirFlagIndex + 1] : undefined;

  await runComparisonInDir(dir ?? (process.env.OUTPUT_DIR && process.env.OUTPUT_DIR.trim().length > 0
    ? process.env.OUTPUT_DIR
    : join(ROOT, "output", "default-test")));
  console.log("\n✅ Comparison complete!");
}
