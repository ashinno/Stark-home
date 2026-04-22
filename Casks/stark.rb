cask "stark" do
  version "0.1.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  arch arm: "arm64", intel: "x64"

  url "https://github.com/ashinno/Stark-home/releases/download/v#{version}/Stark-#{version}-#{arch}.dmg",
      verified: "github.com/ashinno/Stark-home/"
  name "Stark"
  desc "Native Mac control center for Hermes Agent"
  homepage "https://github.com/ashinno/Stark-home"

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
