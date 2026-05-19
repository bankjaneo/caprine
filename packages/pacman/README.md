# Caprine Arch Linux Package

This directory contains the Arch Linux package files for Caprine.

## Building the Package

### Prerequisites

- Arch Linux or Arch-based distribution (x86_64 or aarch64)
- `base-devel` package group
- Node.js and npm
- Git
- sudo access (makepkg cannot run as root)
- Desktop environment (GTK3 dependencies)

### Install Dependencies

```bash
sudo pacman -S --needed base-devel nodejs npm git
```

> **Important:** The build script must be run as a regular user (not root). makepkg will refuse to run as root for security reasons.

### Build Instructions

1. Clone or navigate to the Caprine source directory:
   ```bash
   cd caprine
   ```

2. Install Node.js dependencies:
   ```bash
   npm ci
   ```

3. Build the Electron app:
   ```bash
   npm run build
   ```

4. Build the pacman package:
   ```bash
   bash build-pacman.sh
   ```

   Or for a specific architecture:
   ```bash
   bash build-pacman.sh --x86_64  # or --aarch64
   ```

5. The package will be created in the `dist/` directory:
   ```bash
   ls -lh dist/*.pkg.tar.zst
   ```

### Building for Specific Architecture

```bash
# Build for x86_64 only
bash build-pacman.sh --x86_64

# Build for aarch64 only
bash build-pacman.sh --aarch64

# Build for both architectures (default)
bash build-pacman.sh
```

## Installation

After building, install the package:

```bash
sudo pacman -U dist/caprine-*.pkg.tar.zst
```

## AUR Submission

This package is designed for local building via `build-pacman.sh`. For AUR submission, a self-contained `PKGBUILD` with proper `source` array and build functions would be required.

## Package Structure

- `/usr/lib/caprine/` - Application files
- `/usr/share/icons/hicolor/*/apps/caprine.png` - Application icons
- `/usr/share/applications/caprine.desktop` - Desktop entry
- `/usr/share/licenses/caprine/LICENSE` - License file
- `/usr/bin/caprine` - Executable symlink

## Dependencies

### Required

- `gtk3` - GUI toolkit
- `libnotify` - Desktop notifications
- `nss` - Network Security Services
- `libxss` - X11 Screen Saver extension
- `libxtst` - X11 Testing extension
- `xdg-utils` - Desktop integration utilities
- `at-spi2-core` - Assistive Technology Service Provider
- `alsa-lib` - Audio support
- `libsecret` - Secret storage API

### Optional

- `gnome-keyring` - Password management for GNOME
- `kwallet` - Password management for KDE

## Maintenance

### Updating the Package Version

1. Update `pkgver` in `PKGBUILD`
2. Update `sha256sums` if source URL changes
3. Regenerate `.SRCINFO`:
   ```bash
   bash generate-srcinfo.sh
   ```
4. Commit changes and push to AUR

### Testing

Test the package in a clean environment:

```bash
# Test installation
docker run --rm -v $PWD:/pkg archlinux:base-devel bash -c '
    cd /pkg
    pacman -U --noconfirm caprine-*.pkg.tar.zst
    caprine --version
'
```

## Troubleshooting

### Build fails with "npm not found"

Ensure Node.js and npm are installed:
```bash
sudo pacman -S nodejs npm
```

### Icons not showing

Rebuild icon cache:
```bash
sudo gtk-update-icon-cache -qtf /usr/share/icons/hicolor
```

### Desktop entry not appearing

Update desktop database:
```bash
sudo update-desktop-database
```

## License

MIT License - see the [LICENSE](../../LICENSE) file for details.
