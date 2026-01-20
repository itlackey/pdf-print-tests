#!/usr/bin/env bun

/**
 * Test Vivliostyle Blank Page Bugs
 *
 * This script generates PDFs for minimal test cases to isolate
 * specific Vivliostyle rendering bugs.
 */

import { $ } from 'bun';
import { existsSync } from 'fs';
import { join } from 'path';

const EXAMPLES_DIR = join(import.meta.dir, '..', 'examples');
const OUTPUT_DIR = join(import.meta.dir, '..', 'output', 'vivliostyle-tests');

interface TestCase {
  name: string;
  htmlFile: string;
  description: string;
  expectedPages: number;
}

const TEST_CASES: TestCase[] = [
  {
    name: 'multicolumn',
    htmlFile: 'test-minimal-multicolumn.html',
    description: 'Multi-column layout isolation test',
    expectedPages: 1,
  },
  {
    name: 'flexbox',
    htmlFile: 'test-minimal-flexbox.html',
    description: 'Flexbox layout isolation test',
    expectedPages: 1,
  },
  {
    name: 'counters',
    htmlFile: 'test-minimal-counters.html',
    description: 'CSS counters and target-counter() test',
    expectedPages: 1,
  },
  {
    name: 'visual',
    htmlFile: 'test-minimal-visual.html',
    description: 'Visual effects (gradients, shadows, clip-path) test',
    expectedPages: 1,
  },
];

async function ensureOutputDir() {
  await $`mkdir -p ${OUTPUT_DIR}`;
}

async function runVivliostyleTest(testCase: TestCase) {
  const inputPath = join(EXAMPLES_DIR, testCase.htmlFile);
  const outputPath = join(OUTPUT_DIR, `${testCase.name}.pdf`);

  if (!existsSync(inputPath)) {
    console.error(`❌ Test file not found: ${inputPath}`);
    return false;
  }

  console.log(`\n📄 Testing: ${testCase.description}`);
  console.log(`   Input:  ${testCase.htmlFile}`);
  console.log(`   Output: ${testCase.name}.pdf`);

  try {
    // Run Vivliostyle CLI
    await $`bun vivliostyle build ${inputPath} -o ${outputPath} --no-sandbox`;

    // Check if PDF was created
    if (existsSync(outputPath)) {
      const stats = await Bun.file(outputPath).size;
      console.log(`   ✅ PDF generated (${(stats / 1024).toFixed(2)} KB)`);

      // Check PDF page count (basic check - file should be > 5KB for 1 page)
      if (stats < 5000) {
        console.log(`   ⚠️  Warning: PDF file is very small, may indicate rendering failure`);
        return false;
      }

      return true;
    } else {
      console.log(`   ❌ PDF generation failed`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error}`);
    return false;
  }
}

async function runPagedJSTest(testCase: TestCase) {
  const inputPath = join(EXAMPLES_DIR, testCase.htmlFile);
  const outputPath = join(OUTPUT_DIR, `${testCase.name}-pagedjs.pdf`);

  if (!existsSync(inputPath)) {
    console.error(`❌ Test file not found: ${inputPath}`);
    return false;
  }

  console.log(`\n📄 Testing (PagedJS): ${testCase.description}`);
  console.log(`   Input:  ${testCase.htmlFile}`);
  console.log(`   Output: ${testCase.name}-pagedjs.pdf`);

  try {
    // Run PagedJS via Puppeteer
    const scriptPath = join(import.meta.dir, 'build-pagedjs.ts');
    await $`bun ${scriptPath} ${inputPath} ${outputPath}`;

    if (existsSync(outputPath)) {
      const stats = await Bun.file(outputPath).size;
      console.log(`   ✅ PDF generated (${(stats / 1024).toFixed(2)} KB)`);
      return true;
    } else {
      console.log(`   ❌ PDF generation failed`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('VIVLIOSTYLE BLANK PAGE BUG TEST SUITE');
  console.log('='.repeat(70));

  await ensureOutputDir();

  const results = {
    vivliostyle: { passed: 0, failed: 0 },
    pagedjs: { passed: 0, failed: 0 },
  };

  // Test with Vivliostyle
  console.log('\n' + '='.repeat(70));
  console.log('VIVLIOSTYLE TESTS');
  console.log('='.repeat(70));

  for (const testCase of TEST_CASES) {
    const success = await runVivliostyleTest(testCase);
    if (success) {
      results.vivliostyle.passed++;
    } else {
      results.vivliostyle.failed++;
    }
  }

  // Test with PagedJS for comparison
  console.log('\n' + '='.repeat(70));
  console.log('PAGEDJS COMPARISON TESTS');
  console.log('='.repeat(70));

  for (const testCase of TEST_CASES) {
    const success = await runPagedJSTest(testCase);
    if (success) {
      results.pagedjs.passed++;
    } else {
      results.pagedjs.failed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));

  console.log('\nVivliostyle Results:');
  console.log(`  ✅ Passed: ${results.vivliostyle.passed}/${TEST_CASES.length}`);
  console.log(`  ❌ Failed: ${results.vivliostyle.failed}/${TEST_CASES.length}`);

  console.log('\nPagedJS Results (baseline):');
  console.log(`  ✅ Passed: ${results.pagedjs.passed}/${TEST_CASES.length}`);
  console.log(`  ❌ Failed: ${results.pagedjs.failed}/${TEST_CASES.length}`);

  console.log('\nNext Steps:');
  console.log('1. Review generated PDFs in: ' + OUTPUT_DIR);
  console.log('2. Compare Vivliostyle vs PagedJS output for each test');
  console.log('3. Identify which specific CSS feature causes blank pages');
  console.log('4. File bug reports with minimal reproduction cases');
  console.log('5. Use kitchen-sink-vivliostyle-safe.css as workaround');

  console.log('\n' + '='.repeat(70));

  // Exit with error code if any Vivliostyle tests failed
  if (results.vivliostyle.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
