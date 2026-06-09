#!/bin/bash
# gstack setup for Clawdi CVM (Linux)
# Installs Bun, builds the browse binary, and installs Playwright + Chromium

set -e

GSTACK_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Setting up gstack at $GSTACK_DIR..."

# 1. Install Bun if not present
if ! command -v bun &>/dev/null; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

# 2. Install dependencies
echo "Installing dependencies..."
cd "$GSTACK_DIR"
bun install --production

# 3. Build the browse binary
echo "Building browse binary..."
bun build --compile browse/src/cli.ts --outfile browse/dist/browse
bun build --compile browse/src/find-browse.ts --outfile browse/dist/find-browse

# 4. Build Node.js server fallback
if [ -f browse/scripts/build-node-server.sh ]; then
  bash browse/scripts/build-node-server.sh
fi

# 5. Install Playwright Chromium
echo "Installing Playwright Chromium..."
bunx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium --with-deps 2>/dev/null || true

# 6. Make bin scripts executable
chmod +x bin/* 2>/dev/null || true
chmod +x browse/dist/* 2>/dev/null || true

# 7. Create gstack config dir
mkdir -p ~/.gstack/sessions ~/.gstack/analytics

echo "gstack setup complete!"
echo "Browse binary: $GSTACK_DIR/browse/dist/browse"
echo "Available skills: $(ls -d */SKILL.md 2>/dev/null | sed 's|/SKILL.md||' | tr '\n' ', ')"
