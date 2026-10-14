import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';

const dist = resolve('dist');
async function list(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? list(resolve(directory, entry.name)) : [resolve(directory, entry.name)]))).flat();
}
const files = (await list(dist)).filter(path => !['sw.js', 'asset-manifest.json', '_redirects'].includes(relative(dist, path))).sort();
const digest = createHash('sha256');
const assets = [];
for (const file of files) {
  const url = '/' + relative(dist, file).split(sep).join('/');
  const bytes = await readFile(file);
  digest.update(url); digest.update(bytes);
  assets.push(url);
}
const version = digest.digest('hex');
await writeFile(resolve(dist, 'asset-manifest.json'), JSON.stringify({ version, assets }, null, 2) + '\n');
const template = await readFile('scripts/shell-sw.js', 'utf8');
await writeFile(resolve(dist, 'sw.js'), template.replace('__SHELL_VERSION__', version).replace('__SHELL_ASSETS__', JSON.stringify(assets)));
console.log(`Offline shell: ${assets.length} files, ${version.slice(0, 12)}`);
