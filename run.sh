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

# Create output directory
mkdir -p output

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

ARGS=()
[ $SKIP_PAGEDJS -eq 1 ] && ARGS+=("--skip-pagedjs")
[ $SKIP_VIVLIOSTYLE -eq 1 ] && ARGS+=("--skip-vivliostyle")
[ $SKIP_CONVERT -eq 1 ] && ARGS+=("--skip-convert")
[ $SKIP_COMPARE -eq 1 ] && ARGS+=("--skip-compare")

echo -e "\n${BLUE}────────────────────────────────────────${NC}"
echo -e "${BLUE}Running unified pipeline (same as Docker)${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}"

# If INPUT_DIR / OUTPUT_DIR are set in the environment, the pipeline will use them.
# Otherwise it will fall back to the bundled ./input and write to ./output/default-test.
bun run test "${ARGS[@]}"

# Summary
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   PIPELINE COMPLETE${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

echo -e "\n${GREEN}📄 Summary: output/batch-summary.md${NC}"
echo -e "${GREEN}📁 Results: output/<project>/*${NC}"

echo ""
