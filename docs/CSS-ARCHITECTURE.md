# CSS Architecture for PDF Print Tests

## Overview

This project uses a modular CSS architecture that allows for shared base styles and engine-specific overrides. This approach enables us to:

1. Maintain a single source of truth for common styles
2. Apply engine-specific workarounds without polluting the shared codebase
3. Easily test and compare rendering between PagedJS and Vivliostyle
4. Keep the codebase maintainable and organized

## Directory Structure

```
styles/
├── base/                    # Foundation styles (common to all engines)
│   ├── reset.css           # CSS reset and box-sizing
│   ├── typography.css      # Font declarations, headings, paragraphs
│   └── print-base.css      # @page rules and print-specific settings
├── common/                  # Shared styles (common to all engines)
│   ├── variables.css       # CSS custom properties (:root)
│   ├── layout.css          # Flexbox, Grid, multi-column, page structure
│   └── components.css      # Tables, images, selectors, UI components
├── engines/                 # Engine-specific overrides and features
│   ├── pagedjs/
│   │   ├── overrides.css   # PagedJS-specific workarounds
│   │   └── features.css    # PagedJS-specific enhancements
│   └── vivliostyle/
│       ├── overrides.css   # Vivliostyle-specific workarounds
│       └── features.css    # Vivliostyle-specific enhancements
└── themes/                  # Theme-specific decorative styles
    └── kitchen-sink.css    # Kitchen sink theme (title pages, etc.)
```

## File Descriptions

### Base Styles

**`base/reset.css`**
- Universal box-sizing, margin, and padding reset
- Ensures consistent baseline across browsers and engines

**`base/typography.css`**
- Font families, sizes, and weights
- Heading styles (h1-h6)
- Paragraph styles
- Inline text elements (code, strong, em, links)
- List styles

**`base/print-base.css`**
- @page rules for print layout
- Page margins and dimensions
- Running headers and footers
- Named pages (title, content, appendix)
- Print media queries

### Common Styles

**`common/variables.css`**
- CSS custom properties (variables)
- Colors, dimensions, fonts, spacing
- MUST be loaded first (other files depend on these variables)

**`common/layout.css`**
- Page structure (.page, .content-page)
- Flexbox layouts
- Grid layouts
- Multi-column layouts
- Fragmentation (page breaks, orphans/widows)
- Page floats
- Logical properties

**`common/components.css`**
- Tables
- Counters and generated content
- Selectors and pseudo-classes
- CSS value tests (length units, colors, calc, attr)
- Text properties
- Backgrounds and borders
- Transforms and filters
- Writing modes
- Images and media
- Ruby annotations
- Clip and mask

### Engine-Specific Styles

**`engines/pagedjs/overrides.css`**
- Workarounds for PagedJS bugs or limitations
- Styles that need to be different in PagedJS
- Currently minimal, populated as issues are discovered

**`engines/pagedjs/features.css`**
- PagedJS-specific enhancements
- Features that work well in PagedJS but may not work elsewhere

**`engines/vivliostyle/overrides.css`**
- Workarounds for Vivliostyle bugs or limitations
- Styles that need to be different in Vivliostyle
- Includes @media vivliostyle queries

**`engines/vivliostyle/features.css`**
- Vivliostyle-specific enhancements
- Features that work well in Vivliostyle but may not work elsewhere

### Themes

**`themes/kitchen-sink.css`**
- Theme-specific decorative styles
- Title page design
- Summary page layout
- Appendix formatting
- Visual treatments and ornamental elements

## Build Process

The build scripts automatically concatenate CSS files in the correct order for each engine:

### PagedJS Build Order

1. `common/variables.css` - CSS custom properties
2. `base/reset.css` - CSS reset
3. `base/typography.css` - Typography
4. `base/print-base.css` - @page rules
5. `common/layout.css` - Layout systems
6. `common/components.css` - UI components
7. **`engines/pagedjs/overrides.css`** - PagedJS overrides
8. **`engines/pagedjs/features.css`** - PagedJS features
9. `themes/kitchen-sink.css` - Theme styles

### Vivliostyle Build Order

1. `common/variables.css` - CSS custom properties
2. `base/reset.css` - CSS reset
3. `base/typography.css` - Typography
4. `base/print-base.css` - @page rules
5. `common/layout.css` - Layout systems
6. `common/components.css` - UI components
7. **`engines/vivliostyle/overrides.css`** - Vivliostyle overrides
8. **`engines/vivliostyle/features.css`** - Vivliostyle features
9. `themes/kitchen-sink.css` - Theme styles

The build scripts (`scripts/build-pagedjs.ts` and `scripts/build-vivliostyle.ts`) handle this concatenation automatically.

## Usage

### Running Builds

The build scripts will automatically use the modular CSS architecture:

```bash
# Build with PagedJS (uses PagedJS-specific CSS)
bun run scripts/build-pagedjs.ts

# Build with Vivliostyle (uses Vivliostyle-specific CSS)
bun run scripts/build-vivliostyle.ts
```

### Adding New Styles

**For shared styles:**
1. Add to the appropriate file in `base/` or `common/`
2. Both engines will automatically use the new styles

**For engine-specific workarounds:**
1. Add to `engines/pagedjs/overrides.css` OR `engines/vivliostyle/overrides.css`
2. Document why the override is needed (comment in the CSS)
3. Only the specific engine will use the override

**For new themes:**
1. Create a new file in `themes/`
2. Update the build scripts to include your theme

### Best Practices

1. **Variables First**: Always define CSS custom properties in `common/variables.css`
2. **Shared by Default**: Put styles in `base/` or `common/` unless engine-specific
3. **Document Overrides**: Clearly comment WHY an override is needed
4. **Test Both Engines**: Verify changes work in both PagedJS and Vivliostyle
5. **Avoid Duplication**: Don't repeat styles across files
6. **Specificity**: Engine overrides should use same or higher specificity

## Debugging

### Viewing Concatenated CSS

After a build, the concatenated CSS files are saved in the output directory:
- PagedJS: `output/[project]/pagedjs-styles.css`
- Vivliostyle: `output/[project]/vivliostyle-styles.css`

Each concatenated file includes source comments showing which file each section came from.

### Common Issues

**Problem**: Styles not applying
- **Solution**: Check if CSS variables are defined in `common/variables.css`
- **Solution**: Verify file order in build script concatenation

**Problem**: Different rendering between engines
- **Solution**: Add engine-specific override in `engines/[engine]/overrides.css`
- **Solution**: Check if feature is supported by both engines

**Problem**: Colors not showing in PDF
- **Solution**: Ensure `print-color-adjust: exact` is set in `base/print-base.css`

## Migration Notes

The original `examples/kitchen-sink.css` has been refactored into this modular structure. If you need to reference the original monolithic file, it's still available in the git history.

Key changes:
- Variables extracted to `common/variables.css`
- Base styles split into `base/reset.css`, `base/typography.css`, `base/print-base.css`
- Layout and components separated
- Engine-specific code moved to dedicated override files
- Theme-specific decorative styles isolated

## Future Enhancements

Potential additions to this architecture:

1. **Multiple Themes**: Add more theme files for different visual styles
2. **Print Profiles**: Create preset configurations for different POD services
3. **CSS Minification**: Add build step to minify concatenated CSS
4. **Source Maps**: Generate source maps for debugging
5. **Validation**: Add CSS linting and validation to build process

## References

- [CSS Paged Media Module Level 3](https://www.w3.org/TR/css-page-3/)
- [PagedJS Documentation](https://pagedjs.org/documentation/)
- [Vivliostyle Documentation](https://docs.vivliostyle.org/)
- [DriveThruRPG Print Guidelines](https://www.drivethrurpg.com/pub_rules.php)
