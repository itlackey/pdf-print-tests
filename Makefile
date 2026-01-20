# PDFX Test Harness - Makefile
# Convenience commands for building and running the test harness

.PHONY: all build run clean docker-build docker-run docker-shell help kitchen-sink

# Default target
all: help

# Build Docker image
docker-build:
	docker build -t pdfx-test-harness .

# Run with Docker (default test document)
docker-run: docker-build
	docker run --rm \
		-v $(PWD)/output:/output \
		pdfx-test-harness

# Run kitchen-sink example
docker-kitchen-sink: docker-build
	docker run --rm \
		-v $(PWD)/examples:/input:ro \
		-v $(PWD)/output:/output \
		pdfx-test-harness

# Run with custom input
docker-run-custom: docker-build
	@if [ -z "$(INPUT)" ]; then \
		echo "Usage: make docker-run-custom INPUT=/path/to/books OUTPUT=/path/to/results"; \
		exit 1; \
	fi
	docker run --rm \
		-v $(INPUT):/input:ro \
		-v $(or $(OUTPUT),$(PWD)/output):/output \
		pdfx-test-harness

# Interactive Docker shell
docker-shell: docker-build
	docker run --rm -it \
		-v $(PWD)/output:/output \
		--entrypoint /bin/bash \
		pdfx-test-harness

# Docker Compose commands
compose-up:
	docker compose up

compose-down:
	docker compose down

compose-shell:
	docker compose run --rm shell

# Local commands (requires bun and system dependencies)
install:
	bun install

build-pagedjs:
	bun run scripts/build-pagedjs.ts

build-vivliostyle:
	bun run scripts/build-vivliostyle.ts

convert:
	bun run scripts/convert-pdfx.ts

validate:
	bun run scripts/validate-pdfs.ts

compare:
	bun run scripts/compare-pdfs.ts

test: install
	bun run scripts/run-all.ts

# Run kitchen-sink example locally
kitchen-sink: install
	bun run test:kitchen-sink

# Clean generated files
clean:
	rm -rf output/* reports/* node_modules/

clean-docker:
	docker rmi pdfx-test-harness || true
	docker system prune -f

# Help
help:
	@echo "PDFX Test Harness - Available Commands"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make docker-build         Build Docker image"
	@echo "  make docker-run           Run with default test document"
	@echo "  make docker-kitchen-sink  Run kitchen-sink feature test"
	@echo "  make docker-run-custom    Run with custom input (INPUT=/path OUTPUT=/path)"
	@echo "  make docker-shell         Interactive shell in container"
	@echo "  make compose-up           Run with docker-compose"
	@echo "  make compose-shell        Interactive shell via compose"
	@echo ""
	@echo "Local Commands (requires bun + system deps):"
	@echo "  make install              Install npm dependencies"
	@echo "  make test                 Run full test pipeline"
	@echo "  make kitchen-sink         Run kitchen-sink example locally"
	@echo "  make build-pagedjs        Build PDF with PagedJS"
	@echo "  make build-vivliostyle    Build PDF with Vivliostyle"
	@echo "  make convert              Convert PDFs to PDF/X"
	@echo "  make validate             Validate PDF files"
	@echo "  make compare              Generate comparison report"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean                Remove generated files"
	@echo "  make clean-docker         Remove Docker image and prune"
	@echo ""
	@echo "Examples:"
	@echo "  make docker-run"
	@echo "  make docker-kitchen-sink"
	@echo "  make docker-run-custom INPUT=./my-books OUTPUT=./results"
	@echo "  INPUT_DIR=./books OUTPUT_DIR=./out make compose-up"
