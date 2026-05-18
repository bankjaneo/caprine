# Implementation Plan: Arch Linux (.pacman) Distribution Support

## Goal
Add native Arch Linux package (.pkg.tar.zst) distribution support to Caprine with both local build scripts and GitHub CI integration, following Arch packaging standards and AUR submission requirements.

## Tasks

### Phase 1: Create PKGBUILD Template
**File:** `packages/pacman/PKGBUILD`

**Changes:**
- Create PKGBUILD following Arch Linux standards for Electron applications
- Install application to `/usr/lib/caprine/` (consistent with RPM build pattern)
- Include all required dependencies from RPM spec (with correct naming)
- Support both x86_64 and aarch64 architectures
- Build from unpacked dist directory (matching build-rpm.sh pattern)

**Key sections:**
```bash
pkgname="caprine"
pkgver="2.61.22"  # Will be replaced dynamically in build script
pkgrel="1"
pkgdesc="Elegant Facebook Messenger desktop app"
arch=("x86_64" "aarch64")
url="https://github.com/sindresorhus/caprine"
license=("MIT")
depends=("gtk3" "libnotify" "nss" "libXScrnSaver" "libXtst" "xdg-utils" "at-spi2-core" "alsa-lib" "libsecret")
optdepends=("gnome-keyring: for password management" "kwallet: for KDE password management")
install="caprine.install"
source=("$pkgname-$pkgver.tar.gz::https://github.com/sindresorhus/caprine/archive/v$pkgver.tar.gz")
sha256sums=("SKIP")  # Will be calculated in build script

prepare() {
    cd "$srcdir/$pkgname"
    npm ci --cache "$srcdir/.npm-cache"
}

build() {
    cd "$srcdir/$pkgname"
    npm run build
}

package() {
    cd "$srcdir/$pkgname"
    
    # Install app to /usr/lib/caprine/
    mkdir -p "$pkgdir/usr/lib/caprine"
    cp -r dist/linux-unpacked/* "$pkgdir/usr/lib/caprine/"
    
    # Install icons
    install -Dm644 build/icons/16x16.png "$pkgdir/usr/share/icons/hicolor/16x16/apps/caprine.png"
    install -Dm644 build/icons/32x32.png "$pkgdir/usr/share/icons/hicolor/32x32/apps/caprine.png"
    install -Dm644 build/icons/48x48.png "$pkgdir/usr/share/icons/hicolor/48x48/apps/caprine.png"
    install -Dm644 build/icons/64x64.png "$pkgdir/usr/share/icons/hicolor/64x64/apps/caprine.png"
    install -Dm644 build/icons/128x128.png "$pkgdir/usr/share/icons/hicolor/128x128/apps/caprine.png"
    install -Dm644 build/icons/256x256.png "$pkgdir/usr/share/icons/hicolor/256x256/apps/caprine.png"
    install -Dm644 build/icons/512x512.png "$pkgdir/usr/share/icons/hicolor/512x512/apps/caprine.png"
    
    # Install desktop file
    install -Dm644 packages/rpm/caprine.desktop "$pkgdir/usr/share/applications/caprine.desktop"
    
    # Install license file
    install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
    
    # Create symlink in /usr/bin/
    ln -sf /usr/lib/caprine/caprine "$pkgdir/usr/bin/caprine"
}
```

**Acceptance:** PKGBUILD follows Arch Packaging Standards, installs all required files, supports both architectures

---

### Phase 2: Create Install Hook Script
**File:** `packages/pacman/caprine.install`

**Changes:**
- Create install script with post_install, post_upgrade, and post_remove hooks
- Update desktop database and icon cache
- Follow patterns from RPM .spec file

**Content:**
```bash
post_install() {
    update-desktop-database &>/dev/null
    gtk-update-icon-cache -qtf /usr/share/icons/hicolor &>/dev/null
}

post_upgrade() {
    post_install
}

post_remove() {
    update-desktop-database &>/dev/null
    gtk-update-icon-cache -qtf /usr/share/icons/hicolor &>/dev/null
}
```

**Acceptance:** Script handles install, upgrade, and remove hooks properly

---

### Phase 3: Create Build Script
**File:** `build-pacman.sh`

**Changes:**
- Create bash script following build-rpm.sh pattern (build from unpacked dist)
- Support both x86_64 and aarch64 architectures
- First build unpacked dist using electron-builder
- Generate PKGBUILD dynamically with correct version
- Calculate SHA256 checksums for source tarball
- Build package using makepkg in clean chroot
- Output .pkg.tar.zst artifacts

**Key sections:**
```bash
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
    
    # Calculate SHA256 for source tarball
    SOURCE_URL="https://github.com/sindresorhus/caprine/archive/v${VERSION}.tar.gz"
    curl -sL "$SOURCE_URL" -o "$BUILD_DIR/caprine-${VERSION}.tar.gz"
    SHA256=$(sha256sum "$BUILD_DIR/caprine-${VERSION}.tar.gz" | awk '{print $1}')
    sed -i "s/sha256sums=(\"SKIP\")/sha256sums=(\"${SHA256}\")/" "$BUILD_DIR/PKGBUILD"
    
    # Build package
    cd "$BUILD_DIR"
    makepkg -f --noconfirm --syncdeps
    
    # Copy artifact to dist
    cp "$BUILD_DIR"/caprine-*.pkg.tar.zst "$PROJECT_DIR/dist/"
    
    echo "✓ Built: caprine-${VERSION}-${ARCH}.pkg.tar.zst"
}

# Build pacman package(s) for specified architecture/ies
for arch in "${ARCHS[@]}"; do
    build_pacman "$arch"
done
```

**Acceptance:** Script builds .pkg.tar.zst packages for both architectures, calculates checksums correctly

---

### Phase 4: Update package.json
**File:** `package.json`

**Changes:**
- Add build-pacman.sh to npm scripts (electron-builder doesn't support pacman target natively)
- No changes to electron-builder config needed (PKGBUILD uses unpacked dist output)

**Modifications:**
```json
{
  "scripts": {
    "dist:pacman": "bash build-pacman.sh"
  }
}
```

**Acceptance:** npm script runs build successfully

---

### Phase 5: Integrate into GitHub Actions Workflow
**File:** `.github/workflows/build.yml`

**Changes:**
- Integrate pacman build into existing build.yml (not separate workflow)
- Add pacman build job to matrix strategy
- Match existing workflow patterns (Node.js 24, triggers, etc.)
- Build for both x86_64 and aarch64
- Upload artifacts to GitHub Releases
- Test package installation in clean Arch environment

**Content to add to build.yml:**
```yaml
# Add to matrix.os in build job:
# - archlinux-latest (using Docker runner or self-hosted)

# Add new job for pacman builds:
build-pacman:
  runs-on: ubuntu-latest
  needs: [tests]
  strategy:
    matrix:
      arch: [x86_64, aarch64]
  
  steps:
    - uses: actions/checkout@v5
    
    - name: Setup Node.js
      uses: actions/setup-node@v5
      with:
        node-version: '24'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build unpacked dist
      run: npm run dist:linux -- --dir
    
    - name: Install Arch tools
      run: |
        sudo pacman -Sy --noconfirm archlinux-keyring
        sudo pacman -S --noconfirm base-devel devtools
    
    - name: Build pacman package
      run: |
        bash build-pacman.sh ${{ matrix.arch }}
    
    - name: Test package installation
      run: |
        docker run --rm -v $PWD:/pkg archlinux:base-devel bash -c '
          cd /pkg
          pacman -U --noconfirm caprine-*.pkg.tar.zst
          caprine --version
        '
    
    - name: Upload artifact
      uses: actions/upload-artifact@v4
      with:
        name: caprine-pacman-${{ matrix.arch }}
        path: dist/*.pkg.tar.zst
    
    - name: Upload to Release
      uses: softprops/action-gh-release@v1
      if: startsWith(github.ref, 'refs/tags/')
      with:
        files: dist/*.pkg.tar.zst
```

**Acceptance:** Workflow integrates with existing CI/CD, builds packages, uploads artifacts

---

### Phase 6: Create .SRCINFO Generator
**File:** `packages/pacman/generate-srcinfo.sh`

**Changes:**
- Create script to generate .SRCINFO file for AUR submission
- Parse PKGBUILD and create proper metadata
- Run before AUR submission

**Content:**
```bash
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
```

**Acceptance:** Script generates valid .SRCINFO file for AUR

---

### Phase 7: Update Documentation
**File:** `README.md`

**Changes:**
- Add Arch Linux installation instructions
- Document both official repo and AUR installation methods
- Add build instructions for local development

**Section to add:**
```markdown
## Arch Linux

### Installation

```bash
# Install from official repositories (coming soon)
sudo pacman -S caprine

# Or install from AUR
yay -S caprine
```

### Building from source

```bash
git clone https://github.com/sindresorhus/caprine
cd caprine
bash build-pacman.sh
sudo pacman -U dist/caprine-*.pkg.tar.zst
```
```

**File:** `packages/pacman/README.md`

**Changes:**
- Create documentation for Arch package maintenance
- Include troubleshooting guide
- Document AUR submission process

**Acceptance:** Documentation is clear and complete

---

### Phase 8: Testing Strategy

**Test 1: Local Build Test**
```bash
# Test on Arch Linux VM or container
docker run -it archlinux:base-devel bash
# Inside container:
pacman -Sy --noconfirm base-devel
# Mount source and run build script
bash build-pacman.sh
# Verify package creation
ls -la dist/*.pkg.tar.zst
```

**Test 2: Installation Test**
```bash
# Test installation in clean environment
docker run -it archlinux:base-devel bash
pacman -Sy --noconfirm
pacman -U /path/to/caprine-*.pkg.tar.zst
caprine --version
# Verify files installed correctly
ls -la /opt/Caprine/
ls -la /usr/share/applications/caprine.desktop
ls -la /usr/bin/caprine
```

**Test 3: Uninstallation Test**
```bash
# Test clean removal
pacman -Rns caprine
# Verify all files removed
test ! -d /opt/Caprine && echo "✓ Removed"
```

**Test 4: AUR Validation**
```bash
# Run AUR linting
namcap PKGBUILD
namcap caprine-*.pkg.tar.zst
```

**Acceptance:** All tests pass, package installs/uninstalls cleanly

---

## Files to Modify

1. **`packages/pacman/PKGBUILD`** (NEW) - Arch package build definition
2. **`packages/pacman/caprine.install`** (NEW) - Install hooks script
3. **`packages/pacman/generate-srcinfo.sh`** (NEW) - AUR metadata generator
4. **`packages/pacman/README.md`** (NEW) - Arch package documentation
5. **`build-pacman.sh`** (NEW) - Main build script (follows build-rpm.sh pattern)
6. **`package.json`** (MODIFY) - Add dist:pacman npm script
7. **`.github/workflows/build.yml`** (MODIFY) - Integrate pacman build into existing workflow
8. **`README.md`** (MODIFY) - Add Arch Linux installation instructions

---

## Dependencies

**Task Dependencies:**
- Phase 1 (PKGBUILD) must complete before Phase 3 (build script)
- Phase 2 (install script) must complete before Phase 3 (build script)
- Phase 3 (build script) must complete before Phase 5 (GitHub workflow)
- Phase 6 (SRCINFO) can run in parallel with Phase 5
- All phases must complete before Phase 8 (testing)

**External Dependencies:**
- Arch Linux build tools (base-devel, devtools)
- makepkg utility
- Docker for testing (optional but recommended)
- AUR account for submission (optional)

---

## Risks

### High Priority

1. **electron-builder pacman target support**
   - Risk: electron-builder may not have native pacman target
   - Mitigation: Use custom PKGBUILD that references GitHub release instead of electron-builder target
   - Fallback: Use `--linux dir` output and custom PKGBUILD (as documented in research)

2. **Version synchronization**
   - Risk: PKGBUILD version must match GitHub release version
   - Mitigation: Dynamic version replacement in build-pacman.sh script
   - Verification: Add version check in build script

### Medium Priority

3. **Architecture support**
   - Risk: arm64/aarch64 builds may have different dependencies
   - Mitigation: Test both architectures in Docker
   - Verification: Run installation tests on both x86_64 and aarch64

4. **Icon installation paths**
   - Risk: Icon sizes may not match Arch standards
   - Mitigation: Follow existing RPM icon installation pattern
   - Verification: Test desktop integration in clean environment

### Low Priority

5. **AUR submission requirements**
   - Risk: Package may not meet AUR quality standards
   - Mitigation: Run namcap validation, follow Arch Packaging Standards
   - Verification: Review AUR submission guidelines

6. **Post-install hooks**
   - Risk: Desktop database or icon cache updates may fail
   - Mitigation: Use `&>/dev/null` to suppress non-critical errors
   - Verification: Test in clean Arch environment

---

## Estimated Complexity

| Task | Complexity | Time Estimate |
|------|-----------|---------------|
| Phase 1: PKGBUILD | Medium | 2-3 hours |
| Phase 2: Install script | Low | 1 hour |
| Phase 3: Build script | Medium | 3-4 hours |
| Phase 4: package.json | Low | 30 min |
| Phase 5: GitHub workflow integration | Medium | 3-4 hours |
| Phase 6: SRCINFO generator | Low | 1 hour |
| Phase 7: Documentation | Low | 2 hours |
| Phase 8: Testing | High | 4-6 hours |

**Total Estimated Time:** 15-21 hours

---

## Success Criteria

1. ✅ PKGBUILD builds successfully on Arch Linux
2. ✅ Package installs to correct locations (/usr/lib/caprine/, /usr/share/icons/, /usr/bin/)
3. ✅ Desktop entry and icons work correctly
4. ✅ Both x86_64 and aarch64 architectures supported
5. ✅ GitHub workflow builds and uploads artifacts
6. ✅ Package passes namcap validation
7. ✅ Clean uninstallation (no orphaned files)
8. ✅ Documentation is complete and accurate
9. ✅ Follows existing build-rpm.sh patterns for consistency

---

## Next Steps

1. **Immediate:** Review this plan with team for feedback
2. **Phase 1-3:** Create core packaging files (PKGBUILD, install script, build script)
3. **Phase 4-5:** Integrate with existing build system and CI
4. **Phase 6-7:** Generate AUR metadata and documentation
5. **Phase 8:** Comprehensive testing in clean environments
6. **Post-implementation:** Submit to AUR if desired

---

## Notes

- Install path `/usr/lib/caprine/` matches RPM spec file pattern (not /opt/Caprine/)
- Dependencies match RPM spec exactly (libXScrnSaver with capital S, not libxss)
- Build pattern follows build-rpm.sh: uses unpacked dist output, not tarball extraction
- Icon installation follows Arch Hierarchy Standard (more complete than existing RPM)
- Desktop file reused from RPM package at `packages/rpm/caprine.desktop`
- electron-builder has no native pacman target - PKGBUILD builds from dist output
- GitHub workflow uses Docker for testing to ensure clean environment
- AUR submission optional but recommended for community access
- Architecture naming uses `aarch64` (not `arm64`) for Arch package conventions
