#!/usr/bin/env bun
/**
 * TAC (Total Area Coverage) Validation Script
 *
 * Validates that PDF ink coverage meets DriveThruRPG requirements.
 * Wraps the check_ink.ts tool from the ttrpg-publishing profile.
 *
 * TAC Thresholds:
 * - ≤200%: Pass (safe)
 * - 200-240%: Warning (acceptable but close to limit)
 * - >240%: Fail (exceeds DriveThruRPG maximum)
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";

// Import the existing check_ink.ts from the ttrpg-publishing profile
import { checkInkCoverage, type InkResult } from "/home/founder3/.hyphn/profiles/ttrpg-publishing/skills/pdfx-print-pipeline/scripts/check_ink.ts";

/**
 * TAC Validation Status
 */
export type TACStatus = "pass" | "warn" | "fail";

/**
 * Per-page TAC validation result
 */
export interface TACValidation {
  page: number;
  tac: number;
  status: TACStatus;
  recommendation?: string;
}

/**
 * Overall TAC validation result
 */
export interface TACValidationResult {
  file: string;
  passed: boolean;
  maxTAC: number;
  averageTAC: number;
  pageCount: number;
  pagesOverLimit: number[];
  pagesWithWarnings: number[];
  perPage: TACValidation[];
  recommendations: string[];
  summary: string;
}

/**
 * Determine TAC status based on value
 * - pass: ≤200% (safe)
 * - warn: 200-240% (acceptable but risky)
 * - fail: >240% (exceeds limit)
 */
function getTACStatus(tac: number): TACStatus {
  if (tac > 240) return "fail";
  if (tac > 200) return "warn";
  return "pass";
}

/**
 * Get recommendation for reducing TAC
 */
function getTACRecommendation(tac: number, cmyk: [number, number, number, number]): string | undefined {
  if (tac <= 200) return undefined;

  const [c, m, y, k] = cmyk;
  const recommendations: string[] = [];

  // Check for rich black (should be pure K)
  if (k > 80 && (c > 20 || m > 20 || y > 20)) {
    recommendations.push("Use pure black (0/0/0/100) instead of rich black");
  }

  // Check for high saturation
  if (c + m + y > 200) {
    recommendations.push("Reduce color saturation in images");
  }

  // General recommendations
  if (tac > 240) {
    recommendations.push("Convert to CGATS21_CRPC1.icc profile for lower TAC");
  }

  return recommendations.join("; ") || undefined;
}

/**
 * Validate TAC for a PDF file
 */
export async function validateTAC(pdfPath: string): Promise<TACValidationResult> {
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  // Use the existing check_ink.ts tool
  const inkResult: InkResult = await checkInkCoverage(pdfPath);

  // Convert to validation format
  const perPage: TACValidation[] = inkResult.perPage.map((page) => ({
    page: page.page,
    tac: page.tac,
    status: getTACStatus(page.tac),
    recommendation: getTACRecommendation(page.tac, page.cmyk),
  }));

  // Identify pages with warnings (200-240%)
  const pagesWithWarnings = perPage
    .filter((p) => p.status === "warn")
    .map((p) => p.page);

  // Generate recommendations
  const recommendations: string[] = [];

  if (inkResult.pagesOverLimit.length > 0) {
    recommendations.push(
      `${inkResult.pagesOverLimit.length} page(s) exceed 240% TAC limit (pages: ${inkResult.pagesOverLimit.join(", ")})`
    );
    recommendations.push("Use CGATS21_CRPC1.icc profile for color conversion");
    recommendations.push("Convert images to CMYK before placing in document");
  }

  if (pagesWithWarnings.length > 0) {
    recommendations.push(
      `${pagesWithWarnings.length} page(s) are in warning zone 200-240% TAC (pages: ${pagesWithWarnings.join(", ")})`
    );
    recommendations.push("Consider reducing color saturation to improve print reliability");
  }

  if (inkResult.maxTAC > 300) {
    recommendations.push("Extremely high TAC detected - check for overlapping color areas");
    recommendations.push("Use pure black (0/0/0/100) for text instead of rich black");
  }

  // Generate summary
  const passed = inkResult.pagesOverLimit.length === 0;
  let summary: string;

  if (passed) {
    if (pagesWithWarnings.length > 0) {
      summary = `✅ Passed (with warnings): Max TAC ${inkResult.maxTAC.toFixed(1)}% is within limit, but ${pagesWithWarnings.length} page(s) in warning zone`;
    } else {
      summary = `✅ Passed: All pages ≤200% TAC (max: ${inkResult.maxTAC.toFixed(1)}%)`;
    }
  } else {
    summary = `❌ Failed: ${inkResult.pagesOverLimit.length} page(s) exceed 240% TAC limit (max: ${inkResult.maxTAC.toFixed(1)}%)`;
  }

  return {
    file: basename(pdfPath),
    passed,
    maxTAC: inkResult.maxTAC,
    averageTAC: inkResult.averageTAC,
    pageCount: inkResult.pageCount,
    pagesOverLimit: inkResult.pagesOverLimit,
    pagesWithWarnings,
    perPage,
    recommendations,
    summary,
  };
}

/**
 * Print a formatted TAC validation report
 */
export function printTACReport(result: TACValidationResult): void {
  console.log(`
═══════════════════════════════════════════════════════════════
TAC VALIDATION REPORT
═══════════════════════════════════════════════════════════════

File: ${result.file}
Pages: ${result.pageCount}

─────────────────────────────────────────────────────────────────
TAC SUMMARY
─────────────────────────────────────────────────────────────────

  Maximum TAC:    ${result.maxTAC.toFixed(1)}%
  Average TAC:    ${result.averageTAC.toFixed(1)}%
  Threshold:      ≤240% (DriveThruRPG requirement)

  ${result.summary}
`);

  // Show warnings
  if (result.pagesWithWarnings.length > 0) {
    console.log(`
─────────────────────────────────────────────────────────────────
⚠️  PAGES IN WARNING ZONE (200-240% TAC)
─────────────────────────────────────────────────────────────────
`);
    const warnPages = result.perPage.filter((p) => p.status === "warn");
    for (const p of warnPages.slice(0, 20)) {
      console.log(`  Page ${p.page}: ${p.tac.toFixed(1)}% TAC`);
      if (p.recommendation) {
        console.log(`    → ${p.recommendation}`);
      }
    }
    if (warnPages.length > 20) {
      console.log(`  ... and ${warnPages.length - 20} more pages`);
    }
  }

  // Show errors
  if (result.pagesOverLimit.length > 0) {
    console.log(`
─────────────────────────────────────────────────────────────────
❌ PAGES OVER 240% TAC LIMIT
─────────────────────────────────────────────────────────────────
`);
    const failPages = result.perPage.filter((p) => p.status === "fail");
    for (const p of failPages.slice(0, 20)) {
      console.log(`  Page ${p.page}: ${p.tac.toFixed(1)}% TAC`);
      if (p.recommendation) {
        console.log(`    → ${p.recommendation}`);
      }
    }
    if (failPages.length > 20) {
      console.log(`  ... and ${failPages.length - 20} more pages`);
    }
  }

  // Show recommendations
  if (result.recommendations.length > 0) {
    console.log(`
─────────────────────────────────────────────────────────────────
RECOMMENDATIONS
─────────────────────────────────────────────────────────────────
`);
    for (const rec of result.recommendations) {
      console.log(`  • ${rec}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

// CLI usage
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(`
TAC Validation Tool

Validates PDF ink coverage against DriveThruRPG requirements.

Usage:
  bun run validate-tac.ts <pdf-file> [options]

Options:
  --json      Output as JSON instead of formatted report
  --quiet     Only show summary, suppress detailed output

Thresholds:
  ≤200%       ✅ Pass (safe)
  200-240%    ⚠️  Warning (acceptable but risky)
  >240%       ❌ Fail (exceeds DriveThruRPG limit)
`);
    process.exit(0);
  }

  const pdfPath = args.find((a) => !a.startsWith("--"));
  const jsonOutput = args.includes("--json");
  const quiet = args.includes("--quiet");

  if (!pdfPath) {
    console.error("Error: No PDF file specified");
    process.exit(1);
  }

  try {
    const result = await validateTAC(pdfPath);

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else if (quiet) {
      console.log(result.summary);
    } else {
      printTACReport(result);
    }

    // Exit with code 1 if validation failed
    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}
