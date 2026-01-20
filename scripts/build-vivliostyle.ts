#!/usr/bin/env bun
/**
 * Build PDF using Vivliostyle CLI
 * Renders HTML/CSS to PDF using Chromium with native CSS Paged Media support
 */

import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/**
 * Concatenate CSS files for Vivliostyle build
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
    // Vivliostyle engine-specific
    join(stylesDir, "engines/vivliostyle/overrides.css"),
    join(stylesDir, "engines/vivliostyle/features.css"),
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
  console.log(`   📦 Concatenated ${cssFiles.length} CSS files -> ${outputPath}`);
  return outputPath;
}

interface BuildOptions {
  input: string;
  output: string;
  timeout?: number;
  /** Page size like "A4", "letter", or custom "6.25in,9.25in" */
  size?: string;
  theme?: string;
  /** Enable press-ready PDF/X-1a mode */
  press?: boolean;
  /** Print crop marks */
  cropMarks?: boolean;
  /** Bleed area size (e.g., "3mm", "0.125in") */
  bleed?: string;
}

export async function buildWithVivliostyle(options: BuildOptions): Promise<{
  success: boolean;
  outputPath: string;
  duration: number;
  error?: string;
}> {
  const startTime = performance.now();
  const { input, output, timeout = 120000, size, theme, press = false, cropMarks = false, bleed } = options;

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

  console.log(`\n📄 Building PDF with Vivliostyle CLI...`);
  console.log(`   Input:  ${input}`);
  console.log(`   Output: ${output}`);

  try {
    // Concatenate CSS files for Vivliostyle
    const tempCSSPath = join(outputDir, "vivliostyle-styles.css");
    const concatenatedCSS = concatenateCSS(tempCSSPath);

    // Build vivliostyle command
    const args = [
      "npx",
      "@vivliostyle/cli",
      "build",
      input,
      "-o",
      output,
      "--timeout",
      String(timeout),
      "--log-level",
      "info",
    ];

    // Add size if specified (otherwise use CSS @page size)
    if (size) {
      args.push("--size", size);
    }

    // Add concatenated theme/stylesheet
    args.push("--theme", concatenatedCSS);

    // Add additional theme/stylesheet if specified
    if (theme) {
      args.push("--theme", theme);
    }

    // Press-ready mode for print
    if (press) {
      args.push("--press-ready");
    }

    // Crop marks for print
    if (cropMarks) {
      args.push("--crop-marks");
    }

    // Bleed area
    if (bleed) {
      args.push("--bleed", bleed);
    }

    // Note: Vivliostyle CLI does not support --browser-arg flag
    // The sandbox flags are handled internally by playwright

    // Run Vivliostyle CLI
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

// Run if called directly
if (import.meta.main) {
  const inputDir = process.env.INPUT_DIR && process.env.INPUT_DIR.trim().length > 0
    ? process.env.INPUT_DIR
    : join(ROOT, "input");

  let input = join(inputDir, "book.html");
  if (!existsSync(input)) {
    const htmlFiles = existsSync(inputDir)
      ? readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith(".html"))
      : [];
    if (htmlFiles.length > 0) {
      input = join(inputDir, htmlFiles[0]);
    }
  }

  const outputBaseDir =
    process.env.OUTPUT_DIR && process.env.OUTPUT_DIR.trim().length > 0
      ? process.env.OUTPUT_DIR
      : join(ROOT, "output");
  const projectName = process.env.INPUT_DIR && process.env.INPUT_DIR.trim().length > 0
    ? "project"
    : "default-test";

  const output = join(outputBaseDir, projectName, "vivliostyle-output.pdf");

  const result = await buildWithVivliostyle({ input, output });

  if (!result.success) {
    console.error("\n❌ Vivliostyle build failed:", result.error);
    process.exit(1);
  }

  console.log("\n✅ Vivliostyle build complete!");
}
