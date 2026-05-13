/**
 * Plugin-mode manifest coverage (CodeRabbit finding on closed PR #3428)
 *
 * The Claude Code plugin install layout (`--claude-plugin`) writes commands
 * to a FLAT <plugin>/commands/*.md tree (no /gsd/ subdir) and hooks to
 * <plugin>/bin/ (not <plugin>/hooks/, which carries hooks.json). The legacy
 * writeManifest() only knew about <config>/commands/gsd/ and <config>/hooks/,
 * so plugin commands and hooks were silently absent from the manifest, and
 * saveLocalPatches() would overwrite user local patches on reinstall instead
 * of preserving them.
 *
 * This regression test pins the manifest to the actual plugin layout.
 */

process.env.GSD_TEST_MODE = '1';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { createTempDir } = require('./helpers.cjs');

const { writeManifest } = require('../bin/install.js');

describe('writeManifest — Claude Code plugin layout (#3428)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-plugin-manifest-');
    // Mimic the on-disk shape produced by the pluginMode install branch:
    // - commands/*.md (flat — no /gsd/ subdir)
    // - bin/gsd-*.{js,sh}  (hook scripts; the hook MANIFEST lives in hooks/hooks.json)
    // - agents/gsd-*.md
    // - get-shit-done/VERSION
    // - .claude-plugin/plugin.json (auto-detection marker)
    fs.mkdirSync(path.join(tmpDir, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'commands', 'gsd-help.md'), '# /gsd:help\n');
    fs.writeFileSync(path.join(tmpDir, 'commands', 'gsd-progress.md'), '# /gsd:progress\n');

    fs.mkdirSync(path.join(tmpDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'bin', 'gsd-prompt-guard.js'), '// guard\n');
    fs.writeFileSync(path.join(tmpDir, 'bin', 'gsd-validate-commit.sh'), '#!/bin/bash\n');

    fs.mkdirSync(path.join(tmpDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'agents', 'gsd-executor.md'), '---\nname: gsd-executor\n---\n');

    fs.mkdirSync(path.join(tmpDir, 'get-shit-done'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'get-shit-done', 'VERSION'), '0.0.0-test\n');

    fs.mkdirSync(path.join(tmpDir, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'gsd', version: '0.0.0-test' })
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('flat commands/*.md files are recorded under commands/ (not commands/gsd/)', () => {
    writeManifest(tmpDir, 'claude', { pluginMode: true });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'gsd-file-manifest.json'), 'utf8')
    );
    assert.ok(manifest.files['commands/gsd-help.md'], 'commands/gsd-help.md missing from manifest');
    assert.ok(manifest.files['commands/gsd-progress.md'], 'commands/gsd-progress.md missing');
    // Plugin layout must NOT smuggle a /gsd/ segment back in.
    const nestedKeys = Object.keys(manifest.files).filter(k => k.startsWith('commands/gsd/'));
    assert.strictEqual(nestedKeys.length, 0, 'unexpected commands/gsd/ entries: ' + nestedKeys.join(','));
  });

  test('hook scripts under bin/ are recorded (plugin layout, not hooks/)', () => {
    writeManifest(tmpDir, 'claude', { pluginMode: true });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'gsd-file-manifest.json'), 'utf8')
    );
    assert.ok(manifest.files['bin/gsd-prompt-guard.js'], 'bin/gsd-prompt-guard.js missing');
    assert.ok(manifest.files['bin/gsd-validate-commit.sh'], 'bin/gsd-validate-commit.sh missing');
  });

  test('agents/ and get-shit-done/ entries are recorded as before', () => {
    writeManifest(tmpDir, 'claude', { pluginMode: true });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'gsd-file-manifest.json'), 'utf8')
    );
    assert.ok(manifest.files['agents/gsd-executor.md'], 'agents/gsd-executor.md missing');
    assert.ok(manifest.files['get-shit-done/VERSION'], 'get-shit-done/VERSION missing');
  });
});

describe('writeManifest — non-plugin Claude layout regression guard', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-nonplugin-manifest-');
    // Legacy Claude-local layout: commands/gsd/*.md, hooks/gsd-*.js
    fs.mkdirSync(path.join(tmpDir, 'commands', 'gsd'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'commands', 'gsd', 'help.md'), '# help\n');

    fs.mkdirSync(path.join(tmpDir, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'hooks', 'gsd-prompt-guard.js'), '// guard\n');

    fs.mkdirSync(path.join(tmpDir, 'get-shit-done'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'get-shit-done', 'VERSION'), '0.0.0-test\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('legacy commands/gsd/ and hooks/ paths still recorded when no plugin marker', () => {
    writeManifest(tmpDir, 'claude');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'gsd-file-manifest.json'), 'utf8')
    );
    assert.ok(manifest.files['commands/gsd/help.md'], 'legacy commands/gsd/help.md missing');
    assert.ok(manifest.files['hooks/gsd-prompt-guard.js'], 'legacy hooks/gsd-prompt-guard.js missing');
  });
});
