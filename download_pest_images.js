const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const dir = __dirname;

const pests = JSON.parse(fs.readFileSync(path.join(dir, 'pest_guide.json'), 'utf-8'));
const outDir = path.join(dir, 'pest_photos');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

function slug(name) {
  return name.replace(/[^\w가-힣]/g, '_');
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function run() {
  const map = {};
  let ok = 0, fail = 0;
  for (const p of pests) {
    if (!p.img) continue;
    const key = slug(p.name);
    const outFile = path.join(outDir, key + '.jpg');
    try {
      const buf = await download(p.img);
      await sharp(buf)
        .resize(700, 500, { fit: 'cover' })
        .jpeg({ quality: 68 })
        .toFile(outFile);
      map[p.name] = key;
      ok++;
    } catch (e) {
      console.log('FAIL', p.name, e.message);
      fail++;
    }
  }
  fs.writeFileSync(path.join(dir, 'pest_photo_map.json'), JSON.stringify(map));
  console.log('Downloaded:', ok, '| Failed:', fail);
}
run();
