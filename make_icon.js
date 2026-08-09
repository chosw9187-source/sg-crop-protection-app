const sharp = require('sharp');

async function run() {
  const mark = await sharp('C:/Users/sg/앱들기/hr-eval-system/public/ci-logo.jpg')
    .extract({ left: 0, top: 0, width: 195, height: 228 })
    .resize(180)
    .toBuffer();

  await sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ compressionLevel: 9, palette: true })
    .toFile('app_icon.png');

  console.log('icon built');
}
run();
