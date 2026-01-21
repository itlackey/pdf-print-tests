#!/usr/bin/env bun
/**
 * Build PDF using PagedJS CLI
 * Renders HTML/CSS to PDF using Chromium via PagedJS polyfill
 */

import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/**
 * Concatenate CSS files for PagedJS build
 * Order: variables -> base -> common -> engine-specific -> theme
 * @param outputPath - Path to write concatenated CSS
 * @param theme - Theme name (e.g., "kitchen-sink", "dark-theme") or "none" to skip base styles
 */
function concatenateCSS(outputPath: string, theme: string = "kitchen-sink"): string {
  const stylesDir = join(ROOT, "styles");

  // If theme is "none", only include engine-specific overrides
  if (theme === "none") {
    const cssFiles = [
      join(stylesDir, "engines/pagedjs/overrides.css"),
      join(stylesDir, "engines/pagedjs/features.css"),
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
    // PagedJS engine-specific
    join(stylesDir, "engines/pagedjs/overrides.css"),
    join(stylesDir, "engines/pagedjs/features.css"),
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
  console.log(`   📦 Concatenated ${cssFiles.length} CSS files -> ${outputPath}`);
  return outputPath;
}

interface BuildOptions {
  input: string;
  output: string;
  timeout?: number;
  additionalStyles?: string;
  /** Page width in mm (takes precedence over pageSize) */
  widthMM?: number;
  /** Page height in mm (takes precedence over pageSize) */
  heightMM?: number;
  /** Page size preset like "A4", "letter", or custom "6.25in x 9.25in" */
  pageSize?: string;
  /** Theme name (e.g., "kitchen-sink", "dark-theme") or "none" to use HTML-linked CSS */
  theme?: string;
}

export async function buildWithPagedJS(options: BuildOptions): Promise<{
  success: boolean;
  outputPath: string;
  duration: number;
  error?: string;
}> {
  const startTime = performance.now();
  const { input, output, timeout = 60000, additionalStyles, widthMM, heightMM, pageSize, theme = "kitchen-sink" } = options;

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

  console.log(`\n📄 Building PDF with PagedJS CLI...`);
  console.log(`   Input:  ${input}`);
  console.log(`   Output: ${output}`);

  try {
    // Concatenate CSS files for PagedJS
    const tempCSSPath = join(outputDir, "pagedjs-styles.css");
    const concatenatedCSS = concatenateCSS(tempCSSPath, theme);

    // Build pagedjs-cli command
    const args = [
      "npx",
      "pagedjs-cli",
      input,
      "-o",
      output,
      "--timeout",
      String(timeout),
      "--browserArgs",
      "--no-sandbox,--disable-setuid-sandbox",
      "--style",
      concatenatedCSS,
    ];

    if (additionalStyles) {
      args.push("--style", additionalStyles);
    }

    // Add page size options - width/height in mm takes precedence
    if (widthMM && heightMM) {
      args.push("-w", String(widthMM), "-h", String(heightMM));
    } else if (pageSize) {
      args.push("-s", pageSize);
    }

    // Run PagedJS CLI
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

  const output = join(outputBaseDir, projectName, "pagedjs-output.pdf");

  const result = await buildWithPagedJS({ input, output });

  if (!result.success) {
    console.error("\n❌ PagedJS build failed:", result.error);
    process.exit(1);
  }

  console.log("\n✅ PagedJS build complete!");
}
