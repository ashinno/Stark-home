# Install Stark with Homebrew

> **Once published**, anyone on a Mac can install Stark with:
>
> ```bash
> brew install --cask ashinno/stark/stark
> ```
>
> That's the end-state. The rest of this document is the publish workflow —
> what the maintainer does once to make that command work, and what has to
> happen on every release.

## How it works

Homebrew ships Mac apps through **Casks**. A cask is a small Ruby recipe
(`stark.rb`) that tells Homebrew where to download the signed `.dmg`, what
checksum to expect, and where to install `Stark.app`.

The recipe lives in a **tap** — a separate GitHub repo named
`ashinno/homebrew-stark`. Once the tap is published, users can install with
the one-liner above.

```
GitHub: ashinno/Stark-home            ← this repo: app source + CI
            │
            ├── releases/v0.1.0/Stark-0.1.0-arm64.dmg
            └── releases/v0.1.0/Stark-0.1.0-x64.dmg
                         │
                         ▼
GitHub: ashinno/homebrew-stark        ← the tap: one file
            └── Casks/stark.rb        (mirrors Casks/stark.rb in this repo)
                         │
                         ▼
                    brew install --cask ashinno/stark/stark
```

## One-time setup (maintainer)

### 1. Apple signing identity

Homebrew Cask will refuse to install an unsigned Mac app starting from macOS
Catalina onward (Gatekeeper blocks it). You need:

- Apple Developer Program membership ($99/yr)
- A **Developer ID Application** certificate (Keychain → export as `.p12`)
- An app-specific password for `notarytool` (create at
  [appleid.apple.com](https://appleid.apple.com/account/manage) → App-Specific
  Passwords)
- Your Apple Team ID (visible at
  [developer.apple.com/account](https://developer.apple.com/account))

### 2. Create the tap repo

```bash
# Create an empty repo on GitHub called `homebrew-stark` (the
# `homebrew-` prefix is mandatory — it's how Homebrew recognizes taps).
gh repo create ashinno/homebrew-stark --public --description "Homebrew tap for Stark"
git clone git@github.com:ashinno/homebrew-stark.git
cd homebrew-stark
mkdir -p Casks
cp ../Stark-home/Casks/stark.rb Casks/
git add Casks/stark.rb
git commit -m "Initial tap — Stark v0.1.0"
git push
```

### 3. Verify the tap works

```bash
brew tap ashinno/stark
brew info --cask ashinno/stark/stark   # should print the formula
```

You won't be able to `brew install` yet because the v0.1.0 `.dmg` doesn't
exist — you'll publish it in step 5.

## Every release

### 4. Build + sign + notarize the DMG

```bash
# one-time: export the signing secrets (keep them out of your shell history
# by loading from a keychain or a `.envrc` outside git)
export APPLE_ID=you@apple.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=AB12CD34EF
export CSC_LINK=$HOME/certs/developer-id.p12
export CSC_KEY_PASSWORD=...

# bake the Python sidecar runtime, then build + sign + notarize
npm run sidecar:bake
npm run release:mac
```

This drops two files into `dist/`:

- `Stark-0.1.0-arm64.dmg` (Apple Silicon)
- `Stark-0.1.0-x64.dmg`   (Intel)

Both are signed, notarized, and stapled.

### 5. Publish the GitHub Release

```bash
gh release create v0.1.0 \
  dist/Stark-0.1.0-arm64.dmg \
  dist/Stark-0.1.0-x64.dmg \
  --title "Stark 0.1.0" \
  --notes-file CHANGELOG.md
```

Homebrew-Cask will resolve the download URL via the `url ... verified: ...`
stanza in `stark.rb`, so the filenames must match
`Stark-#{version}-#{arch}.dmg`.

### 6. Update the cask checksums

Compute the sha256 for each arch and update `Casks/stark.rb`:

```bash
./scripts/update-cask.sh 0.1.0
```

The script downloads both DMGs from the release, computes sha256, and
rewrites `Casks/stark.rb` with the new `version` + `sha256` + separate
stanzas per arch (Homebrew Cask supports `arch: on_arm / on_intel` blocks).

Commit the updated cask **in the tap repo** (not this repo, or both):

```bash
cd ../homebrew-stark
cp ../Stark-home/Casks/stark.rb Casks/
git commit -am "stark 0.1.0"
git push
```

### 7. Users install

```bash
brew tap ashinno/stark         # once
brew install --cask ashinno/stark/stark
```

Updates are just `brew upgrade --cask ashinno/stark/stark`.

## Uninstall / zap

```bash
brew uninstall --cask ashinno/stark/stark
brew uninstall --cask --zap ashinno/stark/stark   # also remove app data
```

The `zap` stanza in `stark.rb` purges:
- `~/Library/Application Support/stark`
- `~/Library/Preferences/com.stark.app.plist`
- `~/Library/Saved Application State/com.stark.app.savedState`
- `~/Library/Caches/com.stark.app`
- `~/Library/Logs/Stark`

Hermes's own install at `~/.hermes` is **not** removed by zap — that's the
engine, lives separately, and may be in use by other clients.

## Automating it

Once the flow is comfortable manually, wire it into GitHub Actions in this
repo:

```yaml
# .github/workflows/release.yml (sketch)
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run sidecar:bake
      - run: npm run release:mac
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
      - run: gh release create ${{ github.ref_name }} dist/*.dmg --generate-notes
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
      - run: ./scripts/update-cask.sh ${{ github.ref_name }}
      # bonus: open a PR on ashinno/homebrew-stark with the new cask
```

With that in place, `git tag v0.1.1 && git push --tags` is enough to cut a
full release — signed DMG, GitHub Release, updated cask, all automatic.

## Submitting to the main homebrew-cask repo

The tap (`ashinno/homebrew-stark`) is yours; anyone runs
`brew tap ashinno/stark` to use it. If you want Stark in the
**official** `Homebrew/homebrew-cask` so users can skip the tap and just run
`brew install --cask stark`, open a PR against
[Homebrew/homebrew-cask](https://github.com/Homebrew/homebrew-cask) once
you've shipped a few stable releases. The bar is a working cask, a
reasonable number of users, and responsive maintenance.
