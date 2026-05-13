---
type: Fixed
---

**plugin-aware agents-dir resolution** — the `--claude-plugin` install (commit 0c76f1af) writes GSD agents under `<root>/.claude/gsd/plugins/gsd/agents/`, but `resolveAgentsDir()` only knew about `<configDir>/agents/`, so every init query and `validate.agents` call reported `agents_installed: false` after a clean plugin install and workflows refused to spawn named subagents. `resolveAgentsDir()` (TS) and `getAgentsDir()` (CJS twin) now probe the per-project plugin layout, then the global plugin layout, before falling back to the runtime-default — gated on `runtime === 'claude'` and on both `plugin.json` and `agents/` being present. `init-runner.ts` resolves the agents dir lazily per `readAgentFile` call instead of snapshotting it at module load, so a late `GSD_AGENTS_DIR` override and per-project plugin installs both win.
