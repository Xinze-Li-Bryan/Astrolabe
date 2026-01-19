#!/bin/bash
# Build Astrolabe as a standalone desktop application
# This script handles the full release build process

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TAURI_DIR="$PROJECT_DIR/src-tauri"

echo "=========================================="
echo "Building Astrolabe Release"
echo "=========================================="

# Step 1: Build the Python backend as standalone binary
echo ""
echo "[1/4] Building Python backend..."
"$SCRIPT_DIR/build-backend.sh"

# Step 2: Update tauri.conf.json to include externalBin
echo ""
echo "[2/4] Configuring Tauri for release build..."

TAURI_CONF="$TAURI_DIR/tauri.conf.json"
TAURI_CONF_BACKUP="$TAURI_DIR/tauri.conf.json.dev-backup"

# Backup current config
cp "$TAURI_CONF" "$TAURI_CONF_BACKUP"

# Add externalBin configuration using node
node -e "
const fs = require('fs');
const conf = JSON.parse(fs.readFileSync('$TAURI_CONF', 'utf8'));
conf.bundle.externalBin = ['binaries/astrolabe-server'];
fs.writeFileSync('$TAURI_CONF', JSON.stringify(conf, null, 2));
console.log('  Added externalBin to tauri.conf.json');
"

# Step 3: Update capabilities to include sidecar permission
echo ""
echo "[3/4] Updating capabilities..."

CAPABILITIES="$TAURI_DIR/capabilities/default.json"
CAPABILITIES_BACKUP="$TAURI_DIR/capabilities/default.json.dev-backup"

# Backup current capabilities
cp "$CAPABILITIES" "$CAPABILITIES_BACKUP"

# Add sidecar permission using node
node -e "
const fs = require('fs');
const cap = JSON.parse(fs.readFileSync('$CAPABILITIES', 'utf8'));

// Find shell:allow-spawn permission and add sidecar
for (let i = 0; i < cap.permissions.length; i++) {
  const perm = cap.permissions[i];
  if (typeof perm === 'object' && perm.identifier === 'shell:allow-spawn') {
    // Check if sidecar already exists
    const hasSidecar = perm.allow.some(a => a.name === 'astrolabe-server');
    if (!hasSidecar) {
      perm.allow.push({ name: 'astrolabe-server', sidecar: true });
      console.log('  Added sidecar permission to capabilities');
    } else {
      console.log('  Sidecar permission already exists');
    }
    break;
  }
}

fs.writeFileSync('$CAPABILITIES', JSON.stringify(cap, null, 2));
"

# Step 4: Build Tauri application
echo ""
echo "[4/4] Building Tauri application..."
cd "$PROJECT_DIR"
npm run tauri build

# Restore dev configuration
echo ""
echo "Restoring dev configuration..."
mv "$TAURI_CONF_BACKUP" "$TAURI_CONF"
mv "$CAPABILITIES_BACKUP" "$CAPABILITIES"

echo ""
echo "=========================================="
echo "Build complete!"
echo "=========================================="
echo ""
echo "Output location:"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  $TAURI_DIR/target/release/bundle/dmg/"
    echo "  $TAURI_DIR/target/release/bundle/macos/"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "  $TAURI_DIR/target/release/bundle/msi/"
    echo "  $TAURI_DIR/target/release/bundle/nsis/"
else
    echo "  $TAURI_DIR/target/release/bundle/deb/"
    echo "  $TAURI_DIR/target/release/bundle/appimage/"
fi
