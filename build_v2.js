const fs = require('fs');
const path = require('path');
const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf-8');
const readB64 = (f) => fs.readFileSync(path.join(dir, f)).toString('base64');

const products = JSON.parse(read('v2_products_merged.json'));
const weedsRaw = JSON.parse(read('v2_weeds_merged.json'));
const mixing = JSON.parse(read('v2_mixing_merged.json'));
const photoMap = JSON.parse(read('v2_photo_map.json'));
const productPhotoMap = JSON.parse(read('product_photo_map.json'));
const pestGuide = JSON.parse(read('pest_guide.json'));
const pestPhotoMap = JSON.parse(read('pest_photo_map.json'));
const commonsPestGuide = JSON.parse(read('commons_pest_guide.json'));
const formulationGuide = JSON.parse(read('formulation_guide.json'));

const FORMULATION_KEYS = formulationGuide.map(f => f.key).sort((a, b) => b.length - a.length);
function normalizeFormulation(raw) {
  if (!raw) return null;
  const head = raw.split('|')[0].trim();
  const found = FORMULATION_KEYS.find(k => head.indexOf(k) === 0);
  return found || null;
}

// supplementary products only present in mixing doc, not in main catalog
const supplementary = [
  {
    productName: '병모리', formulation: '수화제(다2+사1)', category: '살균제',
    activeIngredient: '보스칼리드 20% + 트리플루미졸 10%', ingredientClass: '피리딘카복사마이드계 + 트리아졸계',
    packaging: '정보 준비중', partial: true, sourceNote: '제품혼용정보 자료에서 확인된 정보',
    features: [], targets: []
  },
  {
    productName: '사천왕', formulation: '수화제(사1+사1)', category: '살균제',
    activeIngredient: '프로클로라즈망가니즈 25% + 테부코나졸 15%', ingredientClass: '이미다졸계 + 트리아졸계',
    packaging: '정보 준비중', partial: true, sourceNote: '제품혼용정보 자료에서 확인된 정보',
    features: [], targets: []
  }
];
const allProducts = products.concat(supplementary).map(p => ({
  ...p,
  photoKey: productPhotoMap[p.productName] ? ('p_' + productPhotoMap[p.productName]) : null,
  formulationBase: normalizeFormulation(p.formulation),
}));

const weeds = weedsRaw.map(w => ({
  id: w.name,
  name: w.name,
  sciName: w.sciName,
  family: w.family,
  photoKey: photoMap[w.name] ? ('w_' + photoMap[w.name]) : null,
  shotInfo: (w.photographer || w.shootingTime) ? ('촬영: ' + (w.photographer || '') + (w.shootingTime ? ' (' + w.shootingTime + ')' : '')) : null,
  description: w.description,
  control: w.control,
  note: w.note,
  incomplete: !w.description,
}));

const pests = pestGuide.map(p => ({
  name: p.name,
  photoKey: pestPhotoMap[p.name] ? ('ps_' + pestPhotoMap[p.name]) : null,
  symptom: p.symptom,
  control: p.control,
  products: p.products || [],
  source: 'SG 한국삼공 병해충도감',
})).concat(commonsPestGuide.map(p => ({
  name: p.name,
  photoKey: p.photoKey ? ('cp_' + p.photoKey) : null,
  symptom: null,
  control: null,
  products: [],
  source: p.source,
})));

const photos = {};
Object.entries(photoMap).forEach(([name, key]) => {
  const filePath = path.join(dir, 'v2_photos', key + '.jpg');
  if (fs.existsSync(filePath)) {
    photos['w_' + key] = 'data:image/jpeg;base64,' + readB64(path.relative(dir, filePath));
  }
});
Object.entries(productPhotoMap).forEach(([name, key]) => {
  const filePath = path.join(dir, 'product_photos', key + '.jpg');
  if (fs.existsSync(filePath)) {
    photos['p_' + key] = 'data:image/jpeg;base64,' + readB64(path.relative(dir, filePath));
  }
});
Object.entries(pestPhotoMap).forEach(([name, key]) => {
  const filePath = path.join(dir, 'pest_photos', key + '.jpg');
  if (fs.existsSync(filePath)) {
    photos['ps_' + key] = 'data:image/jpeg;base64,' + readB64(path.relative(dir, filePath));
  }
});
commonsPestGuide.forEach((p) => {
  if (!p.photoKey) return;
  const filePath = path.join(dir, 'commons_pest_photos', p.photoKey + '.jpg');
  if (fs.existsSync(filePath)) {
    photos['cp_' + p.photoKey] = 'data:image/jpeg;base64,' + readB64(path.relative(dir, filePath));
  }
});

const logoB64 = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, 'logo_base64.txt'), 'utf-8').trim();
const iconB64 = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, 'app_icon_b64.txt'), 'utf-8').trim();

const manifest = {
  name: '영업사원 작물보호제 학습 도우미 - SG 한국삼공',
  short_name: 'SG 학습도우미',
  start_url: '.',
  display: 'standalone',
  background_color: '#f7f8f7',
  theme_color: '#2ea44f',
  icons: [{ src: iconB64, sizes: '256x256', type: 'image/png', purpose: 'any' }]
};
const manifestDataUri = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest));

const dataObj = {
  products: allProducts,
  weeds: weeds,
  pests: pests,
  mixingByCrop: mixing.byCrop,
  mixingLists: mixing.lists,
  photos: photos,
  logo: logoB64,
  formulationGuide: formulationGuide,
};

const css = read('styles.css');
const appJs = read('app.js');

const html = `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>영업사원 작물보호제 학습 도우미 | SG 한국삼공</title>
<link rel="manifest" href="${manifestDataUri}">
<link rel="apple-touch-icon" href="${iconB64}">
<link rel="icon" href="${iconB64}">
<meta name="theme-color" content="#2ea44f">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="SG 학습도우미">
<style>
${css}
</style>
<div class="auth-gate" id="authGate">
  <div class="auth-card">
    <img class="auth-logo" src="${logoB64}" alt="SG 한국삼공"/>
    <div class="auth-title">영업사원 작물보호제 학습 도우미</div>
    <div class="auth-sub">SG 한국삼공 임직원 전용 · 사내 교육자료</div>
    <form id="authForm" autocomplete="off">
      <input id="authInput" type="password" inputmode="text" placeholder="인증코드를 입력하세요" autocomplete="off"/>
      <button type="submit" id="authSubmit">입장하기</button>
    </form>
    <div class="auth-error" id="authError"></div>
    <div class="auth-note">인증코드는 사내 그룹웨어 공지 또는 담당자를 통해 확인하세요.</div>
  </div>
</div>
<div class="app hidden" id="appRoot">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <img class="logo" src="${logoB64}" alt="SG 한국삼공"/>
      <div class="sidebar-brand-text">
        <div class="title">작물보호제 학습 도우미</div>
        <div class="subtitle">SG 한국삼공</div>
      </div>
    </div>
    <nav class="sidebar-nav" id="sidebarNav"></nav>
    <div class="sidebar-footer" id="sidebarFooter"></div>
  </aside>
  <div class="sidebar-backdrop" id="sidebarBackdrop" data-action="close-sidebar"></div>
  <div class="main">
    <div class="header">
      <button class="menu-btn" data-action="toggle-sidebar" aria-label="메뉴 열기">☰</button>
      <div class="header-text">
        <div class="title" id="headerTitle">영업사원 작물보호제 학습 도우미</div>
        <div class="subtitle">SG 한국삼공 · 현장/교육용</div>
      </div>
    </div>
    <div class="view" id="view"></div>
    <div class="footer-note">본 자료는 2026 작물보호제 기술정보 · 밭잡초 도감 · 제품혼용정보를 기반으로 제작되었습니다.<br/>실제 살포 전에는 반드시 제품 라벨의 사용법과 안전사용기준을 확인하세요.</div>
  </div>
</div>
<div class="modal-backdrop hidden" id="adminModal">
  <div class="modal-card">
    <div class="modal-title">⚙️ 관리자 설정</div>
    <div id="adminBody"></div>
  </div>
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

// GitHub Pages output (docs/ folder — enable Pages with "main / docs")
const docsDir = path.join(dir, 'docs');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
fs.writeFileSync(path.join(docsDir, 'index.html'), html, 'utf-8');
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '', 'utf-8');
// 테스트 공개 단계에서는 검색엔진 색인을 막는다 (비공개 전환 시 함께 정리)
fs.writeFileSync(path.join(docsDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf-8');

// Named copy for 다우오피스 그룹웨어 자료실 배포
const DEPLOY_NAME = 'SG_영업사원 작물보호제 학습 도우미.html';
fs.writeFileSync(path.join(dir, DEPLOY_NAME), html, 'utf-8');

const sizeKB = (fs.statSync(path.join(dir, 'artifact.html')).size / 1024).toFixed(1);
console.log('Built artifact.html, size:', sizeKB, 'KB');
console.log('Also wrote: docs/index.html (GitHub Pages) +', DEPLOY_NAME);
console.log('Products:', allProducts.length, '| Weeds:', weeds.length, '| Pests:', pests.length, '| Photos:', Object.keys(photos).length, '| MixByCrop:', mixing.byCrop.length);
