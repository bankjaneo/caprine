#!/bin/bash
set -e

cd packages/pacman

# Generate .SRCINFO using makepkg's built-in functionality
# Note: makepkg --printsrcinfo is the standard Arch Linux way to generate .SRCINFO
# It's built into makepkg (part of pacman) and doesn't require additional packages
makepkg --printsrcinfo > .SRCINFO

echo "✓ Generated .SRCINFO"
