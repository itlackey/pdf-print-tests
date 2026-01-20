#!/usr/bin/env bun
/**
 * Test script to diagnose font embedding issues in PDF/X conversion
 */

import { $ } from "bun";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const input = join(ROOT, "output/kitchen-sink/pagedjs-output.pdf");
const testDir = join(ROOT, "output/font-tests");

if (!existsSync(testDir)) {
  mkdirSync(testDir, { recursive: true });
}

interface TestConfig {
  name: string;
  args: string[];
}

const tests: TestConfig[] = [
  {
    name: "baseline-current-settings",
    args: [
      "-dBATCH",
      "-dNOPAUSE",
      "-dNOOUTERSAVE",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-sColorConversionStrategy=CMYK",
      "-sProcessColorModel=DeviceCMYK",
      "-dOverrideICC=false",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dPDFSETTINGS=/prepress",
      "-dPDFX=true",
    ],
  },
  {
    name: "test1-no-pdfx-flag",
    args: [
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-sColorConversionStrategy=CMYK",
      "-sProcessColorModel=DeviceCMYK",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dPDFSETTINGS=/prepress",
    ],
  },
  {
    name: "test2-no-color-conversion",
    args: [
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dPDFSETTINGS=/prepress",
    ],
  },
  {
    name: "test3-compress-fonts-false",
    args: [
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-sColorConversionStrategy=CMYK",
      "-sProcessColorModel=DeviceCMYK",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dCompressFonts=false",
      "-dPDFSETTINGS=/prepress",
    ],
  },
  {
    name: "test4-max-subset-pct",
    args: [
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-sColorConversionStrategy=CMYK",
      "-sProcessColorModel=DeviceCMYK",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dMaxSubsetPct=100",
      "-dPDFSETTINGS=/prepress",
    ],
  },
  {
    name: "test5-no-subset",
    args: [
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-sColorConversionStrategy=CMYK",
      "-sProcessColorModel=DeviceCMYK",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=false",
      "-dPDFSETTINGS=/prepress",
    ],
  },
  {
    name: "test6-simple-minimal",
    args: [
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      "-dEmbedAllFonts=true",
    ],
  },
  {
    name: "test7-prepress-only",
    args: [
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      "-dPDFSETTINGS=/prepress",
    ],
  },
];

console.log("Testing font embedding with different Ghostscript configurations...\n");
console.log(`Input: ${input}\n`);

for (const test of tests) {
  const output = join(testDir, `${test.name}.pdf`);

  console.log(`\n🧪 Test: ${test.name}`);
  console.log(`   Args: ${test.args.join(" ")}`);

  try {
    const gsArgs = ["gs", ...test.args, `-sOutputFile=${output}`, input];
    await $`${gsArgs}`.quiet();

    if (existsSync(output)) {
      const stats = await Bun.file(output).stat();
      console.log(`   ✅ Generated: ${((stats?.size ?? 0) / 1024 / 1024).toFixed(2)} MB`);

      // Check fonts
      const fontResult = await $`pdffonts ${output}`.quiet();
      const fontLines = fontResult.stdout.toString().trim().split("\n");
      const fontCount = Math.max(0, fontLines.length - 2); // Subtract header lines
      console.log(`   📝 Fonts embedded: ${fontCount}`);

      if (fontCount > 0) {
        console.log(`   🎉 SUCCESS - Fonts are embedded!`);
      }
    } else {
      console.log(`   ❌ Failed - output not created`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("\n✅ Font embedding tests complete!");
console.log(`\nResults saved to: ${testDir}`);
console.log("\nTo examine fonts in detail, run:");
console.log(`  pdffonts ${testDir}/<test-name>.pdf`);
