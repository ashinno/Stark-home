#!/usr/bin/env bash
# update-cask.sh — rewrite Casks/stark.rb to match a fresh GitHub Release.
#
# Usage:
#   scripts/update-cask.sh 0.1.0
#
# What it does:
#   1. Downloads the two DMGs from
#      https://github.com/ashinno/Stark-home/releases/download/v<version>/
#      (arm64 and x64).
#   2. Computes their sha256.
#   3. Writes a per-arch cask to Casks/stark.rb.
#
# Assumes you already ran `gh release create v<version> dist/*.dmg`.

set -euo pipefail

VERSION="${1:?usage: scripts/update-cask.sh <version>}"
REPO="ashinno/Stark-home"
BASE="https://github.com/${REPO}/releases/download/v${VERSION}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[update-cask] fetching v${VERSION} DMGs…"
curl -fsSL -o "$TMP/arm64.dmg" "${BASE}/Stark-${VERSION}-arm64.dmg"
curl -fsSL -o "$TMP/x64.dmg"   "${BASE}/Stark-${VERSION}-x64.dmg"

ARM_SHA="$(shasum -a 256 "$TMP/arm64.dmg" | awk '{print $1}')"
X64_SHA="$(shasum -a 256 "$TMP/x64.dmg"   | awk '{print $1}')"

echo "[update-cask] arm64 sha256 = $ARM_SHA"
echo "[update-cask] x64   sha256 = $X64_SHA"

CASK_PATH="$(cd "$(dirname "$0")/.." && pwd)/Casks/stark.rb"
cat > "$CASK_PATH" <<RUBY
cask "stark" do
  version "${VERSION}"

  arch arm: "arm64", intel: "x64"

  on_arm do
    sha256 "${ARM_SHA}"
  end
  on_intel do
    sha256 "${X64_SHA}"
  end

  url "https://github.com/${REPO}/releases/download/v#{version}/Stark-#{version}-#{arch}.dmg",
      verified: "github.com/${REPO}/"
  name "Stark"
  desc "Native Mac control center for Hermes Agent"
  homepage "https://github.com/${REPO}"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :big_sur"

  app "Stark.app"

  zap trash: [
    "~/Library/Application Support/stark",
    "~/Library/Application Support/Stark",
    "~/Library/Preferences/com.stark.app.plist",
    "~/Library/Saved Application State/com.stark.app.savedState",
    "~/Library/Caches/com.stark.app",
    "~/Library/Logs/Stark",
  ]

  caveats <<~EOS
    Stark drives your local Hermes Agent install.

    If you don't have Hermes installed yet, Stark will detect this on first
    launch and offer to install it for you (running the upstream installer
    into ~/.hermes/). You can also install it manually:

      curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash

    The engine lives at ~/.hermes/ and can be updated independently of Stark.
  EOS
end
RUBY

echo "[update-cask] wrote $CASK_PATH"
echo
echo "Next:"
echo "  cp '$CASK_PATH' ../homebrew-stark/Casks/stark.rb"
echo "  (cd ../homebrew-stark && git commit -am 'stark ${VERSION}' && git push)"
