#!/bin/bash
set -e

cd packages/pacman

# Install mksrcinfo if not present
if ! command -v mksrcinfo &> /dev/null; then
    echo "Installing mksrcinfo..."
    sudo pacman -S --noconfirm mksrcinfo
fi

# Generate .SRCINFO
mksrcinfo PKGBUILD -o .SRCINFO

echo "✓ Generated .SRCINFO"
