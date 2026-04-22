# Vendored `hermes_agent`

The upstream Python agent lives here as a `git subtree` pinned to a specific tag.

To add/update:

```bash
# first time
git subtree add --prefix sidecar/hermes_home/vendor/hermes_agent \
  https://github.com/NousResearch/hermes-agent.git main --squash

# update later
git subtree pull --prefix sidecar/hermes_home/vendor/hermes_agent \
  https://github.com/NousResearch/hermes-agent.git main --squash
```

Do not edit files inside `hermes_agent/` directly. Patch via the adapter
layer in `sidecar/hermes_home/bridge/routes/`.
