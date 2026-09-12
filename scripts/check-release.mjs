import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
const [manifest, versions, pkg] = await Promise.all(['manifest.json', 'versions.json', 'package.json'].map(json));
for (const key of ['id', 'name', 'version', 'minAppVersion', 'description', 'author']) {
  assert.equal(typeof manifest[key], 'string', `Missing manifest field: ${key}`);
  assert.ok(manifest[key].trim(), `Empty manifest field: ${key}`);
}
assert.match(manifest.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
assert.doesNotMatch(manifest.id, /obsidian|plugin/);
assert.doesNotMatch(manifest.name, /obsidian|plugin/i);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.match(manifest.minAppVersion, /^\d+\.\d+\.\d+$/);
assert.ok(manifest.description.length <= 250 && manifest.description.endsWith('.'));
assert.equal(manifest.isDesktopOnly, true, 'The Electron integration requires a desktop-only manifest.');
assert.equal(pkg.version, manifest.version, 'package.json and manifest.json must use the same version.');
assert.equal(versions[manifest.version], manifest.minAppVersion, 'versions.json must match the minimum version.');
assert.equal(pkg.license, 'MIT');
assert.match(await readFile('LICENSE', 'utf8'), /MIT License[\s\S]*Copyright \(c\) \d{4} Meowdichlorian/);
for (const file of ['main.js', 'styles.css', 'README.md', 'README.zh-CN.md']) {
  assert.ok((await stat(file)).size > 0, `Missing or empty release file: ${file}`);
}
const bundle = await readFile('main.js', 'utf8');
assert.doesNotMatch(bundle, /qa-progress\.json|sce-qa-assets|runQA/, 'Build with pnpm build before packaging; QA code must be absent.');
assert.ok(bundle.includes(`Simple Canvas Exporter ${manifest.version}`), 'Update the HTML generator version.');
console.log(`Release checks passed: ${manifest.id} ${manifest.version}, Obsidian ${manifest.minAppVersion}+.`);
