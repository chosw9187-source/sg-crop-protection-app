const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const dir = __dirname;

const matched = JSON.parse(fs.readFileSync(path.join(dir, 'image_match.json'), 'utf-8'));
const outDir = path.join(dir, 'product_photos');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

function slug(name) {
  return name.replace(/[^\w가-힣]/g, '_');
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function run() {
  const map = {};
  let ok = 0, fail = 0;
  for (const m of matched) {
    const key = slug(m.productName);
    const outFile = path.join(outDir, key + '.jpg');
    try {
      const buf = await download(m.img);
      await sharp(buf)
        .resize(400, 400, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 72 })
        .toFile(outFile);
      map[m.productName] = key;
      ok++;
    } catch (e) {
      console.log('FAIL', m.productName, e.message);
      fail++;
    }
  }
  fs.writeFileSync(path.join(dir, 'product_photo_map.json'), JSON.stringify(map));
  console.log('Downloaded:', ok, '| Failed:', fail);
}
run();
