#!/bin/bash
set -e

# Parse architecture argument
# Default: build both x86_64 and arm64
# Single arch: --x86_64, x86_64, --arm64, or arm64
case "${1:-}" in
	--x86_64|x86_64)
		ARCHS=("x86_64")
		;;
	--arm64|arm64)
		ARCHS=("arm64")
		;;
	--all|"")
		ARCHS=("x86_64" "arm64")
		;;
	*)
		echo "Error: Unknown architecture '$1'. Use --x86_64, --arm64, or omit for both."
		exit 1
		;;
esac

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

VERSION=$(node -p "require('$PROJECT_DIR/package.json').version")
SPEC_FILE="/tmp/caprine.spec"

# Function to build RPM for a specific architecture
build_rpm() {
	local ARCH=$1
	local DIST_DIR

	if [ "$ARCH" = "arm64" ]; then
		DIST_DIR="$PROJECT_DIR/dist/linux-arm64-unpacked"
		TARGET_ARCH="aarch64"
	else
		DIST_DIR="$PROJECT_DIR/dist/linux-unpacked"
		TARGET_ARCH="$ARCH"
	fi

	# Check if required dist folder exists
	if [ ! -d "$DIST_DIR" ]; then
		echo "Error: Required dist folder not found: $DIST_DIR"
		echo "Please run 'npm run dist:linux' or 'npm run dist:linux -- --$ARCH' first."
		exit 1
	fi

	echo "Building RPM for $ARCH..."

	cat > "$SPEC_FILE" << EOF
Name:           caprine
Version:        $VERSION
Release:        1%{?dist}
Summary:        Elegant Facebook Messenger desktop app
License:        MIT
URL:            https://github.com/sindresorhus/caprine
Vendor:         Sindre Sorhus <sindresorhus@gmail.com>

Requires:       gtk3
Requires:       libnotify
Requires:       nss
Requires:       libXScrnSaver
Requires:       libXtst
Requires:       xdg-utils
Requires:       at-spi2-core
Requires:       libuuid

%description
Caprine is an unofficial and privacy focused Facebook Messenger desktop app.

%global __strip /bin/true

%prep

%build

%install
mkdir -p %{buildroot}/opt/Caprine
cp -r "$DIST_DIR"/* %{buildroot}/opt/Caprine/

mkdir -p %{buildroot}/usr/share/icons/hicolor/16x16/apps
install -m 644 "$PROJECT_DIR"/build/icons/16x16.png %{buildroot}/usr/share/icons/hicolor/16x16/apps/caprine.png

mkdir -p %{buildroot}/usr/share/icons/hicolor/32x32/apps
install -m 644 "$PROJECT_DIR"/build/icons/32x32.png %{buildroot}/usr/share/icons/hicolor/32x32/apps/caprine.png

mkdir -p %{buildroot}/usr/share/icons/hicolor/48x48/apps
install -m 644 "$PROJECT_DIR"/build/icons/48x48.png %{buildroot}/usr/share/icons/hicolor/48x48/apps/caprine.png

mkdir -p %{buildroot}/usr/share/icons/hicolor/64x64/apps
install -m 644 "$PROJECT_DIR"/build/icons/64x64.png %{buildroot}/usr/share/icons/hicolor/64x64/apps/caprine.png

mkdir -p %{buildroot}/usr/share/icons/hicolor/128x128/apps
install -m 644 "$PROJECT_DIR"/build/icons/128x128.png %{buildroot}/usr/share/icons/hicolor/128x128/apps/caprine.png

mkdir -p %{buildroot}/usr/share/icons/hicolor/256x256/apps
install -m 644 "$PROJECT_DIR"/build/icons/256x256.png %{buildroot}/usr/share/icons/hicolor/256x256/apps/caprine.png

mkdir -p %{buildroot}/usr/share/icons/hicolor/512x512/apps
install -m 644 "$PROJECT_DIR"/build/icons/512x512.png %{buildroot}/usr/share/icons/hicolor/512x512/apps/caprine.png

mkdir -p %{buildroot}/usr/share/applications
cat > %{buildroot}/usr/share/applications/caprine.desktop << 'DESKTOP_EOF'
[Desktop Entry]
Type=Application
Name=Caprine
GenericName=IM Client
Comment=Elegant Facebook Messenger desktop app
Icon=caprine
Exec=/opt/Caprine/caprine
Keywords=Messenger;Facebook;Chat;
Categories=GTK;InstantMessaging;Network;
StartupNotify=true
DESKTOP_EOF

%files
%defattr(-,root,root,-)
/opt/Caprine
/usr/share/icons/hicolor/*/apps/caprine.png
/usr/share/applications/caprine.desktop

%changelog
* $(date +'%a %b %d %Y') Builder <auto@example.com> - $VERSION-1
- Initial package build
EOF

	rpmbuild -bb "$SPEC_FILE" --target "$TARGET_ARCH"

	cp "$HOME/rpmbuild/RPMS/$TARGET_ARCH"/caprine-*.rpm "$PROJECT_DIR/dist/"
	mv "$PROJECT_DIR/dist"/caprine-*."$TARGET_ARCH".rpm "$PROJECT_DIR/dist/caprine-$VERSION-$ARCH.rpm"
	echo "RPM package built successfully: dist/caprine-$VERSION-$ARCH.rpm"
}

# Build RPM(s) for specified architecture/ies
for arch in "${ARCHS[@]}"; do
	build_rpm "$arch"
done
