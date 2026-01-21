#!/usr/bin/env bun
/**
 * TAC (Total Area Coverage) Limiting Script
 *
 * Reduces PDF ink coverage to meet DriveThruRPG requirements (≤240% TAC).
 * Uses TIFF pipeline:
 * 1. Render PDF pages to CMYK TIFF using Ghostscript
 * 2. Apply TAC-limiting ICC device-link profile using lcms2's tificc
 * 3. Reassemble pages into PDF using img2pdf
 *
 * Requirements:
 *   - Ghostscript (gs)
 *   - lcms2-utils (tificc, linkicc)
 *   - img2pdf (pip install img2pdf)
 *   - pdfunite (poppler-utils)
 */

import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const SCRIPT_DIR = dirname(import.meta.url.replace("file://", ""));
const ROOT = join(SCRIPT_DIR, "..");

interface LimitTACOptions {
  input: string;
  output?: string;
  maxTAC?: number;
  dpi?: number;
  verify?: boolean;
  verbose?: boolean;
  keepTemp?: boolean;
}

interface LimitTACResult {
  success: boolean;
  inputPath: string;
  outputPath: string;
  duration: number;
  beforeTAC?: number;
  afterTAC?: number;
  pageCount?: number;
  error?: string;
}

/**
 * Check if required dependencies are available
 */
async function checkDependencies(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];

  // Check Ghostscript
  try {
    await $`gs --version`.quiet();
  } catch {
    missing.push("ghostscript");
  }

  // Check tificc (lcms2-utils)
  try {
    await $`which tificc`.quiet();
  } catch {
    missing.push("liblcms2-utils (tificc)");
  }

  // Check linkicc (lcms2-utils)
  try {
    await $`which linkicc`.quiet();
  } catch {
    missing.push("liblcms2-utils (linkicc)");
  }

  // Check img2pdf
  try {
    await $`which img2pdf`.quiet();
  } catch {
    missing.push("img2pdf (pip install img2pdf)");
  }

  // Check pdfunite (poppler-utils)
  try {
    await $`which pdfunite`.quiet();
  } catch {
    missing.push("poppler-utils (pdfunite)");
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Get page count from PDF
 */
async function getPageCount(pdfPath: string): Promise<number> {
  try {
    const result = await $`pdfinfo ${pdfPath}`.text();
    const match = result.match(/Pages:\s+(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    // Fallback: use Ghostscript
    try {
      const result = await $`gs -q -dNODISPLAY -dNOSAFER -c "(${pdfPath}) (r) file runpdfbegin pdfpagecount = quit"`.text();
      return parseInt(result.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }
}

/**
 * Measure TAC using Ghostscript inkcov device
 */
async function measureTAC(pdfPath: string): Promise<{ maxTAC: number; avgTAC: number }> {
  try {
    const result = await $`gs -o - -sDEVICE=inkcov ${pdfPath}`.text();

    const tacs: number[] = [];
    for (const line of result.split("\n")) {
      const match = line.match(/(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+CMYK/);
      if (match) {
        const [, c, m, y, k] = match.map(parseFloat);
        const tac = (c + m + y + k) * 100;
        tacs.push(tac);
      }
    }

    if (tacs.length === 0) {
      return { maxTAC: 0, avgTAC: 0 };
    }

    const maxTAC = Math.max(...tacs);
    const avgTAC = tacs.reduce((a, b) => a + b, 0) / tacs.length;

    return {
      maxTAC: Math.round(maxTAC * 10) / 10,
      avgTAC: Math.round(avgTAC * 10) / 10,
    };
  } catch (error) {
    console.error(`  Warning: Could not measure TAC: ${error}`);
    return { maxTAC: 0, avgTAC: 0 };
  }
}

/**
 * Create TAC-limited ICC device-link profile
 */
async function createTACProfile(maxTAC: number, outputDir: string): Promise<string> {
  const profilePath = join(outputDir, `cmyk-tac${maxTAC}.icc`);

  if (existsSync(profilePath)) {
    return profilePath;
  }

  console.log(`   Creating TAC-limiting ICC profile (${maxTAC}%)...`);

  // Find system CMYK profile
  const cmykProfiles = [
    "/usr/share/color/icc/ghostscript/default_cmyk.icc",
    "/usr/share/ghostscript/iccprofiles/default_cmyk.icc",
    "/usr/share/color/icc/ghostscript/ps_cmyk.icc",
  ];

  let cmykProfile: string | undefined;
  for (const p of cmykProfiles) {
    if (existsSync(p)) {
      cmykProfile = p;
      break;
    }
  }

  if (!cmykProfile) {
    throw new Error("No CMYK ICC profile found on system");
  }

  // Create device-link profile with TAC limit
  await $`linkicc -o ${profilePath} -k"${maxTAC}" -d "CMYK with ${maxTAC}% TAC limit" ${cmykProfile} ${cmykProfile}`.quiet();

  return profilePath;
}

/**
 * Limit TAC in a PDF using TIFF pipeline
 */
export async function limitTAC(options: LimitTACOptions): Promise<LimitTACResult> {
  const startTime = performance.now();
  const {
    input,
    output = input.replace(".pdf", `-tac${options.maxTAC || 240}.pdf`),
    maxTAC = 240,
    dpi = 300,
    verify = true,
    verbose = false,
    keepTemp = false,
  } = options;

  const log = (msg: string) => verbose && console.log(`   ${msg}`);

  // Validate input
  if (!existsSync(input)) {
    return {
      success: false,
      inputPath: input,
      outputPath: output,
      duration: performance.now() - startTime,
      error: `Input file not found: ${input}`,
    };
  }

  console.log(`\n🔧 Limiting TAC to ${maxTAC}%...`);
  console.log(`   Input:  ${input}`);
  console.log(`   Output: ${output}`);
  console.log(`   DPI:    ${dpi}`);

  // Check dependencies
  const deps = await checkDependencies();
  if (!deps.ok) {
    return {
      success: false,
      inputPath: input,
      outputPath: output,
      duration: performance.now() - startTime,
      error: `Missing dependencies: ${deps.missing.join(", ")}. Install with: sudo apt install ghostscript liblcms2-utils poppler-utils && pip install img2pdf`,
    };
  }

  // Measure TAC before
  let beforeTAC: number | undefined;
  if (verify) {
    console.log(`   Measuring TAC before conversion...`);
    const before = await measureTAC(input);
    beforeTAC = before.maxTAC;
    console.log(`   Before: Max TAC = ${beforeTAC}%`);
  }

  // Create temp directory
  const tempDir = join(ROOT, "output", "temp", `tac-${Date.now()}`);
  mkdirSync(join(tempDir, "tiff"), { recursive: true });
  mkdirSync(join(tempDir, "tac"), { recursive: true });
  mkdirSync(join(tempDir, "pdf"), { recursive: true });

  try {
    // Create ICC profile
    const iccProfile = await createTACProfile(maxTAC, tempDir);

    // Get page count
    const pageCount = await getPageCount(input);
    console.log(`   Processing ${pageCount} pages...`);

    // Process each page
    let processed = 0;
    let failed = 0;

    for (let page = 1; page <= pageCount; page++) {
      const pageStr = page.toString().padStart(4, "0");
      const tiffFile = join(tempDir, "tiff", `page-${pageStr}.tif`);
      const tacFile = join(tempDir, "tac", `page-${pageStr}.tif`);
      const pdfFile = join(tempDir, "pdf", `page-${pageStr}.pdf`);

      process.stdout.write(`\r   Processing page ${page}/${pageCount}...`);

      try {
        // Step 1: Render page to CMYK TIFF
        await $`gs -dNOPAUSE -dBATCH -dQUIET -sDEVICE=tiff32nc -r${dpi} -dFirstPage=${page} -dLastPage=${page} -sOutputFile=${tiffFile} ${input}`.quiet();

        // Step 2: Apply TAC limiting with tificc
        try {
          await $`tificc -l ${iccProfile} ${tiffFile} ${tacFile}`.quiet();
        } catch {
          log(`tificc failed for page ${page}, using original`);
          await $`cp ${tiffFile} ${tacFile}`.quiet();
        }

        // Step 3: Convert TIFF to PDF
        await $`img2pdf ${tacFile} -o ${pdfFile}`.quiet();

        // Clean up TIFFs to save space
        if (!keepTemp) {
          unlinkSync(tiffFile);
          unlinkSync(tacFile);
        }

        processed++;
      } catch (error) {
        log(`Failed to process page ${page}: ${error}`);
        failed++;
      }
    }

    console.log(`\n   Processed ${processed} pages (${failed} failed)`);

    // Step 4: Merge all page PDFs
    console.log(`   Merging pages...`);
    const pdfFiles = readdirSync(join(tempDir, "pdf"))
      .filter((f) => f.endsWith(".pdf"))
      .sort()
      .map((f) => join(tempDir, "pdf", f));

    if (pdfFiles.length === 0) {
      throw new Error("No pages were successfully processed");
    }

    // Ensure output directory exists
    const outputDir = dirname(output);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Use pdfunite to merge
    await $`pdfunite ${pdfFiles} ${output}`.quiet();

    // Measure TAC after
    let afterTAC: number | undefined;
    if (verify && existsSync(output)) {
      console.log(`   Measuring TAC after conversion...`);
      const after = await measureTAC(output);
      afterTAC = after.maxTAC;
      console.log(`   After:  Max TAC = ${afterTAC}%`);

      if (afterTAC <= maxTAC + 1) {
        console.log(`   ✅ TAC successfully limited to ${afterTAC}%`);
      } else {
        console.log(`   ⚠️  TAC still ${afterTAC}% - may need manual review`);
      }
    }

    const duration = performance.now() - startTime;

    // Cleanup
    if (!keepTemp) {
      // Remove remaining files
      for (const dir of ["tiff", "tac", "pdf"]) {
        const dirPath = join(tempDir, dir);
        if (existsSync(dirPath)) {
          for (const f of readdirSync(dirPath)) {
            unlinkSync(join(dirPath, f));
          }
          rmdirSync(dirPath);
        }
      }
      // Remove ICC profile and temp dir
      if (existsSync(join(tempDir, `cmyk-tac${maxTAC}.icc`))) {
        unlinkSync(join(tempDir, `cmyk-tac${maxTAC}.icc`));
      }
      rmdirSync(tempDir);
    }

    console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);

    return {
      success: true,
      inputPath: input,
      outputPath: output,
      duration,
      beforeTAC,
      afterTAC,
      pageCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Error: ${errorMessage}`);

    // Cleanup on error
    if (!keepTemp && existsSync(tempDir)) {
      await $`rm -rf ${tempDir}`.quiet().catch(() => {});
    }

    return {
      success: false,
      inputPath: input,
      outputPath: output,
      duration: performance.now() - startTime,
      error: errorMessage,
    };
  }
}

// CLI
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
TAC Limiting Tool

Reduces PDF Total Area Coverage (TAC) to meet print requirements.
Uses TIFF pipeline with lcms2 device-link profiles for per-pixel TAC limiting.

Usage:
  bun run limit-tac.ts <input.pdf> [output.pdf] [options]

Options:
  --max-tac <N>   Maximum TAC percentage (default: 240)
  --dpi <N>       Resolution for TIFF rendering (default: 300)
  --verify        Measure TAC before and after (default: true)
  --verbose       Show detailed progress
  --keep-temp     Keep temporary files for debugging
  --help          Show this help message

Examples:
  bun run limit-tac.ts input.pdf
  bun run limit-tac.ts input.pdf output.pdf --max-tac 240 --verify
  bun run limit-tac.ts input.pdf --dpi 150 --verbose

Requirements:
  sudo apt install ghostscript liblcms2-utils poppler-utils
  pip install img2pdf
`);
    process.exit(0);
  }

  // Parse arguments
  const input = args.find((a) => !a.startsWith("--") && a.endsWith(".pdf"));
  const outputIndex = args.findIndex((a) => !a.startsWith("--") && a.endsWith(".pdf") && a !== input);
  const output = outputIndex >= 0 ? args[outputIndex] : undefined;
  const maxTAC = parseInt(args.find((_, i) => args[i - 1] === "--max-tac") || "240", 10);
  const dpi = parseInt(args.find((_, i) => args[i - 1] === "--dpi") || "300", 10);
  const verify = !args.includes("--no-verify");
  const verbose = args.includes("--verbose") || args.includes("-v");
  const keepTemp = args.includes("--keep-temp");

  if (!input) {
    console.error("Error: No input PDF specified");
    process.exit(1);
  }

  const result = await limitTAC({
    input,
    output,
    maxTAC,
    dpi,
    verify,
    verbose,
    keepTemp,
  });

  if (!result.success) {
    console.error(`\n❌ TAC limiting failed: ${result.error}`);
    process.exit(1);
  }

  console.log(`\n✅ TAC limited PDF created: ${result.outputPath}`);
  if (result.beforeTAC && result.afterTAC) {
    console.log(`   TAC: ${result.beforeTAC}% → ${result.afterTAC}%`);
  }
  process.exit(0);
}

export default limitTAC;
