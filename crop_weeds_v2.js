const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const weeds = require('./v2_weeds_merged.json');
const outDir = path.join(__dirname, 'v2_photos');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

function slug(name) {
  return name.replace(/[^\w가-힣]/g, '_');
}

async function run() {
  const results = {};
  let done = 0;
  for (const w of weeds) {
    const page = w.physicalPageCover || w.physicalPageDetail;
    if (!page) continue;
    const src = path.join(__dirname, 'v2_weed', 'p-' + String(page).padStart(3, '0') + '.png');
    if (!fs.existsSync(src)) continue;
    const key = slug(w.name);
    const outFile = path.join(outDir, key + '.jpg');
    try {
      const top = w.physicalPageCover ? 380 : 340;
      const height = w.physicalPageCover ? 900 : 500;
      await sharp(src)
        .extract({ left: 0, top, width: 1241, height })
        .resize(480)
        .jpeg({ quality: 62 })
        .toFile(outFile);
      results[w.name] = key;
      done++;
    } catch (e) {
      console.log('FAILED', w.name, e.message);
    }
  }
  console.log('Cropped', done, 'photos');
  fs.writeFileSync(path.join(__dirname, 'v2_photo_map.json'), JSON.stringify(results));
}
run();
