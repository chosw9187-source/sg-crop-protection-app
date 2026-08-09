const sharp = require('sharp');
const fs = require('fs');

const jobs = [
  { src: 'weed/p-05.png', out: 'weed_gangaji.jpg', rect: { left: 100, top: 345, width: 1080, height: 480 } },
  { src: 'weed/p-07.png', out: 'weed_gaegatnaengi.jpg', rect: { left: 100, top: 345, width: 1080, height: 480 } },
  { src: 'weed/p-09.png', out: 'weed_gaeguriajari.jpg', rect: { left: 100, top: 345, width: 1080, height: 480 } },
  { src: 'weed/p-12.png', out: 'weed_kkaepul.jpg', rect: { left: 0, top: 380, width: 1241, height: 900 } },
];

async function run() {
  for (const j of jobs) {
    await sharp(j.src)
      .extract(j.rect)
      .resize(860)
      .jpeg({ quality: 78 })
      .toFile(j.out);
    const stat = fs.statSync(j.out);
    console.log(j.out, stat.size);
  }
}
run();
