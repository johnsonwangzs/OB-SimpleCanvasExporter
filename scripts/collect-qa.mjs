import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

if (!process.argv[2]) throw Error('Pass the development vault directory.');
const base = join(resolve(process.argv[2]), '.obsidian/plugins/simple-canvas-exporter');
const result = JSON.parse(await readFile(join(base, 'qa-result.json'), 'utf8'));
if (result.error) throw Error(result.error);
const behavior = JSON.parse(await readFile(join(base, 'qa-behavior.json'), 'utf8'));
if (!behavior.noOverwrite || !behavior.cancellationCleanup || !behavior.unsavedSnapshot) throw Error('Behavior checks did not finish.');
await mkdir('qa', { recursive: true });
for (const [from, to] of Object.entries({
  'qa-export.html': 'example-canvas.html',
  'qa-native-reference.json': 'native-reference.json',
  'qa-native-paths.json': 'native-paths.json',
  'qa-fixture.html': 'fixture.html',
  'qa-result.json': 'obsidian-result.json',
  'qa-fixture-result.json': 'fixture-result.json',
  'qa-behavior.json': 'behavior.json',
  'qa-layout.json': 'layout.json',
})) await copyFile(join(base, from), join('qa', to));
console.log(`Collected ${result.cards} cards and ${result.connections} connections; behavior checks passed.`);
