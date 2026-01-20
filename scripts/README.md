# PDFX Test Harness

A comprehensive test harness for comparing **PagedJS** and **Vivliostyle** CLI tools for generating press-ready, DriveThruRPG-compliant PDF/X documents from HTML and CSS.

## Purpose

This harness evaluates both CSS Paged Media renderers on a real-world TTRPG book layout containing:

1. **Title Page** - Full bleed background with centered typography
2. **Two-Column Layout** - Circular image float with `shape-outside: circle()`
3. **Stat Block** - Monster stats with diamond-shaped float using `shape-outside: polygon()`
4. **Map Layout** - Dungeon map with room descriptions and compass float
5. **Rules Page** - Variant rules with scroll-shaped float using `shape-outside: inset()`, tables, and callout boxes

## Quick Start

### Option 1: Docker (Recommended)

The easiest way to run the test harness with all dependencies pre-installed:

```bash
# Build the Docker image
docker build -t pdfx-test-harness .

# Run with default test document
docker run -v ./output:/output pdfx-test-harness

# Or use docker-compose
docker compose up
```

### Option 2: Local Installation

```bash
# Install dependencies
bun install

# Run full test pipeline
bun run test

# Or run individual steps
bun run build:pagedjs      # Build with PagedJS
bun run build:vivliostyle  # Build with Vivliostyle
bun run convert:pdfx       # Convert to PDF/X
bun run validate           # Validate PDFs
bun run compare            # Generate comparison report
```

## Docker Usage

### Basic Usage

```bash
# Run with default test document, output to ./output
docker run -v $(pwd)/output:/output pdfx-test-harness

# Process custom input directory
docker run \
  -v /path/to/my-books:/input:ro \
  -v /path/to/results:/output \
  pdfx-test-harness

# Skip specific steps
docker run \
  -e SKIP_PAGEDJS=true \
  -v ./output:/output \
  pdfx-test-harness
```

### Batch Processing

Place multiple book projects in the input directory:

```
input/
├── book1/
│   ├── book.html
│   └── styles.css
├── book2/
│   ├── index.html
│   └── print.css
└── book3/
    └── chapter.html
```

Each subdirectory will be processed separately:

```bash
docker run \
  -v ./my-books:/input:ro \
  -v ./results:/output \
  pdfx-test-harness
```

Results structure:

```
results/
├── batch-summary.md           # Overall batch summary
├── book1/
│   ├── pagedjs-output.pdf
│   ├── pagedjs-pdfx.pdf
│   ├── vivliostyle-output.pdf
│   ├── vivliostyle-pdfx.pdf
│   └── comparison-report.md
├── book2/
│   └── ...
└── book3/
    └── ...
```

### Docker Compose

```bash
# Run with defaults
docker compose up

# Run with custom input/output
INPUT_DIR=./my-books OUTPUT_DIR=./results docker compose up

# Interactive shell for debugging
docker compose run --rm shell

# Only run validation
docker compose --profile tools run --rm validate

# Only run comparison
docker compose --profile tools run --rm compare
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INPUT_DIR` | `/input` | Input directory path |
| `OUTPUT_DIR` | `/output` | Output directory path |
| `SKIP_PAGEDJS` | `false` | Skip PagedJS rendering |
| `SKIP_VIVLIOSTYLE` | `false` | Skip Vivliostyle rendering |
| `SKIP_CONVERT` | `false` | Skip PDF/X conversion |
| `SKIP_COMPARE` | `false` | Skip comparison report |

### Docker Commands

```bash
# Build image
docker build -t pdfx-test-harness .

# Run with mounted volumes
docker run -v ./input:/input:ro -v ./output:/output pdfx-test-harness

# Interactive shell
docker run -it --entrypoint /bin/bash pdfx-test-harness

# View help
docker run pdfx-test-harness help

# Validate specific PDFs
docker run -v ./pdfs:/input pdfx-test-harness validate /input/*.pdf
```

## Prerequisites

### System Dependencies

Install these with your system package manager:

```bash
# Ubuntu/Debian
sudo apt install ghostscript poppler-utils imagemagick

# macOS
brew install ghostscript poppler imagemagick

# Windows (via Chocolatey)
choco install ghostscript imagemagick
```

### Bun Runtime

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
```

## Output Files

After running the test, you'll find:

```
output/
├── pagedjs-output.pdf       # PagedJS RGB output
├── pagedjs-pdfx.pdf         # PagedJS PDF/X-1a (print-ready)
├── vivliostyle-output.pdf   # Vivliostyle RGB output
├── vivliostyle-pdfx.pdf     # Vivliostyle PDF/X-1a (print-ready)
└── visual-diff/             # Visual comparison images
    ├── pagedjs/
    ├── vivliostyle/
    └── diff/

reports/
└── comparison-report.md     # Detailed A/B comparison report
```

## DriveThruRPG Specifications

The harness validates against DriveThruRPG's print-on-demand requirements:

| Requirement | Value |
|-------------|-------|
| PDF Format | PDF/X-1a:2001 |
| Color Space | CMYK |
| Max Ink Coverage | 240% TAC |
| Bleed | 0.125" all edges |
| Trim Size | 6" × 9" (configurable) |
| Final Page Size | 6.25" × 9.25" |
| Resolution | 300 DPI |
| Fonts | All embedded |

## Layout Features Tested

### shape-outside Support

The test document exercises multiple `shape-outside` values:

```css
/* Circle float (Chapter page) */
.circle-float {
  shape-outside: circle(50%);
  shape-margin: 0.125in;
}

/* Diamond float (Stat block) */
.diamond-float {
  shape-outside: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  shape-margin: 0.1875in;
}

/* Scroll float (Rules page) */
.scroll-float {
  shape-outside: inset(0.125in round 0.25in);
  shape-margin: 0.125in;
}
```

### CSS Paged Media Features

- `@page` rules with named pages
- Running headers with `position: running()`
- Page counters
- Margin boxes
- Bleed areas
- Orphan/widow control

## CLI Options

```bash
bun run scripts/run-all.ts [options]

Options:
  --skip-pagedjs      Skip PagedJS build step
  --skip-vivliostyle  Skip Vivliostyle build step
  --skip-convert      Skip PDF/X conversion step
  --skip-compare      Skip validation and comparison step
  -h, --help          Show help message
```

## Scripts Reference

| Script | Description |
|--------|-------------|
| `scripts/build-pagedjs.ts` | Renders HTML to PDF using PagedJS CLI |
| `scripts/build-vivliostyle.ts` | Renders HTML to PDF using Vivliostyle CLI |
| `scripts/convert-pdfx.ts` | Converts PDFs to PDF/X using Ghostscript |
| `scripts/validate-pdfs.ts` | Validates PDFs against DriveThruRPG specs |
| `scripts/compare-pdfs.ts` | Generates comparison report with visual diff |
| `scripts/run-all.ts` | Orchestrates the complete pipeline |

## Understanding the Report

The generated `comparison-report.md` includes:

1. **Executive Summary** - Quick compliance status and winner determination
2. **PagedJS Output** - Detailed validation for PagedJS PDFs
3. **Vivliostyle Output** - Detailed validation for Vivliostyle PDFs
4. **A/B Comparison** - Feature-by-feature comparison table
5. **Visual Comparison** - Pages with rendering differences
6. **Ink Coverage** - TAC analysis per page
7. **Recommendations** - Actionable suggestions

## Customization

### Changing Trim Size

Edit `styles.css`:

```css
:root {
  --trim-width: 8.5in;   /* Change from 6in */
  --trim-height: 11in;   /* Change from 9in */
  --bleed: 0.125in;
}
```

### Adding Pages

Add new `<section class="page">` elements to `book.html`:

```html
<section class="page content-page" data-page-type="custom">
  <!-- Your content here -->
</section>
```

## Troubleshooting

### PagedJS Build Fails

```bash
# Increase timeout
bun run scripts/build-pagedjs.ts --timeout 180000

# Check Chromium dependencies
npx puppeteer browsers install chrome
```

### Vivliostyle Build Fails

```bash
# Check for Chromium
npx @vivliostyle/cli info

# Run with verbose logging
npx @vivliostyle/cli build book.html -o test.pdf --log-level debug
```

### PDF/X Conversion Issues

```bash
# Verify Ghostscript
gs --version

# Check ICC profiles
ls /usr/share/color/icc/
```

### Visual Comparison Errors

```bash
# Ensure ImageMagick and pdftoppm are installed
which compare
which pdftoppm
```

## Kitchen Sink Example

The `examples/` directory contains a comprehensive kitchen-sink test document that exercises all Vivliostyle supported CSS features:

```bash
# Test the kitchen-sink example
docker run \
  -v ./examples:/input \
  -v ./output:/output \
  pdfx-test-harness
```

### Features Tested

The kitchen-sink example covers 20 pages testing:

- **CSS Values**: Length units, colors, calc(), attr(), target-counter(), env()
- **Selectors**: All CSS2/CSS3 selectors, pseudo-classes, pseudo-elements
- **@page Rules**: Size, bleed, marks, margin boxes, page selectors
- **Multi-column**: column-count, column-span, column-fill
- **Fragmentation**: break-*, orphans, widows, box-decoration-break
- **Page Floats**: float-reference: page, footnotes
- **Writing Modes**: vertical-rl, text-combine-upright, bidi
- **Flexbox**: All flex properties
- **Transforms**: 2D transforms, filters, blend modes
- **Logical Properties**: inline-size, block-size, margin-block
- **Typography**: text-emphasis, hyphenation, text-decoration
- **Ruby**: Ruby annotations with ruby-align, ruby-position
- **Clip Paths**: circle(), polygon(), inset()

See `examples/README.md` for the complete feature verification checklist.

## License

MIT License - Use freely for your TTRPG projects!

## Credits

- [PagedJS](https://pagedjs.org/) - CSS Paged Media polyfill
- [Vivliostyle](https://vivliostyle.org/) - CSS typesetting engine
- [Ghostscript](https://www.ghostscript.com/) - PDF processing
- [Poppler](https://poppler.freedesktop.org/) - PDF utilities
