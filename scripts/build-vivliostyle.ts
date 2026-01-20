#!/usr/bin/env bun
/**
 * Build PDF using Vivliostyle CLI
 * Renders HTML/CSS to PDF using Chromium with native CSS Paged Media support
 */

import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

interface BuildOptions {
  input: string;
  output: string;
  timeout?: number;
  size?: string;
  theme?: string;
  press?: boolean;
}

export async function buildWithVivliostyle(options: BuildOptions): Promise<{
  success: boolean;
  outputPath: string;
  duration: number;
  error?: string;
}> {
  const startTime = performance.now();
  const { input, output, timeout = 120000, size, theme, press = true } = options;

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

    // Add theme/stylesheet if specified
    if (theme) {
      args.push("--theme", theme);
    }

    // Press-ready mode for print
    if (press) {
      args.push("--press-ready");
    }

    // Sandbox flags for container environment
    args.push(
      "--browser-arg=--no-sandbox",
      "--browser-arg=--disable-setuid-sandbox"
    );

    // Run Vivliostyle CLI
    const result = await $`${args}`.quiet();

    const duration = performance.now() - startTime;

    if (existsSync(output)) {
      const stats = await Bun.file(output).stat();
      console.log(`   ✅ Success! Generated ${(stats?.size ?? 0 / 1024).toFixed(2)} KB`);
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
