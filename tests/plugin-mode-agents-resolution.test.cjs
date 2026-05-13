/**
 * Plugin-mode agents-dir resolution (#3428 follow-up)
 *
 * The Claude Code `--claude-plugin` install (commit 0c76f1af) writes GSD
 * agents under `<root>/.claude/gsd/plugins/gsd/agents/`, with a sibling
 * `.claude-plugin/plugin.json` marker. The SDK / CJS resolver must locate
 * this directory when invoked with the project root, otherwise every init
 * query and `validate.agents` call reports `agents_installed: false` and
 * workflows refuse to spawn named subagents.
 *
 * This regression test pins the resolver against the on-disk plugin layout.
 */

process.env.GSD_TEST_MODE = '1';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { createTempDir } = require('./helpers.cjs');

const { getAgentsDir, checkAgentsInstalled } = require('../get-shit-done/bin/lib/core.cjs');
const { MODEL_PROFILES } = require('../get-shit-done/bin/lib/model-profiles.cjs');

function buildPluginLayout(rootDir, { withManifest = true, withAgents = true } = {}) {
  const pluginRoot = path.join(rootDir, '.claude', 'gsd', 'plugins', 'gsd');
  if (withManifest) {
    fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'gsd', version: '0.0.0-test' })
    );
  }
  if (withAgents) {
    fs.mkdirSync(path.join(pluginRoot, 'agents'), { recursive: true });
  }
  return path.join(pluginRoot, 'agents');
}

describe('getAgentsDir — Claude Code --claude-plugin layout (#3428 follow-up)', () => {
  let tmpDir;
  let savedAgentsDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-plugin-agents-cjs-');
    savedAgentsDir = process.env.GSD_AGENTS_DIR;
    delete process.env.GSD_AGENTS_DIR;
  });

  afterEach(() => {
    if (savedAgentsDir === undefined) delete process.env.GSD_AGENTS_DIR;
    else process.env.GSD_AGENTS_DIR = savedAgentsDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns the plugin agents dir when both markers exist', () => {
    const pluginAgents = buildPluginLayout(tmpDir);
    assert.strictEqual(getAgentsDir(tmpDir), pluginAgents);
  });

  test('falls back when plugin.json is absent (agents-only is not enough)', () => {
    buildPluginLayout(tmpDir, { withManifest: false, withAgents: true });
    assert.notStrictEqual(
      getAgentsDir(tmpDir),
      path.join(tmpDir, '.claude', 'gsd', 'plugins', 'gsd', 'agents'),
    );
  });

  test('falls back when agents/ is absent (plugin.json alone is not enough)', () => {
    buildPluginLayout(tmpDir, { withManifest: true, withAgents: false });
    assert.notStrictEqual(
      getAgentsDir(tmpDir),
      path.join(tmpDir, '.claude', 'gsd', 'plugins', 'gsd', 'agents'),
    );
  });

  test('GSD_AGENTS_DIR wins over plugin dir', () => {
    buildPluginLayout(tmpDir);
    process.env.GSD_AGENTS_DIR = '/explicit/agents';
    try {
      assert.strictEqual(getAgentsDir(tmpDir), '/explicit/agents');
    } finally {
      delete process.env.GSD_AGENTS_DIR;
    }
  });

  test('omitting projectDir does not pick up the per-project plugin', () => {
    buildPluginLayout(tmpDir);
    const result = getAgentsDir();
    assert.notStrictEqual(
      result,
      path.join(tmpDir, '.claude', 'gsd', 'plugins', 'gsd', 'agents'),
    );
  });
});

describe('checkAgentsInstalled — Claude Code --claude-plugin layout (#3428 follow-up)', () => {
  let tmpDir;
  let savedAgentsDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-plugin-check-cjs-');
    savedAgentsDir = process.env.GSD_AGENTS_DIR;
    delete process.env.GSD_AGENTS_DIR;
  });

  afterEach(() => {
    if (savedAgentsDir === undefined) delete process.env.GSD_AGENTS_DIR;
    else process.env.GSD_AGENTS_DIR = savedAgentsDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('reports agents_installed=true when every expected agent lives under the per-project plugin dir', () => {
    const pluginAgents = buildPluginLayout(tmpDir);
    for (const name of Object.keys(MODEL_PROFILES)) {
      fs.writeFileSync(
        path.join(pluginAgents, `${name}.md`),
        `---\nname: ${name}\n---\nstub\n`
      );
    }
    const status = checkAgentsInstalled(tmpDir);
    assert.strictEqual(status.agents_dir, pluginAgents);
    assert.strictEqual(status.agents_installed, true);
    assert.deepStrictEqual(status.missing_agents, []);
  });

  test('reports agents_installed=false when the plugin agents dir is empty', () => {
    const pluginAgents = buildPluginLayout(tmpDir);
    const status = checkAgentsInstalled(tmpDir);
    assert.strictEqual(status.agents_dir, pluginAgents);
    assert.strictEqual(status.agents_installed, false);
    assert.ok(status.missing_agents.length > 0);
  });
});
