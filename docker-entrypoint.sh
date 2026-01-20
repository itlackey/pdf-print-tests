#!/bin/bash
# Docker entrypoint for PDFX Test Harness
# Supports batch processing of multiple input directories

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration from environment
INPUT_DIR="${INPUT_DIR:-/input}"
OUTPUT_DIR="${OUTPUT_DIR:-/output}"
SKIP_PAGEDJS="${SKIP_PAGEDJS:-false}"
SKIP_VIVLIOSTYLE="${SKIP_VIVLIOSTYLE:-false}"
SKIP_CONVERT="${SKIP_CONVERT:-false}"
SKIP_COMPARE="${SKIP_COMPARE:-false}"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║          PDFX Test Harness - Docker Edition                   ║"
    echo "║   PagedJS vs Vivliostyle • DriveThruRPG Compliance            ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

show_help() {
    echo "Usage: docker run [options] pdfx-test-harness [command]"
    echo ""
    echo "Commands:"
    echo "  run           Run the full test pipeline (default)"
    echo "  validate      Only validate existing PDFs"
    echo "  compare       Only run comparison on existing PDFs"
    echo "  shell         Start an interactive shell"
    echo "  help          Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  INPUT_DIR          Input directory (default: /input)"
    echo "  OUTPUT_DIR         Output directory (default: /output)"
    echo "  SKIP_PAGEDJS       Skip PagedJS build (default: false)"
    echo "  SKIP_VIVLIOSTYLE   Skip Vivliostyle build (default: false)"
    echo "  SKIP_CONVERT       Skip PDF/X conversion (default: false)"
    echo "  SKIP_COMPARE       Skip comparison report (default: false)"
    echo ""
    echo "Volume Mounts:"
    echo "  -v /path/to/input:/input     Mount input directory"
    echo "  -v /path/to/output:/output   Mount output directory"
    echo ""
    echo "Examples:"
    echo "  # Run with default test document"
    echo "  docker run -v ./output:/output pdfx-test-harness"
    echo "  # Results: ./output/default-test/* and ./output/batch-summary.md"
    echo ""
    echo "  # Process custom input"
    echo "  docker run -v ./my-books:/input -v ./results:/output pdfx-test-harness"
    echo "  # Results: ./results/<project>/* and ./results/batch-summary.md"
    echo ""
    echo "  # Skip PagedJS, only test Vivliostyle"
    echo "  docker run -e SKIP_PAGEDJS=true -v ./output:/output pdfx-test-harness"
}

# Check if a directory contains processable content
is_valid_project() {
    local dir="$1"
    # Check for HTML file
    if ls "$dir"/*.html &>/dev/null; then
        return 0
    fi
    return 1
}

# Process a single project directory
process_project() {
    local project_dir="$1"
    local project_name="$2"
    local output_base="$3"
    
    log_info "Processing project: $project_name"
    
    # Find the main HTML file
    local html_file=""
    if [ -f "$project_dir/book.html" ]; then
        html_file="$project_dir/book.html"
    elif [ -f "$project_dir/index.html" ]; then
        html_file="$project_dir/index.html"
    else
        # Use first HTML file found
        html_file=$(ls "$project_dir"/*.html 2>/dev/null | head -1)
    fi
    
    if [ -z "$html_file" ] || [ ! -f "$html_file" ]; then
        log_warn "No HTML file found in $project_dir, skipping"
        return 1
    fi
    
    log_info "Using HTML file: $(basename "$html_file")"
    
    # Create output directory for this project
    local project_output="$output_base/$project_name"
    mkdir -p "$project_output"
    
    # Copy project files to working directory
    local work_dir="/tmp/work-$project_name"
    rm -rf "$work_dir"
    mkdir -p "$work_dir"
    cp -r "$project_dir"/* "$work_dir/"
    
    # Build arguments
    local args=""
    [ "$SKIP_PAGEDJS" = "true" ] && args="$args --skip-pagedjs"
    [ "$SKIP_VIVLIOSTYLE" = "true" ] && args="$args --skip-vivliostyle"
    [ "$SKIP_CONVERT" = "true" ] && args="$args --skip-convert"
    [ "$SKIP_COMPARE" = "true" ] && args="$args --skip-compare"
    
    # Run the pipeline using the batch processor
    cd /app
    bun run scripts/batch-process.ts \
        --input "$work_dir" \
        --output "$project_output" \
        --html "$(basename "$html_file")" \
        $args
    
    local result=$?
    
    # Cleanup
    rm -rf "$work_dir"
    
    return $result
}

# Main run function
run_pipeline() {
    print_banner
    
    log_info "Input directory: $INPUT_DIR"
    log_info "Output directory: $OUTPUT_DIR"
    
    # Ensure output directory exists
    mkdir -p "$OUTPUT_DIR"
    
    # Check if input directory has content
    if [ -d "$INPUT_DIR" ] && [ "$(ls -A "$INPUT_DIR" 2>/dev/null)" ]; then
        log_info "Found mounted input directory with content"
        
        # Check if input directory itself is a project
        if is_valid_project "$INPUT_DIR"; then
            log_info "Input directory is a single project"
            process_project "$INPUT_DIR" "project" "$OUTPUT_DIR"
        else
            # Process each subdirectory as a separate project
            local project_count=0
            local success_count=0
            
            for dir in "$INPUT_DIR"/*/; do
                if [ -d "$dir" ]; then
                    local name=$(basename "$dir")
                    if is_valid_project "$dir"; then
                        ((project_count++))
                        if process_project "$dir" "$name" "$OUTPUT_DIR"; then
                            ((success_count++))
                        fi
                    else
                        log_warn "Skipping $name (no HTML files found)"
                    fi
                fi
            done
            
            # Also check for HTML files directly in input root
            if ls "$INPUT_DIR"/*.html &>/dev/null 2>&1; then
                ((project_count++))
                if process_project "$INPUT_DIR" "root" "$OUTPUT_DIR"; then
                    ((success_count++))
                fi
            fi
            
            if [ $project_count -eq 0 ]; then
                log_warn "No valid projects found in input directory"
                log_info "Falling back to default test document"
                run_default_test
            else
                log_success "Processed $success_count of $project_count projects"
            fi
        fi
    else
        log_info "No input mounted or empty, using default test document"
        run_default_test
    fi
    
    # Generate summary report if multiple projects were processed
    generate_summary_report
    
    log_success "Pipeline complete! Results in: $OUTPUT_DIR"
}

# Run with the default included test document
run_default_test() {
    log_info "Running default test with included input/book.html"
    
    mkdir -p "$OUTPUT_DIR/default-test"
    
    # Build arguments
    local args=""
    [ "$SKIP_PAGEDJS" = "true" ] && args="$args --skip-pagedjs"
    [ "$SKIP_VIVLIOSTYLE" = "true" ] && args="$args --skip-vivliostyle"
    [ "$SKIP_CONVERT" = "true" ] && args="$args --skip-convert"
    [ "$SKIP_COMPARE" = "true" ] && args="$args --skip-compare"
    
    cd /app
    bun run scripts/batch-process.ts \
        --input /app/input \
        --output "$OUTPUT_DIR/default-test" \
        --html book.html \
        $args
    
    # comparison-report.md is written directly into the output directory
}

# Generate a summary report for batch processing
generate_summary_report() {
    local report_file="$OUTPUT_DIR/batch-summary.md"
    
    echo "# PDFX Test Harness - Batch Summary" > "$report_file"
    echo "" >> "$report_file"
    echo "**Generated:** $(date -Iseconds)" >> "$report_file"
    echo "" >> "$report_file"
    echo "## Projects Processed" >> "$report_file"
    echo "" >> "$report_file"
    
    # List all project directories with their status
    for dir in "$OUTPUT_DIR"/*/; do
        if [ -d "$dir" ]; then
            local name=$(basename "$dir")
            local status="❓ Unknown"
            
            # Check for PDF files
            local pj_pdf="$dir/pagedjs-pdfx.pdf"
            local vs_pdf="$dir/vivliostyle-pdfx.pdf"
            local report="$dir/comparison-report.md"
            
            if [ -f "$pj_pdf" ] && [ -f "$vs_pdf" ]; then
                status="✅ Complete"
            elif [ -f "$pj_pdf" ] || [ -f "$vs_pdf" ]; then
                status="⚠️ Partial"
            else
                status="❌ Failed"
            fi
            
            echo "### $name" >> "$report_file"
            echo "" >> "$report_file"
            echo "- **Status:** $status" >> "$report_file"
            
            # List generated files
            echo "- **Files:**" >> "$report_file"
            for pdf in "$dir"/*.pdf; do
                if [ -f "$pdf" ]; then
                    local size=$(du -h "$pdf" | cut -f1)
                    echo "  - $(basename "$pdf") ($size)" >> "$report_file"
                fi
            done
            
            # Link to detailed report if exists
            if [ -f "$report" ]; then
                echo "- **Report:** [comparison-report.md](./$name/comparison-report.md)" >> "$report_file"
            fi
            
            echo "" >> "$report_file"
        fi
    done
    
    echo "---" >> "$report_file"
    echo "" >> "$report_file"
    echo "*Generated by PDFX Test Harness Docker*" >> "$report_file"
    
    log_info "Batch summary written to: $report_file"
}

# Only validate existing PDFs
run_validate() {
    print_banner
    log_info "Running validation only"
    
    cd /app
    bun run scripts/validate-pdfs.ts "$@"
}

# Only run comparison
run_compare() {
    print_banner
    log_info "Running comparison only"
    
    cd /app
    bun run scripts/compare-pdfs.ts "$@"
}

# Main command handler
case "${1:-run}" in
    run)
        shift || true
        run_pipeline "$@"
        ;;
    validate)
        shift
        run_validate "$@"
        ;;
    compare)
        shift
        run_compare "$@"
        ;;
    shell|bash|sh)
        exec /bin/bash
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        # If first arg looks like a file/path, treat as custom run
        if [ -f "$1" ] || [ -d "$1" ]; then
            run_pipeline "$@"
        else
            log_error "Unknown command: $1"
            show_help
            exit 1
        fi
        ;;
esac
