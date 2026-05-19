#!/bin/bash
set -e

# Parse architecture argument
# Default: build both x86_64 and aarch64
# Single arch: --x86_64, x86_64, --aarch64, or aarch64
case "${1:-}" in
	--x86_64|x86_64)
		ARCHS=("x86_64")
		;;
	--aarch64|aarch64)
		ARCHS=("aarch64")
		;;
	--all|"")
		ARCHS=("x86_64" "aarch64")
		;;
	*)
		echo "Error: Unknown architecture '$1'. Use --x86_64, --aarch64, or omit for both."
		exit 1
		;;
esac

# Check if running as root (makepkg cannot run as root)
if [ "$EUID" -eq 0 ]; then
	echo "Error: This script cannot be run as root."
	echo "Please run as a regular user with sudo access."
	exit 1
fi

# Check for required tools
for cmd in node npm git makepkg; do
	if ! command -v "$cmd" &> /dev/null; then
		echo "Error: $cmd is not installed."
		echo "Please install required dependencies:"
		echo "  sudo pacman -S --needed base-devel nodejs npm git"
		exit 1
	fi
done

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

VERSION=$(node -p "require('$PROJECT_DIR/package.json').version")

# Function to build pacman package for a specific architecture
build_pacman() {
	local ARCH=$1
	local DIST_DIR

	if [ "$ARCH" = "aarch64" ]; then
		DIST_DIR="$PROJECT_DIR/dist/linux-arm64-unpacked"
		TARGET_ARCH="aarch64"
	else
		DIST_DIR="$PROJECT_DIR/dist/linux-unpacked"
		TARGET_ARCH="x86_64"
	fi

	# Convert architecture name for electron-builder
	if [ "$ARCH" = "aarch64" ]; then
		ELECTRON_ARCH="arm64"
	else
		ELECTRON_ARCH="x64"
	fi

	# Check if required dist folder exists
	if [ ! -d "$DIST_DIR" ]; then
		echo "Error: Required dist folder not found: $DIST_DIR"
		echo ""
		echo "Please run these commands first:"
		echo "  npm ci"
		echo "  npm run build"
		echo "  npm run dist:linux -- --${ELECTRON_ARCH}"
		echo ""
		echo "Then run this script again."
		exit 1
	fi

	echo "Building Caprine ${VERSION} for ${ARCH}..."

	# Create build directory with automatic cleanup
	local BUILD_DIR
	BUILD_DIR=$(mktemp -d -t caprine-pacman-${ARCH}.XXXXXX)
	trap 'rm -rf "$BUILD_DIR"' EXIT

	# Copy PKGBUILD
	cp "$PROJECT_DIR/packages/pacman/PKGBUILD" "$BUILD_DIR/"

	# Update PKGBUILD with version
	sed -i "s/^pkgver=.*/pkgver=\"${VERSION}\"/" "$BUILD_DIR/PKGBUILD"

	# Copy only required files to source directory
	mkdir -p "$BUILD_DIR/src/caprine-${VERSION}/dist"
	cp -a "$DIST_DIR" "$BUILD_DIR/src/caprine-${VERSION}/dist/"
	mkdir -p "$BUILD_DIR/src/caprine-${VERSION}/build"
	cp -a "$PROJECT_DIR/build/icons" "$BUILD_DIR/src/caprine-${VERSION}/build/"
	cp -a "$PROJECT_DIR/license" "$BUILD_DIR/src/caprine-${VERSION}/"
	mkdir -p "$BUILD_DIR/src/caprine-${VERSION}/packages/pacman"
	cp -a "$PROJECT_DIR/packages/pacman/caprine.desktop" "$BUILD_DIR/src/caprine-${VERSION}/packages/pacman/"

	# Build package
	cd "$BUILD_DIR"
	
	# Set CARCH for makepkg
	export CARCH="$ARCH"
	makepkg -f --noconfirm -s

	# Copy artifact to dist
	cp "$BUILD_DIR"/caprine-*.pkg.tar.zst "$PROJECT_DIR/dist/"

	# Cleanup build directory
	cd "$PROJECT_DIR"
	rm -rf "$BUILD_DIR"
	trap - EXIT

	echo "✓ Built: caprine-${VERSION}-${ARCH}.pkg.tar.zst"
}

# Build pacman package(s) for specified architecture/ies
for arch in "${ARCHS[@]}"; do
	build_pacman "$arch"
done
