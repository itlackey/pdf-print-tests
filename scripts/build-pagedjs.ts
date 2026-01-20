#!/usr/bin/env bun
/**
 * Build PDF using PagedJS CLI
 * Renders HTML/CSS to PDF using Chromium via PagedJS polyfill
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
  additionalStyles?: string;
}

export async function buildWithPagedJS(options: BuildOptions): Promise<{
  success: boolean;
  outputPath: string;
  duration: number;
  error?: string;
}> {
  const startTime = performance.now();
  const { input, output, timeout = 60000, additionalStyles } = options;

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
    ];

    if (additionalStyles) {
      args.push("--additional-styles", additionalStyles);
    }

    // Run PagedJS CLI
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

  const output = join(outputBaseDir, projectName, "pagedjs-output.pdf");

  const result = await buildWithPagedJS({ input, output });

  if (!result.success) {
    console.error("\n❌ PagedJS build failed:", result.error);
    process.exit(1);
  }

  console.log("\n✅ PagedJS build complete!");
}
