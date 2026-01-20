#!/usr/bin/env bun
/**
 * Test PDFX conversion with proper definition file
 */

import { $ } from "bun";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const input = join(ROOT, "output/kitchen-sink/pagedjs-output.pdf");
const testDir = join(ROOT, "output/font-tests");
const iccProfile = join(ROOT, "assets/CGATS21_CRPC1.icc");

if (!existsSync(testDir)) {
  mkdirSync(testDir, { recursive: true });
}

// Create a proper PDFX definition file
const pdfxDef = `%!PS-Adobe-3.0
%%Title: PDF/X-1a:2001 Definition
%%Creator: Test Harness

% PDF/X-1a:2001 definition for Ghostscript
% This ensures fonts are properly embedded

[/GTS_PDFXVersion (PDF/X-1a:2001)
 /Title (Kitchen Sink Test)
 /Trapped /False
 /DOCINFO pdfmark

[/_objdef {cmsIntent} /type /dict /OBJ pdfmark
[{cmsIntent} <<
  /S /GTS_PDFX
  /OutputCondition (Offset printing, according to ISO 12647-2:2004 / Amd 1, OFCOM, paper type 1 or 2 = coated art, 115 g/m2, screen ruling 60/cm)
  /OutputConditionIdentifier (CGATS TR 001)
  /RegistryName (http://www.color.org)
  /Info (CGATS TR 001 - Characterized printing condition)
>> /PUT pdfmark
[{Catalog} <</OutputIntents [ {cmsIntent} ]>> /PUT pdfmark
`;

const pdfxDefPath = join(testDir, "pdfx-def.ps");
writeFileSync(pdfxDefPath, pdfxDef, "utf-8");
console.log(`Created PDFX definition: ${pdfxDefPath}\n`);

interface TestConfig {
  name: string;
  args: string[];
  usePdfxDef?: boolean;
}

const tests: TestConfig[] = [
  {
    name: "pdfx-with-def-file",
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
      "-dPDFX",
    ],
    usePdfxDef: true,
  },
  {
    name: "pdfx-with-icc-profile",
    args: [
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-sColorConversionStrategy=CMYK",
      "-sProcessColorModel=DeviceCMYK",
      `-sOutputICCProfile=${iccProfile}`,
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dPDFSETTINGS=/prepress",
    ],
  },
  {
    name: "pdfx-no-flag-cmyk-only",
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
];

console.log("Testing PDFX with definition files...\n");

for (const test of tests) {
  const output = join(testDir, `${test.name}.pdf`);

  console.log(`\n🧪 Test: ${test.name}`);

  try {
    let gsArgs = ["gs", ...test.args];

    // Add PDFX definition file if specified
    if (test.usePdfxDef) {
      gsArgs.push(pdfxDefPath);
    }

    gsArgs.push(`-sOutputFile=${output}`, input);

    console.log(`   Args: ${gsArgs.slice(1).join(" ")}`);
    await $`${gsArgs}`.quiet();

    if (existsSync(output)) {
      const stats = await Bun.file(output).stat();
      console.log(`   ✅ Generated: ${((stats?.size ?? 0) / 1024 / 1024).toFixed(2)} MB`);

      // Check fonts
      const fontResult = await $`pdffonts ${output}`.quiet();
      const fontLines = fontResult.stdout.toString().trim().split("\n");
      const fontCount = Math.max(0, fontLines.length - 2);
      console.log(`   📝 Fonts embedded: ${fontCount}`);

      if (fontCount > 0) {
        console.log(`   🎉 SUCCESS - Fonts are embedded!`);
      } else {
        console.log(`   ❌ FAIL - No fonts embedded`);
      }

      // Check PDF/X compliance
      const infoResult = await $`pdfinfo ${output}`.quiet();
      const info = infoResult.stdout.toString();
      if (info.includes("PDF version") || info.includes("Producer")) {
        const pdfVersion = info.match(/PDF version:\s*(\S+)/)?.[1];
        console.log(`   📋 PDF version: ${pdfVersion}`);
      }
    } else {
      console.log(`   ❌ Failed - output not created`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("\n✅ Tests complete!");
