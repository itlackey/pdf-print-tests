#!/usr/bin/env bun
/**
 * PDFX Test Harness - Main Runner
 * 
 * Orchestrates the complete test pipeline:
 * 1. Build PDF with PagedJS CLI
 * 2. Build PDF with Vivliostyle CLI
 * 3. Convert both to PDF/X using Ghostscript
 * 4. Validate all outputs
 * 5. Generate comparison report
 */

import { $ } from "bun";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildWithPagedJS } from "./build-pagedjs.ts";
import { buildWithVivliostyle } from "./build-vivliostyle.ts";
import { convertToPdfx } from "./convert-pdfx.ts";
import { runComparison } from "./compare-pdfs.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

interface PipelineResult {
  success: boolean;
  pagedjs: {
    buildSuccess: boolean;
    buildDuration: number;
    convertSuccess: boolean;
    convertDuration: number;
    errors: string[];
  };
  vivliostyle: {
    buildSuccess: boolean;
    buildDuration: number;
    convertSuccess: boolean;
    convertDuration: number;
    errors: string[];
  };
  reportPath: string | null;
  totalDuration: number;
}

async function checkDependencies(): Promise<{ ok: boolean; missing: string[] }> {
  console.log("🔍 Checking dependencies...\n");
  const missing: string[] = [];

  // Check for required CLI tools
  const tools = [
    { cmd: "gs --version", name: "Ghostscript" },
    { cmd: "pdfinfo -v", name: "Poppler (pdfinfo)" },
    { cmd: "convert --version", name: "ImageMagick" },
    { cmd: "pdftoppm -v", name: "Poppler (pdftoppm)" },
  ];

  for (const tool of tools) {
    try {
      await $`${tool.cmd.split(" ")}`.quiet().nothrow();
      console.log(`   ✅ ${tool.name}`);
    } catch {
      console.log(`   ❌ ${tool.name} - MISSING`);
      missing.push(tool.name);
    }
  }

  // Check npm packages (we'll install them if needed)
  console.log(`\n   📦 Checking npm packages...`);

  return { ok: missing.length === 0, missing };
}

async function installDependencies(): Promise<void> {
  console.log("\n📦 Installing npm dependencies...");

  try {
    await $`cd ${ROOT} && bun install`.quiet();
    console.log("   ✅ Dependencies installed");
  } catch (error) {
    console.log("   ⚠️  Could not install dependencies automatically");
    console.log("   Run 'bun install' manually in the project directory");
  }
}

async function runPipeline(options: {
  skipPagedJS?: boolean;
  skipVivliostyle?: boolean;
  skipConvert?: boolean;
  skipCompare?: boolean;
}): Promise<PipelineResult> {
  const startTime = performance.now();

  const result: PipelineResult = {
    success: true,
    pagedjs: {
      buildSuccess: false,
      buildDuration: 0,
      convertSuccess: false,
      convertDuration: 0,
      errors: [],
    },
    vivliostyle: {
      buildSuccess: false,
      buildDuration: 0,
      convertSuccess: false,
      convertDuration: 0,
      errors: [],
    },
    reportPath: null,
    totalDuration: 0,
  };

  const outputDir = join(ROOT, "output");
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const inputHtml = join(ROOT, "book.html");

  // Verify input exists
  if (!existsSync(inputHtml)) {
    console.error("\n❌ Error: book.html not found!");
    result.success = false;
    return result;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`   PDFX TEST HARNESS`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\n📄 Input: ${inputHtml}`);
  console.log(`📁 Output: ${outputDir}\n`);

  // Step 1: Build with PagedJS
  if (!options.skipPagedJS) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`STEP 1: Build with PagedJS CLI`);
    console.log(`${"─".repeat(40)}`);

    const pjResult = await buildWithPagedJS({
      input: inputHtml,
      output: join(outputDir, "pagedjs-output.pdf"),
      timeout: 120000,
    });

    result.pagedjs.buildSuccess = pjResult.success;
    result.pagedjs.buildDuration = pjResult.duration;
    if (pjResult.error) {
      result.pagedjs.errors.push(pjResult.error);
    }
  } else {
    console.log("\n⏭️  Skipping PagedJS build");
  }

  // Step 2: Build with Vivliostyle
  if (!options.skipVivliostyle) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`STEP 2: Build with Vivliostyle CLI`);
    console.log(`${"─".repeat(40)}`);

    const vsResult = await buildWithVivliostyle({
      input: inputHtml,
      output: join(outputDir, "vivliostyle-output.pdf"),
      timeout: 120000,
    });

    result.vivliostyle.buildSuccess = vsResult.success;
    result.vivliostyle.buildDuration = vsResult.duration;
    if (vsResult.error) {
      result.vivliostyle.errors.push(vsResult.error);
    }
  } else {
    console.log("\n⏭️  Skipping Vivliostyle build");
  }

  // Step 3: Convert to PDF/X
  if (!options.skipConvert) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`STEP 3: Convert to PDF/X (Ghostscript)`);
    console.log(`${"─".repeat(40)}`);

    // Convert PagedJS output
    if (result.pagedjs.buildSuccess || existsSync(join(outputDir, "pagedjs-output.pdf"))) {
      const pjConvert = await convertToPdfx({
        input: join(outputDir, "pagedjs-output.pdf"),
        output: join(outputDir, "pagedjs-pdfx.pdf"),
        title: "PagedJS Test Output",
      });
      result.pagedjs.convertSuccess = pjConvert.success;
      result.pagedjs.convertDuration = pjConvert.duration;
      if (pjConvert.error) {
        result.pagedjs.errors.push(pjConvert.error);
      }
    }

    // Convert Vivliostyle output
    if (result.vivliostyle.buildSuccess || existsSync(join(outputDir, "vivliostyle-output.pdf"))) {
      const vsConvert = await convertToPdfx({
        input: join(outputDir, "vivliostyle-output.pdf"),
        output: join(outputDir, "vivliostyle-pdfx.pdf"),
        title: "Vivliostyle Test Output",
      });
      result.vivliostyle.convertSuccess = vsConvert.success;
      result.vivliostyle.convertDuration = vsConvert.duration;
      if (vsConvert.error) {
        result.vivliostyle.errors.push(vsConvert.error);
      }
    }
  } else {
    console.log("\n⏭️  Skipping PDF/X conversion");
  }

  // Step 4: Validate and Compare
  if (!options.skipCompare) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`STEP 4: Validate and Compare`);
    console.log(`${"─".repeat(40)}`);

    try {
      const comparison = await runComparison();
      result.reportPath = join(ROOT, "reports", "comparison-report.md");
    } catch (error) {
      console.error(`   ❌ Comparison failed: ${error}`);
    }
  } else {
    console.log("\n⏭️  Skipping comparison");
  }

  // Summary
  result.totalDuration = performance.now() - startTime;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`   PIPELINE COMPLETE`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\n📊 Results Summary:`);
  console.log(`\n   PagedJS:`);
  console.log(`      Build: ${result.pagedjs.buildSuccess ? "✅" : "❌"} (${(result.pagedjs.buildDuration / 1000).toFixed(2)}s)`);
  console.log(`      PDF/X: ${result.pagedjs.convertSuccess ? "✅" : "❌"} (${(result.pagedjs.convertDuration / 1000).toFixed(2)}s)`);

  console.log(`\n   Vivliostyle:`);
  console.log(`      Build: ${result.vivliostyle.buildSuccess ? "✅" : "❌"} (${(result.vivliostyle.buildDuration / 1000).toFixed(2)}s)`);
  console.log(`      PDF/X: ${result.vivliostyle.convertSuccess ? "✅" : "❌"} (${(result.vivliostyle.convertDuration / 1000).toFixed(2)}s)`);

  console.log(`\n   Total Time: ${(result.totalDuration / 1000).toFixed(2)}s`);

  if (result.reportPath) {
    console.log(`\n📄 Report: ${result.reportPath}`);
  }

  // List generated files
  console.log(`\n📁 Generated Files:`);
  const expectedFiles = [
    "pagedjs-output.pdf",
    "pagedjs-pdfx.pdf",
    "vivliostyle-output.pdf",
    "vivliostyle-pdfx.pdf",
  ];

  for (const file of expectedFiles) {
    const filepath = join(outputDir, file);
    if (existsSync(filepath)) {
      const stats = await Bun.file(filepath).stat();
      const size = ((stats?.size ?? 0) / 1024).toFixed(1);
      console.log(`   ✅ ${file} (${size} KB)`);
    } else {
      console.log(`   ❌ ${file} (not created)`);
    }
  }

  // Check overall success
  result.success =
    (result.pagedjs.buildSuccess || options.skipPagedJS) &&
    (result.vivliostyle.buildSuccess || options.skipVivliostyle);

  return result;
}

// Parse CLI arguments
function parseArgs(): {
  skipPagedJS: boolean;
  skipVivliostyle: boolean;
  skipConvert: boolean;
  skipCompare: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);

  const options = {
    skipPagedJS: false,
    skipVivliostyle: false,
    skipConvert: false,
    skipCompare: false,
    help: false,
  };

  for (const arg of args) {
    switch (arg) {
      case "--skip-pagedjs":
        options.skipPagedJS = true;
        break;
      case "--skip-vivliostyle":
        options.skipVivliostyle = true;
        break;
      case "--skip-convert":
        options.skipConvert = true;
        break;
      case "--skip-compare":
        options.skipCompare = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
PDFX Test Harness
=================

Compare PagedJS and Vivliostyle PDF rendering for DriveThruRPG compliance.

Usage:
  bun run scripts/run-all.ts [options]

Options:
  --skip-pagedjs      Skip PagedJS build step
  --skip-vivliostyle  Skip Vivliostyle build step
  --skip-convert      Skip PDF/X conversion step
  --skip-compare      Skip validation and comparison step
  -h, --help          Show this help message

Examples:
  bun run scripts/run-all.ts                    # Run full pipeline
  bun run scripts/run-all.ts --skip-pagedjs     # Only test Vivliostyle
  bun run scripts/run-all.ts --skip-convert     # Compare RGB PDFs only

Output:
  output/pagedjs-output.pdf       PagedJS RGB PDF
  output/pagedjs-pdfx.pdf         PagedJS PDF/X
  output/vivliostyle-output.pdf   Vivliostyle RGB PDF
  output/vivliostyle-pdfx.pdf     Vivliostyle PDF/X
  reports/comparison-report.md    Detailed comparison report
`);
}

// Main entry point
if (import.meta.main) {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Check dependencies
  const depCheck = await checkDependencies();

  if (!depCheck.ok) {
    console.log(`\n⚠️  Missing system dependencies: ${depCheck.missing.join(", ")}`);
    console.log(`   Install them with your system package manager.`);
    console.log(`   Ubuntu: sudo apt install ghostscript poppler-utils imagemagick`);
    console.log(`   macOS: brew install ghostscript poppler imagemagick`);
    console.log(`\n   Continuing anyway - some features may not work.\n`);
  }

  // Install npm dependencies
  await installDependencies();

  // Run the pipeline
  const result = await runPipeline(options);

  // Exit with appropriate code
  process.exit(result.success ? 0 : 1);
}
