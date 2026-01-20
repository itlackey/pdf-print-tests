#!/usr/bin/env bun
/**
 * Build PDF using WeasyPrint
 * Python-based PDF renderer with CSS Paged Media support
 * Non-Chromium alternative that may handle device-cmyk() properly
 */

import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/**
 * Concatenate CSS files for WeasyPrint build
 * Order: variables -> base -> common -> engine-specific -> theme
 */
function concatenateCSS(outputPath: string): string {
  const stylesDir = join(ROOT, "styles");
  const cssFiles = [
    // Variables first (CSS custom properties)
    join(stylesDir, "common/variables.css"),
    // Base styles
    join(stylesDir, "base/reset.css"),
    join(stylesDir, "base/typography.css"),
    join(stylesDir, "base/print-base.css"),
    // Common styles
    join(stylesDir, "common/layout.css"),
    join(stylesDir, "common/components.css"),
    // WeasyPrint engine-specific (if they exist)
    join(stylesDir, "engines/weasyprint/overrides.css"),
    join(stylesDir, "engines/weasyprint/features.css"),
    // Theme
    join(stylesDir, "themes/kitchen-sink.css"),
  ];

  const concatenated = cssFiles
    .filter((file) => existsSync(file))
    .map((file) => {
      const content = readFileSync(file, "utf-8");
      return `/* Source: ${file.replace(ROOT, "")} */\n${content}\n`;
    })
    .join("\n");

  writeFileSync(outputPath, concatenated, "utf-8");
  console.log(`   📦 Concatenated ${cssFiles.filter(f => existsSync(f)).length} CSS files -> ${outputPath}`);
  return outputPath;
}

interface BuildOptions {
  input: string;
  output: string;
  timeout?: number;
  /** Media type (print, screen) */
  mediaType?: "print" | "screen";
  /** Base URL for resolving relative URLs */
  baseUrl?: string;
  /** Enable PDF/X-1a output */
  pdfVariant?: string;
  /** Attach files to PDF */
  attachments?: string[];
}

export async function buildWithWeasyPrint(options: BuildOptions): Promise<{
  success: boolean;
  outputPath: string;
  duration: number;
  error?: string;
}> {
  const startTime = performance.now();
  const {
    input,
    output,
    timeout = 120000,
    mediaType = "print",
    baseUrl,
    pdfVariant,
    attachments = [],
  } = options;

  // Ensure output directory exists
  const outputDir = dirname(output);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Check input exists
  if (!existsSync(input)) {
    return {
      success: false,
      outputPath: output,
      duration: performance.now() - startTime,
      error: `Input file not found: ${input}`,
    };
  }

  console.log(`\n📄 Building PDF with WeasyPrint...`);
  console.log(`   Input:  ${input}`);
  console.log(`   Output: ${output}`);

  try {
    // Concatenate CSS files for WeasyPrint
    const tempCSSPath = join(outputDir, "weasyprint-styles.css");
    concatenateCSS(tempCSSPath);

    // Build weasyprint command
    const args = [
      "weasyprint",
      "--media-type", mediaType,
    ];

    // Add base URL if provided
    if (baseUrl) {
      args.push("--base-url", baseUrl);
    } else {
      // Use input file directory as base URL
      args.push("--base-url", dirname(input));
    }

    // Add PDF variant if specified (e.g., "pdf/a-3b", "pdf/ua-1", "pdf/x-4")
    if (pdfVariant) {
      args.push("--pdf-variant", pdfVariant);
    }

    // Add attachments
    for (const attachment of attachments) {
      args.push("--attachment", attachment);
    }

    // Add input and output
    args.push(input, output);

    // Run WeasyPrint
    console.log(`   🔧 Running: ${args.join(" ")}`);
    const result = await $`${args}`.quiet();

    const duration = performance.now() - startTime;

    if (existsSync(output)) {
      const stats = await Bun.file(output).stat();
      console.log(`   ✅ Success! Generated ${((stats?.size ?? 0) / 1024).toFixed(2)} KB`);
      console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
      return {
        success: true,
        outputPath: output,
        duration,
      };
    } else {
      return {
        success: false,
        outputPath: output,
        duration,
        error: "Output file was not created",
      };
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Error: ${errorMessage}`);
    return {
      success: false,
      outputPath: output,
      duration,
      error: errorMessage,
    };
  }
}

/**
 * CLI entry point
 */
if (import.meta.main) {
  const args = process.argv.slice(2);

  // Parse arguments
  let input = process.env.INPUT_FILE || join(ROOT, "input", "book.html");
  let output = process.env.OUTPUT_FILE || join(ROOT, "output", "default-test", "weasyprint-output.pdf");
  let mediaType: "print" | "screen" = "print";
  let pdfVariant: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--input":
      case "-i":
        input = args[++i];
        break;
      case "--output":
      case "-o":
        output = args[++i];
        break;
      case "--media-type":
        mediaType = args[++i] as "print" | "screen";
        break;
      case "--pdf-variant":
        pdfVariant = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
WeasyPrint Build Script

Usage:
  bun run scripts/build-weasyprint.ts [options]

Options:
  --input, -i <file>        Input HTML file (default: input/book.html)
  --output, -o <file>       Output PDF file (default: output/default-test/weasyprint-output.pdf)
  --media-type <type>       Media type: print, screen (default: print)
  --pdf-variant <variant>   PDF variant: pdf/a-3b, pdf/ua-1, pdf/x-4
  --help, -h                Show this help message

Environment:
  INPUT_FILE                Input HTML file path
  OUTPUT_FILE               Output PDF file path

Examples:
  bun run scripts/build-weasyprint.ts
  bun run scripts/build-weasyprint.ts --input examples/kitchen-sink.html --output output/test.pdf
  bun run scripts/build-weasyprint.ts --pdf-variant pdf/a-3b
        `);
        process.exit(0);
    }
  }

  // Run build
  const result = await buildWithWeasyPrint({
    input,
    output,
    mediaType,
    pdfVariant,
  });

  if (!result.success) {
    console.error(`\n❌ WeasyPrint build failed: ${result.error}`);
    process.exit(1);
  }

  console.log("\n✅ WeasyPrint build complete!");
}
