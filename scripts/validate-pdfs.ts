#!/usr/bin/env bun
/**
 * Validate PDF files for DriveThruRPG compliance
 * Checks: dimensions, color space, ink coverage, fonts, and PDF/X compliance
 */

import { $ } from "bun";
import { existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// DriveThruRPG specification
const DTRPG_SPEC = {
  trimSize: { width: 6, height: 9 }, // inches
  bleed: 0.125, // inches
  expectedPageSize: { width: 6.25, height: 9.25 }, // trim + bleed
  maxTAC: 240, // Total Area Coverage (ink) percentage
  dpi: 300,
  insideMargin: 0.5, // minimum
  outsideMargin: 0.25, // minimum
  tolerancePct: 2, // 2% tolerance for measurements
};

export interface PdfInfo {
  filename: string;
  filepath: string;
  fileSize: number;
  pageCount: number;
  pageSize: { width: number; height: number };
  pageSizeUnit: string;
  producer: string;
  creator: string;
  pdfVersion: string;
  encrypted: boolean;
  tagged: boolean;
  fonts: FontInfo[];
  colorSpace: string;
  inkCoverage: InkCoverage[];
}

export interface FontInfo {
  name: string;
  type: string;
  encoding: string;
  embedded: boolean;
  subset: boolean;
}

export interface InkCoverage {
  page: number;
  cyan: number;
  magenta: number;
  yellow: number;
  black: number;
  tac: number; // Total Area Coverage
}

export interface ValidationResult {
  filename: string;
  filepath: string;
  valid: boolean;
  info: PdfInfo | null;
  checks: ValidationCheck[];
  errors: string[];
  warnings: string[];
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  severity: "error" | "warning" | "info";
}

/**
 * Get PDF info using pdfinfo command
 */
async function getPdfInfo(filepath: string): Promise<Partial<PdfInfo>> {
  const info: Partial<PdfInfo> = {
    filename: basename(filepath),
    filepath,
  };

  try {
    // Get file size
    const stats = await Bun.file(filepath).stat();
    info.fileSize = stats?.size ?? 0;

    // Get PDF info using pdfinfo
    const result = await $`pdfinfo ${filepath}`.quiet();
    const output = result.stdout.toString();

    // Parse pdfinfo output
    const lines = output.split("\n");
    for (const line of lines) {
      const [key, ...valueParts] = line.split(":");
      const value = valueParts.join(":").trim();

      switch (key?.trim()?.toLowerCase()) {
        case "pages":
          info.pageCount = parseInt(value, 10);
          break;
        case "page size":
          // Parse "450 x 666 pts" or "6.25 x 9.25 in"
          const sizeMatch = value.match(/([\d.]+)\s*x\s*([\d.]+)\s*(\w+)/i);
          if (sizeMatch) {
            let width = parseFloat(sizeMatch[1]);
            let height = parseFloat(sizeMatch[2]);
            const unit = sizeMatch[3].toLowerCase();

            // Convert pts to inches if necessary
            if (unit === "pts" || unit === "pt") {
              width = width / 72;
              height = height / 72;
              info.pageSizeUnit = "in (from pts)";
            } else {
              info.pageSizeUnit = unit;
            }

            info.pageSize = { width, height };
          }
          break;
        case "producer":
          info.producer = value;
          break;
        case "creator":
          info.creator = value;
          break;
        case "pdf version":
          info.pdfVersion = value;
          break;
        case "encrypted":
          info.encrypted = value.toLowerCase() === "yes";
          break;
        case "tagged":
          info.tagged = value.toLowerCase() === "yes";
          break;
      }
    }
  } catch (error) {
    console.error(`Error getting PDF info: ${error}`);
  }

  return info;
}

/**
 * Get embedded fonts using pdffonts command
 */
async function getPdfFonts(filepath: string): Promise<FontInfo[]> {
  const fonts: FontInfo[] = [];

  try {
    const result = await $`pdffonts ${filepath}`.quiet();
    const output = result.stdout.toString();
    const lines = output.split("\n").slice(2); // Skip header lines

    for (const line of lines) {
      if (line.trim() === "") continue;

      // pdffonts output format varies, try to parse it
      const parts = line.split(/\s{2,}/);
      if (parts.length >= 4) {
        fonts.push({
          name: parts[0]?.trim() || "unknown",
          type: parts[1]?.trim() || "unknown",
          encoding: parts[2]?.trim() || "unknown",
          embedded: parts[3]?.trim()?.toLowerCase() === "yes",
          subset: parts[4]?.trim()?.toLowerCase() === "yes",
        });
      }
    }
  } catch (error) {
    // pdffonts might not be available
    console.log(`   ⚠️  pdffonts not available, skipping font analysis`);
  }

  return fonts;
}

/**
 * Get ink coverage per page using Ghostscript inkcov device
 */
async function getInkCoverage(filepath: string): Promise<InkCoverage[]> {
  const coverage: InkCoverage[] = [];

  try {
    const result = await $`gs -o - -sDEVICE=inkcov ${filepath}`.quiet();
    const output = result.stdout.toString();
    const lines = output.split("\n");

    let pageNum = 1;
    for (const line of lines) {
      // Format: "0.12345  0.23456  0.34567  0.45678 CMYK OK"
      const match = line.match(
        /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+CMYK/
      );
      if (match) {
        const [, c, m, y, k] = match;
        const cyan = parseFloat(c) * 100;
        const magenta = parseFloat(m) * 100;
        const yellow = parseFloat(y) * 100;
        const black = parseFloat(k) * 100;
        const tac = cyan + magenta + yellow + black;

        coverage.push({
          page: pageNum++,
          cyan,
          magenta,
          yellow,
          black,
          tac,
        });
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Could not analyze ink coverage`);
  }

  return coverage;
}

/**
 * Detect color space from PDF
 */
async function detectColorSpace(filepath: string): Promise<string> {
  try {
    // Use Ghostscript to detect color space
    const result =
      await $`gs -o - -sDEVICE=txtwrite -dFirstPage=1 -dLastPage=1 ${filepath}`.quiet();

    // Check ink coverage result for CMYK values
    const inkResult = await $`gs -o - -sDEVICE=inkcov -dFirstPage=1 -dLastPage=1 ${filepath}`.quiet();
    const inkOutput = inkResult.stdout.toString();

    if (inkOutput.includes("CMYK")) {
      return "CMYK";
    }

    // Try to determine from pdfinfo
    const infoResult = await $`pdfinfo ${filepath}`.quiet();
    const infoOutput = infoResult.stdout.toString().toLowerCase();

    if (infoOutput.includes("cmyk")) {
      return "CMYK";
    } else if (infoOutput.includes("rgb")) {
      return "RGB";
    }

    return "Unknown";
  } catch (error) {
    return "Unknown";
  }
}

/**
 * Validate a PDF file against DriveThruRPG specifications
 */
export async function validatePdf(filepath: string): Promise<ValidationResult> {
  console.log(`\n🔍 Validating: ${basename(filepath)}`);

  const result: ValidationResult = {
    filename: basename(filepath),
    filepath,
    valid: true,
    info: null,
    checks: [],
    errors: [],
    warnings: [],
  };

  if (!existsSync(filepath)) {
    result.valid = false;
    result.errors.push(`File not found: ${filepath}`);
    return result;
  }

  // Gather PDF information
  const basicInfo = await getPdfInfo(filepath);
  const fonts = await getPdfFonts(filepath);
  const inkCoverage = await getInkCoverage(filepath);
  const colorSpace = await detectColorSpace(filepath);

  result.info = {
    filename: basicInfo.filename || basename(filepath),
    filepath,
    fileSize: basicInfo.fileSize || 0,
    pageCount: basicInfo.pageCount || 0,
    pageSize: basicInfo.pageSize || { width: 0, height: 0 },
    pageSizeUnit: basicInfo.pageSizeUnit || "unknown",
    producer: basicInfo.producer || "unknown",
    creator: basicInfo.creator || "unknown",
    pdfVersion: basicInfo.pdfVersion || "unknown",
    encrypted: basicInfo.encrypted || false,
    tagged: basicInfo.tagged || false,
    fonts,
    colorSpace,
    inkCoverage,
  };

  // Run validation checks
  const checks: ValidationCheck[] = [];

  // Check 1: Page dimensions
  if (result.info.pageSize) {
    const { width, height } = result.info.pageSize;
    const expectedWidth = DTRPG_SPEC.expectedPageSize.width;
    const expectedHeight = DTRPG_SPEC.expectedPageSize.height;
    const tolerance = DTRPG_SPEC.tolerancePct / 100;

    const widthOk =
      Math.abs(width - expectedWidth) <= expectedWidth * tolerance;
    const heightOk =
      Math.abs(height - expectedHeight) <= expectedHeight * tolerance;

    checks.push({
      name: "Page Dimensions",
      passed: widthOk && heightOk,
      expected: `${expectedWidth}" × ${expectedHeight}" (±${DTRPG_SPEC.tolerancePct}%)`,
      actual: `${width.toFixed(3)}" × ${height.toFixed(3)}"`,
      severity: widthOk && heightOk ? "info" : "error",
    });

    if (!widthOk || !heightOk) {
      result.errors.push(
        `Page dimensions (${width.toFixed(2)}" × ${height.toFixed(2)}") don't match expected (${expectedWidth}" × ${expectedHeight}")`
      );
    }
  }

  // Check 2: Color space
  checks.push({
    name: "Color Space",
    passed: colorSpace === "CMYK",
    expected: "CMYK",
    actual: colorSpace,
    severity: colorSpace === "CMYK" ? "info" : "error",
  });

  if (colorSpace !== "CMYK") {
    result.errors.push(`Color space is ${colorSpace}, expected CMYK`);
  }

  // Check 3: Ink coverage (TAC)
  let maxTac = 0;
  let maxTacPage = 0;
  for (const page of inkCoverage) {
    if (page.tac > maxTac) {
      maxTac = page.tac;
      maxTacPage = page.page;
    }
  }

  checks.push({
    name: "Max Ink Coverage (TAC)",
    passed: maxTac <= DTRPG_SPEC.maxTAC,
    expected: `≤ ${DTRPG_SPEC.maxTAC}%`,
    actual: `${maxTac.toFixed(1)}% (page ${maxTacPage})`,
    severity: maxTac <= DTRPG_SPEC.maxTAC ? "info" : "warning",
  });

  if (maxTac > DTRPG_SPEC.maxTAC) {
    result.warnings.push(
      `Max ink coverage (${maxTac.toFixed(1)}%) exceeds ${DTRPG_SPEC.maxTAC}% on page ${maxTacPage}`
    );
  }

  // Check 4: Fonts embedded
  const unembeddedFonts = fonts.filter((f) => !f.embedded);
  checks.push({
    name: "Fonts Embedded",
    passed: unembeddedFonts.length === 0,
    expected: "All fonts embedded",
    actual:
      unembeddedFonts.length === 0
        ? `All ${fonts.length} fonts embedded`
        : `${unembeddedFonts.length} fonts not embedded`,
    severity: unembeddedFonts.length === 0 ? "info" : "error",
  });

  if (unembeddedFonts.length > 0) {
    result.errors.push(
      `Fonts not embedded: ${unembeddedFonts.map((f) => f.name).join(", ")}`
    );
  }

  // Check 5: PDF Version
  const versionOk =
    result.info.pdfVersion === "1.4" || result.info.pdfVersion === "1.3";
  checks.push({
    name: "PDF Version",
    passed: versionOk,
    expected: "1.3 or 1.4 (PDF/X-1a compatible)",
    actual: result.info.pdfVersion,
    severity: versionOk ? "info" : "warning",
  });

  // Check 6: Not encrypted
  checks.push({
    name: "Encryption",
    passed: !result.info.encrypted,
    expected: "Not encrypted",
    actual: result.info.encrypted ? "Encrypted" : "Not encrypted",
    severity: result.info.encrypted ? "error" : "info",
  });

  if (result.info.encrypted) {
    result.errors.push("PDF is encrypted - DriveThruRPG requires unencrypted PDFs");
  }

  // Check 7: Page count (should be reasonable)
  checks.push({
    name: "Page Count",
    passed: result.info.pageCount > 0,
    expected: "> 0 pages",
    actual: `${result.info.pageCount} pages`,
    severity: result.info.pageCount > 0 ? "info" : "error",
  });

  result.checks = checks;
  result.valid = result.errors.length === 0;

  // Print summary
  console.log(`   📊 Pages: ${result.info.pageCount}`);
  console.log(
    `   📐 Size: ${result.info.pageSize?.width?.toFixed(2)}" × ${result.info.pageSize?.height?.toFixed(2)}"`
  );
  console.log(`   🎨 Color: ${colorSpace}`);
  console.log(`   📝 Fonts: ${fonts.length} (${fonts.filter((f) => f.embedded).length} embedded)`);
  console.log(`   🖨️  Max TAC: ${maxTac.toFixed(1)}%`);
  console.log(`   ${result.valid ? "✅ VALID" : "❌ INVALID"}`);

  return result;
}

// Run if called directly
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Validate all PDFs in output directory
    const outputDir = join(ROOT, "output");
    const pdfs = [
      "pagedjs-output.pdf",
      "pagedjs-pdfx.pdf",
      "vivliostyle-output.pdf",
      "vivliostyle-pdfx.pdf",
    ];

    for (const pdf of pdfs) {
      const filepath = join(outputDir, pdf);
      if (existsSync(filepath)) {
        await validatePdf(filepath);
      }
    }
  } else {
    // Validate specified PDFs
    for (const filepath of args) {
      await validatePdf(filepath);
    }
  }

  console.log("\n✅ Validation complete!");
}
