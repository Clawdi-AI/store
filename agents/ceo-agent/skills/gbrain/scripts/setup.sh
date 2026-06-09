#!/bin/bash
# GBrain setup script for CEO agent
# Run once to initialize the shared brain

set -e

echo "Installing gbrain..."
npm install -g gbrain 2>/dev/null || bun install -g gbrain

echo "Initializing brain repo..."
mkdir -p /root/brain
cd /root/brain

if [ ! -f index.md ]; then
  gbrain init 2>/dev/null || true
fi

# Configure mcporter for MCP access
command -v mcporter >/dev/null && {
  mcporter config add gbrain --transport stdio --command "gbrain serve" 2>/dev/null || true
  echo "mcporter: gbrain MCP server configured"
}

# Import workspace docs if they exist
for ws in /root/.openclaw/workspace /root/.openclaw/workspace-*/; do
  if [ -d "$ws" ]; then
    name=$(basename "$ws")
    echo "Importing $name..."
    gbrain import "$ws" --no-embed 2>/dev/null || true
  fi
done

# Embed all
echo "Embedding..."
gbrain embed --stale 2>/dev/null || true

echo "GBrain setup complete"
gbrain doctor --json 2>/dev/null | head -3
