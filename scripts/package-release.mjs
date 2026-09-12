import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) throw Error('Invalid plugin ID.');
const destination = join('release', manifest.id);
await mkdir(destination, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css', 'LICENSE']) {
  await copyFile(file, join(destination, file));
}
console.log(`Release files prepared in ${destination}. Upload main.js, manifest.json and styles.css as individual GitHub Release assets.`);
