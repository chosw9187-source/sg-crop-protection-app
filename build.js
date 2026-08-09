const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf-8');
const readB64 = (f) => fs.readFileSync(path.join(dir, f), 'utf-8').trim();

const products = JSON.parse(read('products_clean.json'));
const supplementary = JSON.parse(read('supplementary_products.json'));
const allProducts = products.concat(supplementary);

const weeds = JSON.parse(read('weeds_clean.json'));

const mixAll = JSON.parse(read('mix_data.json'));
const mixingByCrop = mixAll.filter(x => x.type === 'byCrop');
const mixingLists = mixAll.filter(x => x.type === '제품별혼용표' && x.title && x.title.indexOf('3종') === -1);

const photos = {
  weed_gangaji: 'data:image/jpeg;base64,' + readB64('weed_gangaji_b64.txt'),
  weed_gaegatnaengi: 'data:image/jpeg;base64,' + readB64('weed_gaegatnaengi_b64.txt'),
  weed_gaeguriajari: 'data:image/jpeg;base64,' + readB64('weed_gaeguriajari_b64.txt'),
  weed_kkaepul: 'data:image/jpeg;base64,' + readB64('weed_kkaepul_b64.txt'),
};
const logoB64 = 'data:image/jpeg;base64,' + readB64('logo_base64.txt');
const iconB64 = 'data:image/png;base64,' + readB64('app_icon_b64.txt');

const manifest = {
  name: '병해충·잡초 진단 도우미 - SG 한국삼공',
  short_name: 'SG 진단도우미',
  start_url: '.',
  display: 'standalone',
  background_color: '#f7f8f7',
  theme_color: '#2ea44f',
  icons: [
    { src: iconB64, sizes: '256x256', type: 'image/png', purpose: 'any' }
  ]
};
const manifestDataUri = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest));

const dataObj = {
  products: allProducts,
  weeds: weeds,
  mixingByCrop: mixingByCrop,
  mixingLists: mixingLists,
  photos: photos,
  logo: logoB64,
};

const css = read('styles.css');
const appJs = read('app.js');

const html = `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>병해충·잡초 진단 도우미 | SG 한국삼공</title>
<link rel="manifest" href="${manifestDataUri}">
<link rel="apple-touch-icon" href="${iconB64}">
<link rel="icon" href="${iconB64}">
<meta name="theme-color" content="#2ea44f">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="SG 진단도우미">
<style>
${css}
</style>
<div class="app">
  <div class="header">
    <img class="logo" src="${logoB64}" alt="SG 한국삼공"/>
    <div>
      <div class="title">병해충·잡초 진단 도우미</div>
      <div class="subtitle">SG 한국삼공 · 영업사원 현장/교육용</div>
    </div>
  </div>
  <div class="tabbar" id="tabbar"></div>
  <div class="view" id="view"></div>
  <div class="footer-note">본 자료는 2026 작물보호제 기술정보 · 밭잡초 도감 · 제품혼용정보 일부 데이터를 기반으로 제작되었습니다.<br/>실제 살포 전에는 반드시 제품 라벨의 사용법과 안전사용기준을 확인하세요.</div>
</div>
<div class="toast" id="toast"></div>
<script>
window.APP_DATA = ${JSON.stringify(dataObj)};
</script>
<script>
${appJs}
</script>
`;

fs.writeFileSync(path.join(dir, 'artifact.html'), html, 'utf-8');
console.log('Built artifact.html, size:', (fs.statSync(path.join(dir, 'artifact.html')).size / 1024).toFixed(1), 'KB');
console.log('Total products:', allProducts.length, '| Weeds:', weeds.length, '| MixByCrop:', mixingByCrop.length, '| MixLists:', mixingLists.length);
