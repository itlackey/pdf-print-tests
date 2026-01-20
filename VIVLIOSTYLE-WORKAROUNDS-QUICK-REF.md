# Vivliostyle Workarounds - Quick Reference

**Last Updated:** 2026-01-20

This guide provides quick CSS workarounds for Vivliostyle blank page rendering bugs.

---

## Quick Decision Tree

```
Is your page rendering blank in Vivliostyle?
│
├─ YES → Check if page uses any of these CSS features:
│   │
│   ├─ display: flex or display: grid?
│   │   └─ REPLACE WITH: inline-block or table layout (see below)
│   │
│   ├─ column-count or multi-column layout?
│   │   └─ REPLACE WITH: float-based layout (see below)
│   │
│   ├─ clip-path?
│   │   └─ REPLACE WITH: border-radius or remove
│   │
│   ├─ target-counter()?
│   │   └─ REPLACE WITH: static text like "[see page X]"
│   │
│   ├─ Complex gradients or multiple shadows?
│   │   └─ SIMPLIFY: Use solid colors or single shadows
│   │
│   └─ text-emphasis?
│       └─ REMOVE: Use bold or color instead
│
└─ NO → Page should render fine
```

---

## CSS Workarounds

### 1. Flexbox → Inline-block

**DON'T USE (causes blank page):**
```css
.container {
  display: flex;
  gap: 1em;
}

.item {
  flex: 1;
}
```

**USE INSTEAD:**
```css
.container {
  display: block;
  text-align: center; /* for centering */
}

.item {
  display: inline-block;
  width: 30%;
  vertical-align: top;
  margin: 0 1%;
}

/* Clear floats if needed */
.container::after {
  content: "";
  display: table;
  clear: both;
}
```

---

### 2. Grid → Table Layout

**DON'T USE (causes blank page):**
```css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1em;
}
```

**USE INSTEAD:**
```css
.grid {
  display: table;
  width: 100%;
  border-spacing: 1em;
}

.grid-item {
  display: table-cell;
  width: 33.333%;
}
```

---

### 3. Multi-column → Float-based

**DON'T USE (causes blank page):**
```css
.two-columns {
  column-count: 2;
  column-gap: 1em;
  column-rule: 1pt solid gray;
}
```

**USE INSTEAD:**
```css
.two-columns {
  display: block;
}

.two-columns p {
  float: left;
  width: calc(50% - 0.5em);
  margin-right: 1em;
}

.two-columns p:nth-child(even) {
  margin-right: 0;
}

.two-columns::after {
  content: "";
  display: table;
  clear: both;
}

/* Add visual separator */
.two-columns p:nth-child(odd)::after {
  content: "";
  position: absolute;
  right: -0.5em;
  top: 0;
  bottom: 0;
  width: 1pt;
  background: gray;
}
```

---

### 4. Clip-path → Border-radius

**DON'T USE (causes blank page):**
```css
.circle {
  clip-path: circle(40%);
}

.polygon {
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
}
```

**USE INSTEAD:**
```css
.circle {
  border-radius: 50%;
  overflow: hidden;
}

.polygon {
  /* Polygons can't be replicated - remove or use image */
  border-radius: 6pt; /* Simple rounded corners */
}
```

---

### 5. target-counter() → Static Text

**DON'T USE (causes blank page):**
```css
.page-ref::after {
  content: target-counter(attr(href), page);
}
```

**USE INSTEAD:**
```css
.page-ref::after {
  content: " [see reference]";
  font-size: 0.8em;
  color: #666;
}

/* Or in HTML, add manual page numbers */
```

```html
<a href="#section">See Section 5 (page 23)</a>
```

---

### 6. Complex Gradients → Simplified

**DON'T USE (causes blank page):**
```css
.bg {
  background:
    linear-gradient(45deg, transparent 40%, red 40%, red 60%, transparent 60%),
    linear-gradient(135deg, blue 25%, green 75%),
    #333;
}
```

**USE INSTEAD:**
```css
.bg {
  background: linear-gradient(135deg, blue, green);
  /* Single, simple gradient */
}

/* Or just use solid color */
.bg {
  background: #3498db;
}
```

---

### 7. Multiple Box Shadows → Single Shadow

**DON'T USE (causes blank page):**
```css
.box {
  box-shadow:
    2pt 2pt 4pt #3498db,
    -2pt -2pt 4pt #e74c3c,
    0 0 10pt rgba(0,0,0,0.3);
}
```

**USE INSTEAD:**
```css
.box {
  box-shadow: 3pt 3pt 6pt rgba(0,0,0,0.3);
  /* Add border for color effect */
  border: 2pt solid #3498db;
}
```

---

### 8. Text Emphasis → Bold/Color

**DON'T USE (causes blank page):**
```css
.emphasized {
  text-emphasis: dot;
  text-emphasis-position: over;
}
```

**USE INSTEAD:**
```css
.emphasized {
  font-weight: bold;
  color: #3498db;
}

/* Or use ::before for markers */
.emphasized::before {
  content: "• ";
  color: #3498db;
}
```

---

## Complete Template Replacement

If you need to convert an entire document, use the pre-built workaround stylesheet:

**Original:**
```html
<link rel="stylesheet" href="your-styles.css">
```

**Workaround:**
```html
<!-- Load base styles -->
<link rel="stylesheet" href="your-styles.css">

<!-- Override with Vivliostyle-safe alternatives -->
<link rel="stylesheet" href="vivliostyle-safe-overrides.css">
```

Or use our complete safe version:
```html
<link rel="stylesheet" href="kitchen-sink-vivliostyle-safe.css">
```

---

## Testing Before/After

**Test your changes:**
```bash
# Generate PDF with Vivliostyle
bun build-vivliostyle.ts your-file.html output/test-vivlio.pdf

# Compare with PagedJS
bun build-pagedjs.ts your-file.html output/test-pagedjs.pdf

# Open both and verify no blank pages
```

---

## Feature Support Matrix

| CSS Feature | PagedJS | Vivliostyle | Workaround |
|------------|---------|-------------|------------|
| `display: flex` | ✅ Full | ❌ Blank page | Use inline-block |
| `display: grid` | ✅ Full | ❌ Blank page | Use table |
| `column-count` | ✅ Full | ❌ Blank page | Use floats |
| `clip-path` | ✅ Full | ❌ Blank page | Use border-radius |
| `target-counter()` | ✅ Full | ❌ Blank page | Use static text |
| `text-emphasis` | ✅ Full | ❌ Blank page | Use bold/color |
| Simple gradients | ✅ Full | ✅ Works | None needed |
| Complex gradients | ✅ Full | ❌ Blank page | Simplify |
| Single box-shadow | ✅ Full | ✅ Works | None needed |
| Multiple shadows | ✅ Full | ❌ Blank page | Use single shadow |
| `border-radius` | ✅ Full | ✅ Works | None needed |

---

## When to Use PagedJS Instead

Consider using PagedJS if your document requires:
- Modern responsive layouts (flexbox, grid)
- Multi-column text flow
- Complex visual effects (clip-path, multiple shadows)
- Advanced GCPM features (target-counter, page floats)
- CJK typography (text-emphasis)

PagedJS currently has better CSS support and no blank page bugs.

---

## Quick Commands

**Generate comparison:**
```bash
# Run all tests
cd scripts
bun test-vivliostyle-bugs.ts

# Test single file
bun build-vivliostyle.ts examples/test-minimal-flexbox.html output/test.pdf
```

**View output:**
```bash
# Open PDFs
open output/*.pdf

# Or on Linux
xdg-open output/*.pdf
```

---

## Getting Help

If workarounds don't solve your blank page issue:

1. Check which CSS features the page uses
2. Test with minimal reproduction (< 50 lines HTML)
3. File bug report using template: `VIVLIOSTYLE-BUG-REPORT-TEMPLATE.md`
4. Share on Vivliostyle community forums

---

## Additional Resources

- [Full Analysis](./VIVLIOSTYLE-BLANK-PAGE-ANALYSIS.md)
- [Bug Report Template](./VIVLIOSTYLE-BUG-REPORT-TEMPLATE.md)
- [Summary Document](./VIVLIOSTYLE-BUG-SUMMARY.md)
- [Minimal Test Cases](./examples/)

---

**Pro Tip:** Always test your workarounds in both Vivliostyle AND PagedJS to ensure compatibility across engines.
