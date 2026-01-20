#!/usr/bin/env bun
/**
 * Batch Process Script
 * Processes a single project directory with configurable input/output paths
 * Used by Docker entrypoint for batch processing multiple projects
 */

import { $ } from "bun";
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { buildWithPagedJS } from "./build-pagedjs.ts";
import { buildWithVivliostyle } from "./build-vivliostyle.ts";
import { convertToPdfx } from "./convert-pdfx.ts";
import { runComparison } from "./compare-pdfs.ts";
import { validatePdf } from "./validate-pdfs.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "..");

interface BatchOptions {
  inputDir: string;
  outputDir: string;
  htmlFile: string;
  skipPagedJS: boolean;
  skipVivliostyle: boolean;
  skipConvert: boolean;
  skipCompare: boolean;
}

function parseArgs(): BatchOptions {
  const args = process.argv.slice(2);
  const options: BatchOptions = {
    inputDir: process.cwd(),
    outputDir: join(process.cwd(), "output"),
    htmlFile: "book.html",
    skipPagedJS: false,
    skipVivliostyle: false,
    skipConvert: false,
    skipCompare: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--input":
        options.inputDir = nextArg;
        i++;
        break;
      case "--output":
        options.outputDir = nextArg;
        i++;
        break;
      case "--html":
        options.htmlFile = nextArg;
        i++;
        break;
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
    }
  }

  return options;
}

async function processBatch(options: BatchOptions): Promise<{
  success: boolean;
  pagedjs: { build: boolean; convert: boolean };
  vivliostyle: { build: boolean; convert: boolean };
  errors: string[];
}> {
  const result = {
    success: true,
    pagedjs: { build: false, convert: false },
    vivliostyle: { build: false, convert: false },
    errors: [] as string[],
  };

  const { inputDir, outputDir, htmlFile } = options;

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Find the HTML file
  const htmlPath = join(inputDir, htmlFile);
  if (!existsSync(htmlPath)) {
    // Try to find any HTML file
    const htmlFiles = readdirSync(inputDir).filter((f) => f.endsWith(".html"));
    if (htmlFiles.length === 0) {
      result.errors.push(`No HTML file found in ${inputDir}`);
      result.success = false;
      return result;
    }
    console.log(`Using found HTML file: ${htmlFiles[0]}`);
  }

  const actualHtmlPath = existsSync(htmlPath)
    ? htmlPath
    : join(inputDir, readdirSync(inputDir).find((f) => f.endsWith(".html"))!);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing: ${basename(inputDir)}`);
  console.log(`HTML: ${actualHtmlPath}`);
  console.log(`Output: ${outputDir}`);
  console.log(`${"=".repeat(60)}\n`);

  // Copy CSS files to output for reference
  const cssFiles = readdirSync(inputDir).filter((f) => f.endsWith(".css"));
  for (const css of cssFiles) {
    try {
      copyFileSync(join(inputDir, css), join(outputDir, css));
    } catch (e) {
      // Ignore copy errors
    }
  }

  // Step 1: Build with PagedJS
  if (!options.skipPagedJS) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`Building with PagedJS CLI`);
    console.log(`${"─".repeat(40)}`);

    try {
      const pjResult = await buildWithPagedJS({
        input: actualHtmlPath,
        output: join(outputDir, "pagedjs-output.pdf"),
        timeout: 120000,
      });
      result.pagedjs.build = pjResult.success;
      if (!pjResult.success && pjResult.error) {
        result.errors.push(`PagedJS build: ${pjResult.error}`);
      }
    } catch (e) {
      result.errors.push(`PagedJS build exception: ${e}`);
    }
  }

  // Step 2: Build with Vivliostyle
  if (!options.skipVivliostyle) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`Building with Vivliostyle CLI`);
    console.log(`${"─".repeat(40)}`);

    try {
      const vsResult = await buildWithVivliostyle({
        input: actualHtmlPath,
        output: join(outputDir, "vivliostyle-output.pdf"),
        timeout: 120000,
      });
      result.vivliostyle.build = vsResult.success;
      if (!vsResult.success && vsResult.error) {
        result.errors.push(`Vivliostyle build: ${vsResult.error}`);
      }
    } catch (e) {
      result.errors.push(`Vivliostyle build exception: ${e}`);
    }
  }

  // Step 3: Convert to PDF/X
  if (!options.skipConvert) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`Converting to PDF/X`);
    console.log(`${"─".repeat(40)}`);

    // Convert PagedJS output
    const pjPdf = join(outputDir, "pagedjs-output.pdf");
    if (existsSync(pjPdf)) {
      try {
        const pjConvert = await convertToPdfx({
          input: pjPdf,
          output: join(outputDir, "pagedjs-pdfx.pdf"),
          title: `PagedJS - ${basename(inputDir)}`,
        });
        result.pagedjs.convert = pjConvert.success;
        if (!pjConvert.success && pjConvert.error) {
          result.errors.push(`PagedJS convert: ${pjConvert.error}`);
        }
      } catch (e) {
        result.errors.push(`PagedJS convert exception: ${e}`);
      }
    }

    // Convert Vivliostyle output
    const vsPdf = join(outputDir, "vivliostyle-output.pdf");
    if (existsSync(vsPdf)) {
      try {
        const vsConvert = await convertToPdfx({
          input: vsPdf,
          output: join(outputDir, "vivliostyle-pdfx.pdf"),
          title: `Vivliostyle - ${basename(inputDir)}`,
        });
        result.vivliostyle.convert = vsConvert.success;
        if (!vsConvert.success && vsConvert.error) {
          result.errors.push(`Vivliostyle convert: ${vsConvert.error}`);
        }
      } catch (e) {
        result.errors.push(`Vivliostyle convert exception: ${e}`);
      }
    }
  }

  // Step 4: Validate and Compare
  if (!options.skipCompare) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`Validating and Comparing`);
    console.log(`${"─".repeat(40)}`);

    // We need to temporarily set up the environment for the comparison script
    // by symlinking or copying output to the expected location
    const appOutputDir = join(APP_ROOT, "output");
    const appReportsDir = join(APP_ROOT, "reports");

    // Clean and link directories
    await $`rm -rf ${appOutputDir} ${appReportsDir}`.quiet().nothrow();
    await $`mkdir -p ${appReportsDir}`.quiet();

    // Symlink output directory
    try {
      await $`ln -sf ${outputDir} ${appOutputDir}`.quiet();
    } catch {
      // Fall back to copying if symlink fails
      await $`cp -r ${outputDir} ${appOutputDir}`.quiet().nothrow();
    }

    try {
      // Run comparison from app root
      process.chdir(APP_ROOT);
      await runComparison();

      // Copy report to output directory
      const reportSrc = join(appReportsDir, "comparison-report.md");
      if (existsSync(reportSrc)) {
        copyFileSync(reportSrc, join(outputDir, "comparison-report.md"));
      }
    } catch (e) {
      result.errors.push(`Comparison: ${e}`);
    }

    // Cleanup symlink
    await $`rm -f ${appOutputDir}`.quiet().nothrow();
  }

  // Determine overall success
  result.success =
    result.errors.length === 0 &&
    (result.pagedjs.build || options.skipPagedJS) &&
    (result.vivliostyle.build || options.skipVivliostyle);

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Summary for: ${basename(inputDir)}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`PagedJS Build:    ${result.pagedjs.build ? "✅" : "❌"}`);
  console.log(`PagedJS PDF/X:    ${result.pagedjs.convert ? "✅" : "❌"}`);
  console.log(`Vivliostyle Build: ${result.vivliostyle.build ? "✅" : "❌"}`);
  console.log(`Vivliostyle PDF/X: ${result.vivliostyle.convert ? "✅" : "❌"}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  }

  // List generated files
  console.log(`\nGenerated files:`);
  const files = readdirSync(outputDir).filter(
    (f) => f.endsWith(".pdf") || f.endsWith(".md")
  );
  for (const file of files) {
    const stats = await Bun.file(join(outputDir, file)).stat();
    const size = ((stats?.size ?? 0) / 1024).toFixed(1);
    console.log(`  ✅ ${file} (${size} KB)`);
  }

  return result;
}

// Main
if (import.meta.main) {
  const options = parseArgs();

  console.log("Batch Process Options:", options);

  const result = await processBatch(options);

  process.exit(result.success ? 0 : 1);
}

export { processBatch, type BatchOptions };
