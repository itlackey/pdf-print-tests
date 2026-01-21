#!/usr/bin/env bun
/**
 * Build PDF using WeasyPrint (v68+)
 * Python-based PDF renderer with CSS Paged Media support
 * Non-Chromium alternative with native CMYK and PDF/X support
 *
 * WeasyPrint 68 Features:
 * - Direct PDF/X output (pdf/x-1a, pdf/x-3, pdf/x-4, pdf/x-5g)
 * - sRGB color profile embedding
 * - Image optimization
 * - CSS Color Level 4/5 support (device-cmyk, color())
 */

import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/**
 * Concatenate CSS files for WeasyPrint build
 * Order: variables -> base -> common -> engine-specific -> theme
 * @param outputPath - Path to write concatenated CSS
 * @param theme - Theme name (e.g., "kitchen-sink", "dark-theme") or "none" to skip base styles
 */
function concatenateCSS(outputPath: string, theme: string = "kitchen-sink"): string {
  const stylesDir = join(ROOT, "styles");

  // If theme is "none", only include engine-specific overrides
  if (theme === "none") {
    const cssFiles = [
      join(stylesDir, "engines/weasyprint/overrides.css"),
      join(stylesDir, "engines/weasyprint/features.css"),
      join(stylesDir, "engines/weasyprint/color-profile.css"),
    ];
    const concatenated = cssFiles
      .filter((file) => existsSync(file))
      .map((file) => {
        const content = readFileSync(file, "utf-8");
        return `/* Source: ${file.replace(ROOT, "")} */\n${content}\n`;
      })
      .join("\n");
    writeFileSync(outputPath, concatenated, "utf-8");
    console.log(`   📦 Using HTML-linked CSS + ${cssFiles.filter(f => existsSync(f)).length} engine overrides`);

    // Copy ICC profile to output directory for @color-profile resolution
    const iccSource = join(ROOT, "assets", "CGATS21_CRPC1.icc");
    const iccDest = join(dirname(outputPath), "CGATS21_CRPC1.icc");
    if (existsSync(iccSource) && !existsSync(iccDest)) {
      copyFileSync(iccSource, iccDest);
      console.log(`   🎨 Copied ICC profile to output directory`);
    }

    return outputPath;
  }

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
    // CMYK color profile for PDF/X output (must come before theme for device-cmyk support)
    join(stylesDir, "engines/weasyprint/color-profile.css"),
    // Theme
    join(stylesDir, `themes/${theme}.css`),
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

  // Copy ICC profile to output directory for @color-profile resolution
  const iccSource = join(ROOT, "assets", "CGATS21_CRPC1.icc");
  const iccDest = join(dirname(outputPath), "CGATS21_CRPC1.icc");
  if (existsSync(iccSource) && !existsSync(iccDest)) {
    copyFileSync(iccSource, iccDest);
    console.log(`   🎨 Copied ICC profile to output directory`);
  }

  return outputPath;
}

/** PDF variant types supported by WeasyPrint 68+ */
type PdfVariant =
  | "pdf/a-1b" | "pdf/a-2b" | "pdf/a-3b" | "pdf/a-2u" | "pdf/a-3u" | "pdf/a-4u"
  | "pdf/a-1a" | "pdf/a-2a" | "pdf/a-3a" | "pdf/a-4e" | "pdf/a-4f"
  | "pdf/ua-1" | "pdf/ua-2"
  | "pdf/x-1a" | "pdf/x-3" | "pdf/x-4" | "pdf/x-5g"
  | "debug";

interface BuildOptions {
  input: string;
  output: string;
  timeout?: number;
  /** Media type (print, screen) */
  mediaType?: "print" | "screen";
  /** Base URL for resolving relative URLs */
  baseUrl?: string;
  /** PDF variant (e.g., "pdf/x-1a", "pdf/x-4", "pdf/a-3b") */
  pdfVariant?: PdfVariant | string;
  /** Attach files to PDF */
  attachments?: string[];
  /** Theme name (e.g., "kitchen-sink", "dark-theme") or "none" to use HTML-linked CSS */
  theme?: string;
  /** Optimize embedded images (lossless) */
  optimizeImages?: boolean;
  /** JPEG quality for image compression (0-95) */
  jpegQuality?: number;
  /** Maximum DPI for embedded images */
  dpi?: number;
  /** Include PDF tags for accessibility */
  pdfTags?: boolean;
  /** Include PDF forms */
  pdfForms?: boolean;
  /** Path to custom CSS stylesheet with @color-profile rules */
  colorStylesheet?: string;
  /** Embed full unmodified font files (recommended for print) */
  fullFonts?: boolean;
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
    theme = "kitchen-sink",
    optimizeImages = false,
    jpegQuality,
    dpi,
    pdfTags = false,
    pdfForms = false,
    colorStylesheet,
    fullFonts = false,
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
    concatenateCSS(tempCSSPath, theme);

    // Build weasyprint command
    // Use virtual environment's WeasyPrint if available, otherwise fallback to system
    const venvWeasyPrint = join(ROOT, ".venv", "bin", "weasyprint");
    const weasyPrintCmd = existsSync(venvWeasyPrint) ? venvWeasyPrint : "weasyprint";

    const args = [
      weasyPrintCmd,
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

    // Add image optimization options
    if (optimizeImages) {
      args.push("--optimize-images");
    }

    if (jpegQuality !== undefined) {
      args.push("--jpeg-quality", String(jpegQuality));
    }

    if (dpi !== undefined) {
      args.push("--dpi", String(dpi));
    }

    // Add PDF feature options
    if (pdfTags) {
      args.push("--pdf-tags");
    }

    if (pdfForms) {
      args.push("--pdf-forms");
    }

    // Embed full font files (recommended for print)
    if (fullFonts) {
      args.push("--full-fonts");
    }

    // Add custom color profile stylesheet
    if (colorStylesheet && existsSync(colorStylesheet)) {
      args.push("--stylesheet", colorStylesheet);
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
  let optimizeImages = false;
  let jpegQuality: number | undefined;
  let dpi: number | undefined;
  let pdfTags = false;
  let colorStylesheet: string | undefined;
  let fullFonts = false;

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
      case "--optimize-images":
        optimizeImages = true;
        break;
      case "--jpeg-quality":
        jpegQuality = parseInt(args[++i], 10);
        break;
      case "--dpi":
        dpi = parseInt(args[++i], 10);
        break;
      case "--pdf-tags":
        pdfTags = true;
        break;
      case "--color-stylesheet":
        colorStylesheet = args[++i];
        break;
      case "--full-fonts":
        fullFonts = true;
        break;
      case "--help":
      case "-h":
        console.log(`
WeasyPrint Build Script (v68+)

Usage:
  bun run scripts/build-weasyprint.ts [options]

Options:
  --input, -i <file>        Input HTML file (default: input/book.html)
  --output, -o <file>       Output PDF file (default: output/default-test/weasyprint-output.pdf)
  --media-type <type>       Media type: print, screen (default: print)
  --pdf-variant <variant>   PDF variant for direct output:
                            PDF/X: pdf/x-1a, pdf/x-3, pdf/x-4, pdf/x-5g
                            PDF/A: pdf/a-1b, pdf/a-2b, pdf/a-3b, pdf/a-4e, etc.
                            PDF/UA: pdf/ua-1, pdf/ua-2
  --optimize-images         Optimize embedded images (lossless)
  --jpeg-quality <0-95>     JPEG quality for image compression
  --dpi <number>            Maximum DPI for embedded images
  --pdf-tags                Include PDF tags for accessibility
  --full-fonts              Embed full unmodified font files (recommended for print)
  --color-stylesheet <file> Path to CSS with @color-profile rules
  --help, -h                Show this help message

Environment:
  INPUT_FILE                Input HTML file path
  OUTPUT_FILE               Output PDF file path

CMYK & Color Profile:
  WeasyPrint uses CSS @color-profile and device-cmyk() for CMYK output.
  The color profile (CGATS21_CRPC1.icc) is included automatically when
  using the concatenated CSS. See styles/engines/weasyprint/color-profile.css

Examples:
  # Basic build
  bun run scripts/build-weasyprint.ts

  # Direct PDF/X-1a output for print (recommended for DriveThruRPG)
  bun run scripts/build-weasyprint.ts --pdf-variant pdf/x-1a --full-fonts --dpi 300

  # PDF/X-3 with image optimization
  bun run scripts/build-weasyprint.ts --pdf-variant pdf/x-3 --optimize-images --dpi 300 --full-fonts

  # PDF/A-3b for archival
  bun run scripts/build-weasyprint.ts --pdf-variant pdf/a-3b --pdf-tags --full-fonts
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
    optimizeImages,
    jpegQuality,
    dpi,
    pdfTags,
    colorStylesheet,
    fullFonts,
  });

  if (!result.success) {
    console.error(`\n❌ WeasyPrint build failed: ${result.error}`);
    process.exit(1);
  }

  console.log("\n✅ WeasyPrint build complete!");
}
