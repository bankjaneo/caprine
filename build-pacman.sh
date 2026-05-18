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

	# Check if required dist folder exists
	if [ ! -d "$DIST_DIR" ]; then
		echo "Error: Required dist folder not found: $DIST_DIR"
		echo "Please run 'npm run dist:linux' or 'npm run dist:linux -- --$ARCH' first."
		exit 1
	fi

	echo "Building Caprine ${VERSION} for ${ARCH}..."

	# Create build directory
	BUILD_DIR="/tmp/caprine-pacman-${ARCH}"
	rm -rf "$BUILD_DIR"
	mkdir -p "$BUILD_DIR"

	# Copy PKGBUILD and install script
	cp "$PROJECT_DIR/packages/pacman/PKGBUILD" "$BUILD_DIR/"
	cp "$PROJECT_DIR/packages/pacman/caprine.install" "$BUILD_DIR/"

	# Update PKGBUILD with version
	sed -i "s/pkgver=\"2.61.22\"/pkgver=\"${VERSION}\"/" "$BUILD_DIR/PKGBUILD"

	# Copy source directory (only needed files)
	mkdir -p "$BUILD_DIR/src"
	rsync -a --exclude='node_modules' --exclude='.git' "$PROJECT_DIR/" "$BUILD_DIR/src/caprine-${VERSION}/"

	# Build package
	cd "$BUILD_DIR"
	makepkg -f --noconfirm --nodeps

	# Copy artifact to dist
	cp "$BUILD_DIR"/caprine-*.pkg.tar.zst "$PROJECT_DIR/dist/"

	echo "✓ Built: caprine-${VERSION}-${ARCH}.pkg.tar.zst"
}

# Build pacman package(s) for specified architecture/ies
for arch in "${ARCHS[@]}"; do
	build_pacman "$arch"
done
