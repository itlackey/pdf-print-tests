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
import { buildWithWeasyPrint } from "./build-weasyprint.ts";
import { convertToPdfx } from "./convert-pdfx.ts";
import { runComparisonInDir } from "./compare-pdfs.ts";
import { validatePdf } from "./validate-pdfs.ts";
import { validateTAC, type TACValidationResult } from "./validate-tac.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "..");

// DriveThruRPG target page dimensions
// Trim size: 6" x 9" + 0.125" bleed on each side = 6.25" x 9.25"
const TARGET_PAGE = {
  trimWidthIn: 6,
  trimHeightIn: 9,
  bleedIn: 0.125,
  // Final page size with bleed
  get widthIn() { return this.trimWidthIn + this.bleedIn * 2; },
  get heightIn() { return this.trimHeightIn + this.bleedIn * 2; },
  // Convert to mm for PagedJS (1 inch = 25.4 mm)
  get widthMM() { return this.widthIn * 25.4; },
  get heightMM() { return this.heightIn * 25.4; },
  // Vivliostyle format: "6.25in,9.25in"
  get vivliostyleSize() { return `${this.widthIn}in,${this.heightIn}in`; },
  get bleedMM() { return `${(this.bleedIn * 25.4).toFixed(2)}mm`; },
};

interface BatchOptions {
  inputDir: string;
  outputDir: string;
  htmlFile: string;
  skipPagedJS: boolean;
  skipVivliostyle: boolean;
  skipWeasyPrint: boolean;
  skipConvert: boolean;
  skipCompare: boolean;
  strictCompliance?: boolean; // Fail if PDFs are not compliant
}

function parseArgs(): BatchOptions {
  const args = process.argv.slice(2);
  const options: BatchOptions = {
    inputDir:
      process.env.INPUT_DIR && process.env.INPUT_DIR.trim().length > 0
        ? process.env.INPUT_DIR
        : join(process.cwd(), "input"),
    outputDir:
      process.env.OUTPUT_DIR && process.env.OUTPUT_DIR.trim().length > 0
        ? process.env.OUTPUT_DIR
        : join(process.cwd(), "output", "default-test"),
    htmlFile: "book.html",
    skipPagedJS: false,
    skipVivliostyle: false,
    skipWeasyPrint: false,
    skipConvert: false,
    skipCompare: false,
    strictCompliance: false,
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
      case "--skip-weasyprint":
        options.skipWeasyPrint = true;
        break;
      case "--skip-convert":
        options.skipConvert = true;
        break;
      case "--skip-compare":
        options.skipCompare = true;
        break;
      case "--strict":
        options.strictCompliance = true;
        break;
    }
  }

  return options;
}

async function processBatch(options: BatchOptions): Promise<{
  success: boolean;
  pagedjs: { build: boolean; convert: boolean; compliant: boolean; tacValidation?: TACValidationResult };
  vivliostyle: { build: boolean; convert: boolean; compliant: boolean; tacValidation?: TACValidationResult };
  weasyprint: { build: boolean; convert: boolean; compliant: boolean; tacValidation?: TACValidationResult };
  errors: string[];
}> {
  const result = {
    success: true,
    pagedjs: { build: false, convert: false, compliant: false, tacValidation: undefined as TACValidationResult | undefined },
    vivliostyle: { build: false, convert: false, compliant: false, tacValidation: undefined as TACValidationResult | undefined },
    weasyprint: { build: false, convert: false, compliant: false, tacValidation: undefined as TACValidationResult | undefined },
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
        // Let CSS @page size rule control page dimensions
        // PagedJS's -w/-h options don't work as expected with CSS-defined sizes
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
        // Pass explicit page size for consistent output
        size: TARGET_PAGE.vivliostyleSize,
        // Note: We don't use press-ready here as we do our own PDF/X conversion
        // with Ghostscript for better control over the process
      });
      result.vivliostyle.build = vsResult.success;
      if (!vsResult.success && vsResult.error) {
        result.errors.push(`Vivliostyle build: ${vsResult.error}`);
      }
    } catch (e) {
      result.errors.push(`Vivliostyle build exception: ${e}`);
    }
  }

  // Step 2.5: Build with WeasyPrint
  if (!options.skipWeasyPrint) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`Building with WeasyPrint`);
    console.log(`${"─".repeat(40)}`);

    try {
      const wpResult = await buildWithWeasyPrint({
        input: actualHtmlPath,
        output: join(outputDir, "weasyprint-output.pdf"),
        timeout: 120000,
        mediaType: "print",
      });
      result.weasyprint.build = wpResult.success;
      if (!wpResult.success && wpResult.error) {
        result.errors.push(`WeasyPrint build: ${wpResult.error}`);
      }
    } catch (e) {
      result.errors.push(`WeasyPrint build exception: ${e}`);
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

    // Convert WeasyPrint output
    const wpPdf = join(outputDir, "weasyprint-output.pdf");
    if (existsSync(wpPdf)) {
      try {
        const wpConvert = await convertToPdfx({
          input: wpPdf,
          output: join(outputDir, "weasyprint-pdfx.pdf"),
          title: `WeasyPrint - ${basename(inputDir)}`,
        });
        result.weasyprint.convert = wpConvert.success;
        if (!wpConvert.success && wpConvert.error) {
          result.errors.push(`WeasyPrint convert: ${wpConvert.error}`);
        }
      } catch (e) {
        result.errors.push(`WeasyPrint convert exception: ${e}`);
      }
    }

    // Step 3.5: Validate TAC (Total Area Coverage)
    console.log(`\n${"─".repeat(40)}`);
    console.log(`Validating TAC (Total Area Coverage)`);
    console.log(`${"─".repeat(40)}`);

    // Validate PagedJS PDF/X output
    const pjPdfx = join(outputDir, "pagedjs-pdfx.pdf");
    if (existsSync(pjPdfx)) {
      try {
        console.log(`\n🔍 Checking PagedJS PDF/X...`);
        const tacResult = await validateTAC(pjPdfx);
        result.pagedjs.tacValidation = tacResult;

        // Log summary
        console.log(`   ${tacResult.summary}`);

        // Warn if TAC exceeds limit
        if (tacResult.pagesOverLimit.length > 0) {
          console.log(`   ❌ TAC validation failed: ${tacResult.maxTAC.toFixed(1)}% exceeds 240%`);
          console.log(`   📄 Pages over limit: ${tacResult.pagesOverLimit.join(", ")}`);
          for (const rec of tacResult.recommendations.slice(0, 3)) {
            console.log(`   💡 ${rec}`);
          }
          // Don't fail the build, just warn
          result.errors.push(`PagedJS TAC: ${tacResult.pagesOverLimit.length} page(s) exceed 240% limit`);
        } else if (tacResult.pagesWithWarnings.length > 0) {
          console.log(`   ⚠️  ${tacResult.pagesWithWarnings.length} page(s) in warning zone (200-240% TAC)`);
        }
      } catch (e) {
        console.log(`   ⚠️  TAC validation skipped: ${e}`);
      }
    }

    // Validate Vivliostyle PDF/X output
    const vsPdfx = join(outputDir, "vivliostyle-pdfx.pdf");
    if (existsSync(vsPdfx)) {
      try {
        console.log(`\n🔍 Checking Vivliostyle PDF/X...`);
        const tacResult = await validateTAC(vsPdfx);
        result.vivliostyle.tacValidation = tacResult;

        // Log summary
        console.log(`   ${tacResult.summary}`);

        // Warn if TAC exceeds limit
        if (tacResult.pagesOverLimit.length > 0) {
          console.log(`   ❌ TAC validation failed: ${tacResult.maxTAC.toFixed(1)}% exceeds 240%`);
          console.log(`   📄 Pages over limit: ${tacResult.pagesOverLimit.join(", ")}`);
          for (const rec of tacResult.recommendations.slice(0, 3)) {
            console.log(`   💡 ${rec}`);
          }
          // Don't fail the build, just warn
          result.errors.push(`Vivliostyle TAC: ${tacResult.pagesOverLimit.length} page(s) exceed 240% limit`);
        } else if (tacResult.pagesWithWarnings.length > 0) {
          console.log(`   ⚠️  ${tacResult.pagesWithWarnings.length} page(s) in warning zone (200-240% TAC)`);
        }
      } catch (e) {
        console.log(`   ⚠️  TAC validation skipped: ${e}`);
      }
    }

    // Validate WeasyPrint PDF/X output
    const wpPdfx = join(outputDir, "weasyprint-pdfx.pdf");
    if (existsSync(wpPdfx)) {
      try {
        console.log(`\n🔍 Checking WeasyPrint PDF/X...`);
        const tacResult = await validateTAC(wpPdfx);
        result.weasyprint.tacValidation = tacResult;

        // Log summary
        console.log(`   ${tacResult.summary}`);

        // Warn if TAC exceeds limit
        if (tacResult.pagesOverLimit.length > 0) {
          console.log(`   ❌ TAC validation failed: ${tacResult.maxTAC.toFixed(1)}% exceeds 240%`);
          console.log(`   📄 Pages over limit: ${tacResult.pagesOverLimit.join(", ")}`);
          for (const rec of tacResult.recommendations.slice(0, 3)) {
            console.log(`   💡 ${rec}`);
          }
          // Don't fail the build, just warn
          result.errors.push(`WeasyPrint TAC: ${tacResult.pagesOverLimit.length} page(s) exceed 240% limit`);
        } else if (tacResult.pagesWithWarnings.length > 0) {
          console.log(`   ⚠️  ${tacResult.pagesWithWarnings.length} page(s) in warning zone (200-240% TAC)`);
        }
      } catch (e) {
        console.log(`   ⚠️  TAC validation skipped: ${e}`);
      }
    }
  }

  // Step 4: Validate and Compare
  if (!options.skipCompare) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`Validating and Comparing`);
    console.log(`${"─".repeat(40)}`);

    try {
      const comparisonResult = await runComparisonInDir(outputDir);

      // Track compliance status
      result.pagedjs.compliant = comparisonResult.summary.pagedJsCompliant;
      result.vivliostyle.compliant = comparisonResult.summary.vivliostyleCompliant;

      // In strict mode, fail if neither PDF is compliant
      if (options.strictCompliance) {
        const anyCompliant = result.pagedjs.compliant || result.vivliostyle.compliant;
        if (!anyCompliant) {
          result.errors.push("Strict mode: No compliant PDF/X output produced");
        }
      }
    } catch (e) {
      result.errors.push(`Comparison: ${e}`);
    }
  }

  // Determine overall success
  result.success =
    result.errors.length === 0 &&
    (result.pagedjs.build || options.skipPagedJS) &&
    (result.vivliostyle.build || options.skipVivliostyle) &&
    (result.weasyprint.build || options.skipWeasyPrint);

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Summary for: ${basename(inputDir)}`);
  console.log(`${"=".repeat(60)}`);
  const pjBuildStatus = options.skipPagedJS ? "⏭️" : result.pagedjs.build ? "✅" : "❌";
  const pjConvertStatus =
    options.skipPagedJS || options.skipConvert ? "⏭️" : result.pagedjs.convert ? "✅" : "❌";
  const vsBuildStatus = options.skipVivliostyle ? "⏭️" : result.vivliostyle.build ? "✅" : "❌";
  const vsConvertStatus =
    options.skipVivliostyle || options.skipConvert ? "⏭️" : result.vivliostyle.convert ? "✅" : "❌";

  const pjCompliantStatus =
    options.skipCompare ? "⏭️" : result.pagedjs.compliant ? "✅" : "❌";
  const vsCompliantStatus =
    options.skipCompare ? "⏭️" : result.vivliostyle.compliant ? "✅" : "❌";

  const wpBuildStatus = options.skipWeasyPrint ? "⏭️" : result.weasyprint.build ? "✅" : "❌";
  const wpConvertStatus =
    options.skipWeasyPrint || options.skipConvert ? "⏭️" : result.weasyprint.convert ? "✅" : "❌";
  const wpCompliantStatus =
    options.skipCompare ? "⏭️" : result.weasyprint.compliant ? "✅" : "❌";

  console.log(`PagedJS Build:      ${pjBuildStatus}`);
  console.log(`PagedJS PDF/X:      ${pjConvertStatus}`);
  console.log(`PagedJS Compliant:  ${pjCompliantStatus}`);
  console.log(`Vivliostyle Build:  ${vsBuildStatus}`);
  console.log(`Vivliostyle PDF/X:  ${vsConvertStatus}`);
  console.log(`Vivliostyle Compliant: ${vsCompliantStatus}`);
  console.log(`WeasyPrint Build:   ${wpBuildStatus}`);
  console.log(`WeasyPrint PDF/X:   ${wpConvertStatus}`);
  console.log(`WeasyPrint Compliant: ${wpCompliantStatus}`);

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
