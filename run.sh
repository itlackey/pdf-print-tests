#!/bin/bash
# PDFX Test Harness - Shell Script Runner
# Alternative to bun run for those who prefer bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   PDFX Test Harness - Shell Runner${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# Check for bun
if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ Bun is not installed${NC}"
    echo "   Install with: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Check for system dependencies
echo -e "\n${YELLOW}🔍 Checking system dependencies...${NC}"

check_cmd() {
    if command -v "$1" &> /dev/null; then
        echo -e "   ${GREEN}✅${NC} $2"
        return 0
    else
        echo -e "   ${RED}❌${NC} $2 - MISSING"
        return 1
    fi
}

MISSING=0
check_cmd "gs" "Ghostscript" || MISSING=1
check_cmd "pdfinfo" "Poppler (pdfinfo)" || MISSING=1
check_cmd "pdftoppm" "Poppler (pdftoppm)" || MISSING=1
check_cmd "compare" "ImageMagick" || MISSING=1

if [ $MISSING -eq 1 ]; then
    echo -e "\n${YELLOW}⚠️  Some dependencies are missing${NC}"
    echo "   Ubuntu: sudo apt install ghostscript poppler-utils imagemagick"
    echo "   macOS: brew install ghostscript poppler imagemagick"
fi

# Install npm dependencies
echo -e "\n${YELLOW}📦 Installing dependencies...${NC}"
bun install

# Create output directories
mkdir -p output reports

# Parse arguments
SKIP_PAGEDJS=0
SKIP_VIVLIOSTYLE=0
SKIP_CONVERT=0
SKIP_COMPARE=0

for arg in "$@"; do
    case $arg in
        --skip-pagedjs) SKIP_PAGEDJS=1 ;;
        --skip-vivliostyle) SKIP_VIVLIOSTYLE=1 ;;
        --skip-convert) SKIP_CONVERT=1 ;;
        --skip-compare) SKIP_COMPARE=1 ;;
        --help|-h)
            echo ""
            echo "Usage: ./run.sh [options]"
            echo ""
            echo "Options:"
            echo "  --skip-pagedjs      Skip PagedJS build"
            echo "  --skip-vivliostyle  Skip Vivliostyle build"
            echo "  --skip-convert      Skip PDF/X conversion"
            echo "  --skip-compare      Skip comparison report"
            echo "  -h, --help          Show this help"
            exit 0
            ;;
    esac
done

# Step 1: Build with PagedJS
if [ $SKIP_PAGEDJS -eq 0 ]; then
    echo -e "\n${BLUE}────────────────────────────────────────${NC}"
    echo -e "${BLUE}STEP 1: Build with PagedJS CLI${NC}"
    echo -e "${BLUE}────────────────────────────────────────${NC}"
    
    if npx pagedjs-cli book.html -o output/pagedjs-output.pdf --browserArgs "--no-sandbox,--disable-setuid-sandbox"; then
        echo -e "${GREEN}✅ PagedJS build complete${NC}"
    else
        echo -e "${RED}❌ PagedJS build failed${NC}"
    fi
else
    echo -e "\n${YELLOW}⏭️  Skipping PagedJS build${NC}"
fi

# Step 2: Build with Vivliostyle
if [ $SKIP_VIVLIOSTYLE -eq 0 ]; then
    echo -e "\n${BLUE}────────────────────────────────────────${NC}"
    echo -e "${BLUE}STEP 2: Build with Vivliostyle CLI${NC}"
    echo -e "${BLUE}────────────────────────────────────────${NC}"
    
    if npx @vivliostyle/cli build book.html -o output/vivliostyle-output.pdf --press-ready --browser-arg=--no-sandbox --browser-arg=--disable-setuid-sandbox; then
        echo -e "${GREEN}✅ Vivliostyle build complete${NC}"
    else
        echo -e "${RED}❌ Vivliostyle build failed${NC}"
    fi
else
    echo -e "\n${YELLOW}⏭️  Skipping Vivliostyle build${NC}"
fi

# Step 3: Convert to PDF/X
if [ $SKIP_CONVERT -eq 0 ]; then
    echo -e "\n${BLUE}────────────────────────────────────────${NC}"
    echo -e "${BLUE}STEP 3: Convert to PDF/X (Ghostscript)${NC}"
    echo -e "${BLUE}────────────────────────────────────────${NC}"
    
    convert_to_pdfx() {
        local input="$1"
        local output="$2"
        
        if [ ! -f "$input" ]; then
            echo -e "${YELLOW}⚠️  Skipping $input (not found)${NC}"
            return 1
        fi
        
        echo -e "   Converting $(basename "$input")..."
        
        gs -dBATCH -dNOPAUSE -dNOOUTERSAVE -dQUIET \
           -sDEVICE=pdfwrite \
           -dCompatibilityLevel=1.4 \
           -sColorConversionStrategy=CMYK \
           -sProcessColorModel=DeviceCMYK \
           -dOverrideICC=true \
           -dColorImageResolution=300 \
           -dGrayImageResolution=300 \
           -dMonoImageResolution=300 \
           -dEmbedAllFonts=true \
           -dSubsetFonts=true \
           -dAutoFilterColorImages=false \
           -dColorImageFilter=/DCTEncode \
           -dAutoFilterGrayImages=false \
           -dGrayImageFilter=/DCTEncode \
           -dPDFSETTINGS=/prepress \
           -dPDFX=true \
           -sOutputFile="$output" \
           "$input"
        
        if [ -f "$output" ]; then
            echo -e "   ${GREEN}✅${NC} Created $(basename "$output")"
            return 0
        else
            echo -e "   ${RED}❌${NC} Failed to create $(basename "$output")"
            return 1
        fi
    }
    
    convert_to_pdfx "output/pagedjs-output.pdf" "output/pagedjs-pdfx.pdf"
    convert_to_pdfx "output/vivliostyle-output.pdf" "output/vivliostyle-pdfx.pdf"
else
    echo -e "\n${YELLOW}⏭️  Skipping PDF/X conversion${NC}"
fi

# Step 4: Validate and Compare
if [ $SKIP_COMPARE -eq 0 ]; then
    echo -e "\n${BLUE}────────────────────────────────────────${NC}"
    echo -e "${BLUE}STEP 4: Validate and Compare${NC}"
    echo -e "${BLUE}────────────────────────────────────────${NC}"
    
    bun run scripts/compare-pdfs.ts
else
    echo -e "\n${YELLOW}⏭️  Skipping comparison${NC}"
fi

# Summary
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   PIPELINE COMPLETE${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

echo -e "\n${GREEN}📁 Generated Files:${NC}"
for f in output/*.pdf; do
    if [ -f "$f" ]; then
        size=$(du -h "$f" | cut -f1)
        echo -e "   ${GREEN}✅${NC} $(basename "$f") ($size)"
    fi
done

if [ -f "reports/comparison-report.md" ]; then
    echo -e "\n${GREEN}📄 Report: reports/comparison-report.md${NC}"
fi

echo ""
