# Vivliostyle Kitchen Sink Example

A comprehensive test document that exercises all CSS Paged Media features supported by Vivliostyle (and PagedJS).

## Purpose

This example serves as a feature verification test to ensure both renderers correctly handle all supported CSS features. It's organized into 20 pages covering:

1. **Title Page** - Named pages, full bleed
2. **CSS Values** - Length units, colors, calc(), attr()
3. **Selectors** - All CSS2/CSS3 selectors, pseudo-classes, pseudo-elements
4. **Counters** - CSS counters, target-counter(), quotes
5. **Page Layout** - @page rules, margin boxes, page selectors
6. **Multi-column** - Columns, column-span, column-fill
7. **Fragmentation** - break-*, orphans, widows, box-decoration-break
8. **Page Floats** - float-reference, footnotes
9. **Writing Modes** - vertical text, text-combine-upright, bidi
10. **Flexbox** - flex container, justify, align
11. **Transforms** - 2D transforms, filters, blend modes
12. **Logical Properties** - inline-size, block-size, margin-block
13. **Typography** - text-decoration, text-emphasis, hyphenation
14. **Backgrounds** - gradients, border-radius, box-shadow
15. **Tables** - styled tables, repeat-on-break
16. **Images** - object-fit, SVG properties
17. **Ruby** - Ruby annotations, ruby-align, ruby-position
18. **Clip & Mask** - clip-path shapes
19. **Summary** - Feature checklist
20. **Appendix** - Reference information

## Usage

### With Docker

```bash
# From the test harness root
docker run -v ./examples:/input -v ./output:/output pdfx-test-harness
```

### Locally

```bash
# Run the unified pipeline (same behavior as Docker)
INPUT_DIR=./examples OUTPUT_DIR=./output bun run test

# Results are written to:
#   ./output/project/*
#   ./output/batch-summary.md
```

## Features Tested

Based on [Vivliostyle Supported Features](https://vivliostyle.github.io/vivliostyle.js/docs/en/supported-features.html):

### CSS Values

- [x] CSS-wide keywords (`inherit`)
- [x] Length units (em, ex, ch, rem, vw, vh, vmin, vmax, vi, vb, cm, mm, q, in, pc, pt, px)
- [x] Color values (keywords, hex, rgb, rgba, hsl, hsla, currentColor, transparent)
- [x] `attr()` function
- [x] `target-counter()` function
- [x] `calc()` function
- [x] `env()` function (pub-title, doc-title)

### Selectors

- [x] Type, class, ID selectors
- [x] Attribute selectors (all variants)
- [x] Structural pseudo-classes (:nth-child, :first-child, :last-child, etc.)
- [x] Pseudo-elements (::before, ::after, ::first-letter, ::first-line)
- [x] Combinators (descendant, child, adjacent, general sibling)
- [x] :not() pseudo-class
- [x] :empty, :root pseudo-classes

### At-rules

- [x] @page with size, bleed, marks
- [x] Page margin boxes (@top-center, @bottom-center, etc.)
- [x] Page selectors (:first, :left, :right)
- [x] Named pages
- [x] @media rules
- [x] @namespace

### Properties

- [x] All box model properties
- [x] Typography properties
- [x] Background properties
- [x] Border properties (including border-radius, border-image)
- [x] Transform properties
- [x] Filter properties
- [x] Flexbox properties
- [x] Multi-column properties
- [x] Writing mode properties
- [x] Logical properties

### Paged Media

- [x] Page counters (page, pages)
- [x] Running headers (position: running(), element())
- [x] String-set
- [x] Page floats (float: block-start/end, float-reference: page)
- [x] Footnotes (float: footnote)
- [x] Break properties (break-before, break-after, break-inside)
- [x] Orphans and widows
- [x] box-decoration-break

### Special Features

- [x] Ruby annotations
- [x] Text emphasis
- [x] Hyphenation
- [x] SVG properties
- [x] Clip paths
- [x] Blend modes

## Known Differences

When comparing PagedJS and Vivliostyle output, you may notice differences in:

1. **Page float positioning** - Vivliostyle has more complete page float support
2. **Footnote placement** - Different overflow handling
3. **Running header timing** - When string-set values update
4. **Column balancing** - Different algorithms for column-fill: balance
5. **Hyphenation** - Depends on browser hyphenation dictionaries

## Verification Checklist

Use this checklist when reviewing output:

- [ ] All 20 pages render
- [ ] Page numbers are correct
- [ ] Running headers show chapter titles
- [ ] Footnotes appear at page bottom
- [ ] Page floats position at top of page
- [ ] Multi-column layouts balance
- [ ] Vertical text displays correctly
- [ ] Ruby annotations appear above/below text
- [ ] Transforms and filters render
- [ ] Colors are consistent
- [ ] Fonts are embedded

## File Structure

```text
examples/
├── kitchen-sink.html    # Main HTML document
├── kitchen-sink.css     # Comprehensive stylesheet
└── README.md            # This file
```

## Reference

- [Vivliostyle Supported Features](https://vivliostyle.github.io/vivliostyle.js/docs/en/supported-features.html)
- [CSS Paged Media Module Level 3](https://www.w3.org/TR/css-page-3/)
- [CSS Generated Content for Paged Media](https://www.w3.org/TR/css-gcpm-3/)
- [CSS Page Floats](https://drafts.csswg.org/css-page-floats/)
- [CSS Fragmentation Level 3](https://www.w3.org/TR/css-break-3/)
