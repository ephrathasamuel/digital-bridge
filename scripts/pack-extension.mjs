// Packs apps/extension into a .zip for Firefox Add-ons and Microsoft Edge Add-ons (both free to publish), and puts a
// copy in the web build so the site can offer a direct download. No dependencies: stored (uncompressed) zip entries.
//   node scripts/pack-extension.mjs  ->  apps/web-components/dist/downloads/{digital-bridge-help-bar,digital-bridge-wordpress}.zip
import { crc32 } from 'node:zlib';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['README.md', 'STORE.md']);
const DOS_TIME = 0; // fixed timestamp so the same files always give the same zip
const DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;

/** Writes a stored zip of `source`; `prefix` puts the files inside a folder (WordPress expects one). */
function pack(source, outFile, prefix = '') {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (!SKIP.has(name)) files.push(full);
    }
  })(source);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(prefix + relative(source, file).split(sep).join('/'));
    const data = readFileSync(file);
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, Buffer.concat([...locals, ...centrals, end]));
  console.log(`packed ${files.length} files -> ${relative(root, outFile)}`);
}

const downloads = join(root, 'apps/web-components/dist/downloads');
pack(join(root, 'apps/extension'), join(downloads, 'digital-bridge-help-bar.zip'));
pack(join(root, 'apps/wordpress/digital-bridge'), join(downloads, 'digital-bridge-wordpress.zip'), 'digital-bridge/');
