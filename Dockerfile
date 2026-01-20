# PDFX Test Harness Docker Image
# Compares PagedJS and Vivliostyle for DriveThruRPG-compliant PDF/X generation

FROM oven/bun:1-debian AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Ghostscript for PDF/X conversion
    ghostscript \
    # Poppler utils for PDF analysis
    poppler-utils \
    # ImageMagick for visual comparison
    imagemagick \
    # Chromium dependencies for PagedJS and Vivliostyle
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    # Additional utilities
    curl \
    ca-certificates \
    # Clean up
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Configure ImageMagick policy to allow PDF operations
RUN sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' /etc/ImageMagick-6/policy.xml || true

# Set Chromium environment for Puppeteer/Playwright
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_BIN=/usr/bin/chromium \
    CHROMIUM_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lockb* ./

# Install npm dependencies
RUN bun install

# Copy application files
COPY . .

# Create directories for input/output
RUN mkdir -p /input /output /app/output /app/reports

# Make scripts executable
RUN chmod +x run.sh scripts/*.ts

# Default environment variables
ENV INPUT_DIR=/input \
    OUTPUT_DIR=/output \
    SKIP_PAGEDJS=false \
    SKIP_VIVLIOSTYLE=false \
    SKIP_CONVERT=false \
    SKIP_COMPARE=false

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun --version && gs --version && pdfinfo -v || exit 1

# Entry point script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]

# Default command runs the test pipeline
CMD ["run"]
