#!/usr/bin/env bash
# Builds the Android APK locally and (optionally) installs it on a connected phone.
#
#   ./build-apk.sh                 release APK (JS bundled inside, runs standalone)
#   ./build-apk.sh debug           debug APK (dev client, needs Metro: `npx expo start --dev-client`)
#   ./build-apk.sh release -i      build, then adb install -r on the connected device
#   ./build-apk.sh --clean         regenerate android/ from app.config.ts first (use after changing
#                                  plugins, package id or native deps)
#
# Output: dist/PoseDirector-<variant>-<version>.apk
#
# NOTE: release APKs here are signed with the debug keystore (Expo's default), which is fine for
# sideloading/testing but NOT for the Play Store. Create an upload keystore before publishing.
set -euo pipefail

cd "$(dirname "$0")"

VARIANT="release"
INSTALL=0
CLEAN=0
for arg in "$@"; do
  case "$arg" in
    debug|release) VARIANT="$arg" ;;
    -i|--install) INSTALL=1 ;;
    --clean) CLEAN=1 ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

# --- toolchain -------------------------------------------------------------------------------
# /usr/bin/java on macOS is only a stub, so prefer Homebrew's OpenJDK 17 (what this project builds with).
if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/java" ]]; then
  for candidate in /opt/homebrew/opt/openjdk@17 /usr/local/opt/openjdk@17 /opt/homebrew/opt/openjdk@21; do
    [[ -x "$candidate/bin/java" ]] && export JAVA_HOME="$candidate" && break
  done
fi
[[ -n "${JAVA_HOME:-}" ]] || { echo "No JDK found. Install one: brew install openjdk@17" >&2; exit 1; }

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[[ -d "$ANDROID_HOME" ]] || { echo "Android SDK not found at $ANDROID_HOME (set ANDROID_HOME)" >&2; exit 1; }
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "JDK:     $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
echo "SDK:     $ANDROID_HOME"
echo "Variant: $VARIANT"

# --- native project --------------------------------------------------------------------------
[[ -d node_modules ]] || npm install
if [[ "$CLEAN" == 1 || ! -d android ]]; then
  echo "==> Generating android/ (expo prebuild)"
  npx expo prebuild --platform android --clean --no-install
fi

# --- build -----------------------------------------------------------------------------------
TASK="assemble$(tr '[:lower:]' '[:upper:]' <<<"${VARIANT:0:1}")${VARIANT:1}"
echo "==> ./gradlew $TASK"
( cd android && ./gradlew "$TASK" )

SRC="android/app/build/outputs/apk/$VARIANT/app-$VARIANT.apk"
[[ -f "$SRC" ]] || { echo "Build finished but $SRC is missing" >&2; exit 1; }

VERSION="$(node -p "require('./package.json').version")"
mkdir -p dist
OUT="dist/PoseDirector-$VARIANT-$VERSION.apk"
cp "$SRC" "$OUT"
echo "==> APK: $OUT ($(du -h "$OUT" | cut -f1))"

# --- install ---------------------------------------------------------------------------------
if [[ "$INSTALL" == 1 ]]; then
  DEVICES="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
  [[ -n "$DEVICES" ]] || { echo "No adb device connected (check USB debugging)" >&2; exit 1; }
  for d in $DEVICES; do
    echo "==> Installing on $d"
    adb -s "$d" install -r "$OUT"
  done
  [[ "$VARIANT" == debug ]] && echo "Debug build: run 'adb reverse tcp:8081 tcp:8081 && npx expo start --dev-client' to load the JS."
fi
