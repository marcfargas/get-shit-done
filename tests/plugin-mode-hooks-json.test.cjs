/**
 * Plugin-mode hooks.json emission coverage.
 *
 * Pins the projected shape of `<plugin>/hooks/hooks.json` under the
 * `--claude-plugin` install branch — most importantly that the
 * `${CLAUDE_PLUGIN_ROOT}` literal survives into the file (Claude Code
 * expands it at hook-evaluation time, so JS-interpolating it away would
 * silently produce empty paths).
 */

'use strict';

process.env.GSD_TEST_MODE = '1';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const INSTALL_SRC = path.join(__dirname, '..', 'bin', 'install.js');
const BUILD_SCRIPT = path.join(__dirname, '..', 'scripts', 'build-hooks.js');

let tmpDir;
let origCwd;
let parsed;
let allCommands;

before(() => {
  // hooks/dist/ must be populated before install() reads it; build once here
  // to avoid races with other concurrent install tests.
  execFileSync(process.execPath, [BUILD_SCRIPT], { encoding: 'utf-8', stdio: 'pipe' });

  origCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-plugin-hooks-json-'));
  process.chdir(tmpDir);

  // hasClaudePlugin is captured at module load, so we mutate argv + bust cache.
  const savedArgv = process.argv.slice();
  process.argv = [process.argv[0], INSTALL_SRC, '--claude-plugin', '--local'];
  delete require.cache[require.resolve(INSTALL_SRC)];
  try {
    require(INSTALL_SRC).install(false, 'claude');
  } finally {
    process.argv = savedArgv;
    delete require.cache[require.resolve(INSTALL_SRC)];
  }

  const hooksJsonPath = path.join(
    tmpDir, '.claude', 'gsd', 'plugins', 'gsd', 'hooks', 'hooks.json'
  );
  parsed = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
  allCommands = Object.values(parsed.hooks)
    .flat()
    .flatMap(wrap => wrap.hooks.map(inner => inner.command));
});

after(() => {
  // Windows refuses to delete the cwd.
  if (origCwd && process.cwd() !== origCwd) process.chdir(origCwd);
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('plugin-mode install emits hooks/hooks.json with projected commands', () => {
  test('hooks.json has Claude Code canonical shape', () => {
    assert.ok(parsed && typeof parsed === 'object', 'hooks.json must parse to an object');
    assert.ok(parsed.hooks && typeof parsed.hooks === 'object', 'top-level must have `hooks` object');

    const knownBuckets = ['SessionStart', 'PreToolUse', 'PostToolUse'];
    const presentBuckets = Object.keys(parsed.hooks).filter(k => knownBuckets.includes(k));
    assert.ok(
      presentBuckets.length > 0,
      `must populate at least one of ${knownBuckets.join('/')}, got: ${Object.keys(parsed.hooks).join(',') || '(none)'}`
    );

    let totalHooks = 0;
    for (const bucket of presentBuckets) {
      const wraps = parsed.hooks[bucket];
      assert.ok(Array.isArray(wraps) && wraps.length > 0, `hooks.${bucket} must be a non-empty array`);
      for (const wrap of wraps) {
        assert.ok(wrap && Array.isArray(wrap.hooks), `each ${bucket} wrap must have an inner hooks[] array`);
        for (const inner of wrap.hooks) {
          assert.equal(inner.type, 'command', `inner hook type must be "command", got ${inner.type}`);
          assert.equal(typeof inner.command, 'string', 'inner hook command must be a string');
          assert.ok(inner.command.length > 0, 'inner hook command must be non-empty');
          totalHooks += 1;
        }
      }
    }
    assert.ok(totalHooks > 0, 'must emit at least one command entry across all events');
  });

  test('projected commands preserve the ${CLAUDE_PLUGIN_ROOT} literal', () => {
    const withPluginRoot = allCommands.filter(c => c.includes('${CLAUDE_PLUGIN_ROOT}/bin/'));
    assert.ok(
      withPluginRoot.length > 0,
      'at least one projected command must reference ${CLAUDE_PLUGIN_ROOT}/bin/ ' +
      `(JS-interpolating the literal would silently produce empty paths). Got: ${JSON.stringify(allCommands)}`
    );

    for (const cmd of allCommands) {
      assert.ok(
        !cmd.includes('/plugins/gsd/bin/') || cmd.includes('${CLAUDE_PLUGIN_ROOT}/bin/'),
        `command leaks an absolute plugin-bin path instead of using \${CLAUDE_PLUGIN_ROOT}: ${cmd}`
      );
    }
  });

  test('no command leaks a PowerShell call-operator prefix (#3413)', () => {
    for (const cmd of allCommands) {
      assert.equal(
        cmd.startsWith('& '), false,
        `Claude hooks.json command must not start with PowerShell call-operator: ${cmd}`
      );
    }
  });
});
