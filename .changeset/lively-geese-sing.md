---
type: Added
pr: 3428
---
**`--claude-plugin` install mode** — new Claude Code plugin format target alongside existing `--claude` flat install. Emits a local marketplace (`.claude/gsd/.claude-plugin/marketplace.json`) plus the plugin under `.claude/gsd/plugins/gsd/`, then invokes `claude plugin marketplace add` and `claude plugin install` so Claude Code manages its own `settings.json`. The installer never writes to `~/.claude/settings.json` in plugin mode — structural fix for #3426 and #2303. Plugin can be toggled per project via `/plugin disable gsd`.
