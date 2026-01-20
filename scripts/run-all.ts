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
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { processBatch } from "./batch-process.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

type ProjectRunResult = {
  name: string;
  inputDir: string;
  outputDir: string;
  duration: number;
  success: boolean;
  pagedjs: { build: boolean; convert: boolean };
  vivliostyle: { build: boolean; convert: boolean };
  errors: string[];
};

interface BatchPipelineResult {
  success: boolean;
  projects: ProjectRunResult[];
  totalDuration: number;
  outputBaseDir: string;
  summaryPath: string | null;
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
}): Promise<BatchPipelineResult> {
  const startTime = performance.now();

  const outputBaseDir =
    process.env.OUTPUT_DIR && process.env.OUTPUT_DIR.trim().length > 0
      ? process.env.OUTPUT_DIR
      : join(ROOT, "output");
  if (!existsSync(outputBaseDir)) {
    mkdirSync(outputBaseDir, { recursive: true });
  }

  const envInputDir =
    process.env.INPUT_DIR && process.env.INPUT_DIR.trim().length > 0
      ? process.env.INPUT_DIR
      : null;

  const envDirHasContent = (dir: string): boolean => {
    try {
      return existsSync(dir) && readdirSync(dir).length > 0;
    } catch {
      return false;
    }
  };

  const inputDir = envInputDir ?? join(ROOT, "input");
  let usingBundledDefault = envInputDir === null;
  if (!usingBundledDefault && envInputDir && !envDirHasContent(envInputDir)) {
    usingBundledDefault = true;
  }

  const hasHtmlFiles = (dir: string): boolean => {
    try {
      return readdirSync(dir).some((f) => f.toLowerCase().endsWith(".html"));
    } catch {
      return false;
    }
  };

  const listSubdirs = (dir: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(dir, d.name));
    } catch {
      return [];
    }
  };

  const projectsToProcess: Array<{ name: string; dir: string }> = [];

  if (usingBundledDefault) {
    projectsToProcess.push({ name: "default-test", dir: join(ROOT, "input") });
  } else {
    const inputIsProject = existsSync(inputDir) && hasHtmlFiles(inputDir);
    if (inputIsProject) {
      projectsToProcess.push({ name: "project", dir: inputDir });
    } else {
      // Process each subdirectory as a separate project if it contains HTML files
      for (const subdir of listSubdirs(inputDir)) {
        if (hasHtmlFiles(subdir)) {
          projectsToProcess.push({ name: basename(subdir), dir: subdir });
        }
      }

      // Also allow HTML files directly in the input root (docker-entrypoint calls this "root")
      if (hasHtmlFiles(inputDir)) {
        projectsToProcess.push({ name: "root", dir: inputDir });
      }
    }
  }

  if (projectsToProcess.length === 0 && !usingBundledDefault) {
    // Mirror docker-entrypoint behavior: if a mounted INPUT_DIR doesn't contain
    // any valid projects, fall back to the bundled default test document.
    usingBundledDefault = true;
    projectsToProcess.push({ name: "default-test", dir: join(ROOT, "input") });
  }

  if (projectsToProcess.length === 0) {
    console.error("\n❌ Error: No HTML projects found!");
    console.error(`   INPUT_DIR: ${inputDir}`);
    console.error("   Expected either: (a) HTML files in INPUT_DIR, or (b) subdirectories each containing HTML.");
    return {
      success: false,
      projects: [],
      totalDuration: performance.now() - startTime,
      outputBaseDir,
      summaryPath: null,
    };
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`   PDFX TEST HARNESS`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\n📁 Input base: ${inputDir}`);
  console.log(`📁 Output base: ${outputBaseDir}`);
  console.log(`📦 Projects: ${projectsToProcess.map((p) => p.name).join(", ")}`);

  const projects: ProjectRunResult[] = [];
  for (const project of projectsToProcess) {
    const projectStart = performance.now();
    const projectOutputDir = join(outputBaseDir, project.name);

    const batchResult = await processBatch({
      inputDir: project.dir,
      outputDir: projectOutputDir,
      htmlFile: "book.html",
      skipPagedJS: Boolean(options.skipPagedJS),
      skipVivliostyle: Boolean(options.skipVivliostyle),
      skipConvert: Boolean(options.skipConvert),
      skipCompare: Boolean(options.skipCompare),
    });

    projects.push({
      name: project.name,
      inputDir: project.dir,
      outputDir: projectOutputDir,
      duration: performance.now() - projectStart,
      success: batchResult.success,
      pagedjs: batchResult.pagedjs,
      vivliostyle: batchResult.vivliostyle,
      errors: batchResult.errors,
    });
  }

  // Write a summary report (matches docker-entrypoint behavior)
  const summaryPath = join(outputBaseDir, "batch-summary.md");
  try {
    const lines: string[] = [];
    lines.push("# PDFX Test Harness - Batch Summary");
    lines.push("");
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## Projects Processed");
    lines.push("");

    for (const p of projects) {
      const status = p.success ? "✅ Complete" : "❌ Failed";
      lines.push(`### ${p.name}`);
      lines.push("");
      lines.push(`- **Status:** ${status}`);
      lines.push(`- **Input:** ${p.inputDir}`);
      lines.push(`- **Output:** ./${p.name}`);

      const pjBuildStatus = options.skipPagedJS ? "⏭️" : p.pagedjs.build ? "✅" : "❌";
      const pjConvertStatus =
        options.skipPagedJS || options.skipConvert ? "⏭️" : p.pagedjs.convert ? "✅" : "❌";
      const vsBuildStatus = options.skipVivliostyle ? "⏭️" : p.vivliostyle.build ? "✅" : "❌";
      const vsConvertStatus =
        options.skipVivliostyle || options.skipConvert ? "⏭️" : p.vivliostyle.convert ? "✅" : "❌";

      lines.push(`- **PagedJS:** build=${pjBuildStatus}, pdfx=${pjConvertStatus}`);
      lines.push(`- **Vivliostyle:** build=${vsBuildStatus}, pdfx=${vsConvertStatus}`);

      const reportCandidate = join(p.outputDir, "comparison-report.md");
      if (existsSync(reportCandidate)) {
        lines.push(`- **Report:** [comparison-report.md](./${p.name}/comparison-report.md)`);
      }

      if (p.errors.length > 0) {
        lines.push("- **Errors:**");
        for (const e of p.errors) {
          lines.push(`  - ${e}`);
        }
      }

      lines.push("");
    }

    await Bun.write(summaryPath, lines.join("\n"));
  } catch {
    // Non-fatal
  }

  const totalDuration = performance.now() - startTime;
  const overallSuccess = projects.every((p) => p.success);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`   PIPELINE COMPLETE`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\n📊 Overall: ${overallSuccess ? "✅ SUCCESS" : "❌ FAIL"}`);
  console.log(`⏱️  Total Time: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`📄 Summary: ${summaryPath}`);

  return {
    success: overallSuccess,
    projects,
    totalDuration,
    outputBaseDir,
    summaryPath,
  };
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
  OUTPUT_DIR/batch-summary.md
  OUTPUT_DIR/<project>/pagedjs-output.pdf
  OUTPUT_DIR/<project>/pagedjs-pdfx.pdf
  OUTPUT_DIR/<project>/vivliostyle-output.pdf
  OUTPUT_DIR/<project>/vivliostyle-pdfx.pdf
  OUTPUT_DIR/<project>/comparison-report.md

Input discovery:
  - If INPUT_DIR is unset: uses bundled ./input and outputs to ./output/default-test
  - If INPUT_DIR contains HTML files: runs as a single project ("project")
  - If INPUT_DIR contains subfolders with HTML files: runs each subfolder as a project
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
