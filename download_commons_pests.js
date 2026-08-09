const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const items = require('./commons_meta.json');
const outDir = path.join(__dirname, 'commons_pest_photos');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

function slug(name) {
  return name.replace(/[^\w가-힣]/g, '_');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function download(url) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'SG-HankookSamgong-InternalTrainingApp/1.0' } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429) {
      console.log('  429, backing off...');
      await sleep(6000 * (i + 1));
      continue;
    }
    throw new Error('HTTP ' + res.status);
  }
  throw new Error('HTTP 429 after retries');
}

async function run() {
  const map = {};
  const existing = fs.existsSync('commons_pest_photo_map.json') ? JSON.parse(fs.readFileSync('commons_pest_photo_map.json', 'utf-8')) : {};
  Object.assign(map, existing);
  for (const it of items) {
    if (map[it.kr]) { console.log('SKIP (done)', it.kr); continue; }
    await sleep(3000);
    const key = slug(it.kr);
    const outFile = path.join(outDir, key + '.jpg');
    try {
      const buf = await download(it.thumbUrl);
      await sharp(buf)
        .resize(700, 500, { fit: 'cover' })
        .jpeg({ quality: 70 })
        .toFile(outFile);
      map[it.kr] = { key, license: it.license, artist: it.artist, title: it.title, descUrl: it.descUrl };
      console.log('OK', it.kr);
    } catch (e) {
      console.log('FAIL', it.kr, e.message);
    }
  }
  fs.writeFileSync('commons_pest_photo_map.json', JSON.stringify(map, null, 2));
  console.log('Total:', Object.keys(map).length, '/', items.length);
}
run();
