#!/bin/bash
set -e

cd packages/pacman

# Sync version from package.json
VERSION=$(node -p "require('../../package.json').version")
sed -i "s/^pkgver=.*/pkgver=\"${VERSION}\"/" PKGBUILD

# Generate .SRCINFO using makepkg's built-in functionality
# Note: makepkg --printsrcinfo is the standard Arch Linux way to generate .SRCINFO
# It's built into makepkg (part of pacman) and doesn't require additional packages
makepkg --printsrcinfo > .SRCINFO

echo "✓ Generated .SRCINFO"
