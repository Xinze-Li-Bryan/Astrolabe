#!/bin/bash
# Build the Python backend as a standalone executable using PyInstaller
# This script should be run before building the Tauri app

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"
BINARIES_DIR="$PROJECT_DIR/src-tauri/binaries"

echo "Building Astrolabe backend..."
echo "Backend dir: $BACKEND_DIR"
echo "Output dir: $BINARIES_DIR"

# Detect target triple
get_target_triple() {
    local os=$(uname -s)
    local arch=$(uname -m)

    case "$os" in
        Darwin)
            case "$arch" in
                x86_64) echo "x86_64-apple-darwin" ;;
                arm64) echo "aarch64-apple-darwin" ;;
                *) echo "unknown-apple-darwin" ;;
            esac
            ;;
        Linux)
            case "$arch" in
                x86_64) echo "x86_64-unknown-linux-gnu" ;;
                aarch64) echo "aarch64-unknown-linux-gnu" ;;
                *) echo "unknown-unknown-linux-gnu" ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            case "$arch" in
                x86_64) echo "x86_64-pc-windows-msvc" ;;
                *) echo "unknown-pc-windows-msvc" ;;
            esac
            ;;
        *)
            echo "unknown-unknown-unknown"
            ;;
    esac
}

TARGET_TRIPLE=$(get_target_triple)
echo "Target triple: $TARGET_TRIPLE"

# Create binaries directory
mkdir -p "$BINARIES_DIR"

# Install PyInstaller if not present
if ! python3 -c "import PyInstaller" 2>/dev/null; then
    echo "Installing PyInstaller..."
    pip3 install pyinstaller
fi

# Build with PyInstaller
cd "$BACKEND_DIR"
echo "Running PyInstaller..."
python3 -m PyInstaller --clean --noconfirm astrolabe-server.spec

# Copy the binary with target triple suffix
DIST_BINARY="$BACKEND_DIR/dist/astrolabe-server"
if [[ "$os" == MINGW* ]] || [[ "$os" == MSYS* ]] || [[ "$os" == CYGWIN* ]]; then
    DIST_BINARY="$BACKEND_DIR/dist/astrolabe-server.exe"
    OUTPUT_BINARY="$BINARIES_DIR/astrolabe-server-$TARGET_TRIPLE.exe"
else
    OUTPUT_BINARY="$BINARIES_DIR/astrolabe-server-$TARGET_TRIPLE"
fi

if [ -f "$DIST_BINARY" ]; then
    cp "$DIST_BINARY" "$OUTPUT_BINARY"
    chmod +x "$OUTPUT_BINARY"
    echo "Backend binary copied to: $OUTPUT_BINARY"
    echo "Binary size: $(du -h "$OUTPUT_BINARY" | cut -f1)"
else
    echo "Error: Binary not found at $DIST_BINARY"
    exit 1
fi

echo "Backend build complete!"
