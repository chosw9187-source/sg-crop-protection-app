const fs = require('fs');

const items = [
  { kr: '잿빛곰팡이병', file: 'Himbeere (Rubus idaeus) mit Grauschimmel (Botrytis cinerea)-Josef Schlaghecken.jpg' },
  { kr: '탄저병', file: 'Anthracnose Colletotrichum orbiculare - 1436111.png' },
  { kr: '파밤나방', file: 'Spodoptera exigua 229766975.jpg' },
  { kr: '흰가루병', file: 'Powdery mildew 9.jpg' },
  { kr: '점박이응애', file: 'Colony of Red spider mites (Tetranychus urticae).jpg' },
  { kr: '노균병', file: 'Downy mildew on watermelon 2.jpg' },
  { kr: '목화진딧물', file: 'Aphis gossypii Бахчевая тля.jpg' },
  { kr: '복숭아혹진딧물', file: 'Green peach aphid (Myzus persicae) on a leaf, Lisbon, Portugal (approx. GPS location) julesvernex2.jpg' },
  { kr: '균핵병', file: 'Cucumis sativus - Sclerotinia sclerotiorum-2-Hinrichs-Berger.jpg' },
  { kr: '꽃노랑총채벌레', file: 'Frankliniella occidentalis 171790473.jpg' },
  { kr: '배추좀나방', file: 'Plutella xylostella 90137358.jpg' },
  { kr: '벼룩잎벌레', file: 'Phyllotreta striolata P1210443a.jpg' },
  { kr: '아메리카잎굴파리', file: 'Liriomyza trifolii male.jpg' },
  { kr: '역병', file: 'Late blight on potato leaf 2.jpg' },
  { kr: '무름병', file: 'Napa Cabbage (Won Bok, Chinese Cabbage, Celery Cabbage) Bacterial soft rot (34795134544).jpg' },
  { kr: '점무늬병', file: 'Septoria leaf spot symptoms on tomato leaf (Septoria lycopersici on Solanum lycopersicum leaf).jpg' },
  { kr: '복숭아순나방', file: 'Pfirsich-Fruchtwickler (Cydia molesta), auch Orientalischer Fruchtwickler genannt.jpg' },
  { kr: '담배가루이', file: 'Silverleaf Whitefly (Bemisia tabaci) adult.jpg' },
  { kr: '뿌리혹병', file: 'Knolvoet bij bloemkool (Plasmodiophora brassicae on cauliflower).jpg' },
  { kr: '온실가루이', file: 'Trialeurodes vaporariorum 34941498.jpg' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, tries) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'SG-HankookSamgong-InternalTrainingApp/1.0 (contact: internal use)' } });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.log('  retry after throttle... (' + (i+1) + '/' + tries + ')');
      await sleep(4000 * (i + 1));
    }
  }
  throw new Error('failed after retries');
}

async function run() {
  const results = [];
  for (const it of items) {
    await sleep(2500);
    const title = 'File:' + it.file;
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&titles=' + encodeURIComponent(title) +
      '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900&format=json';
    const data = await fetchWithRetry(url, 4);
    const page = Object.values(data.query.pages)[0];
    const ii = page.imageinfo && page.imageinfo[0];
    if (!ii) { console.log('MISSING', it.kr, it.file); continue; }
    const em = ii.extmetadata || {};
    results.push({
      kr: it.kr,
      title: page.title,
      license: em.LicenseShortName ? em.LicenseShortName.value : '?',
      licenseUrl: em.LicenseUrl ? em.LicenseUrl.value : '',
      artist: em.Artist ? em.Artist.value.replace(/<[^>]+>/g, '').trim() : '',
      credit: em.Credit ? em.Credit.value.replace(/<[^>]+>/g, '').trim() : '',
      imageUrl: ii.url,
      thumbUrl: ii.thumburl,
      descUrl: ii.descriptionurl,
    });
  }
  fs.writeFileSync('commons_meta.json', JSON.stringify(results, null, 2));
  console.log('Done:', results.length, '/', items.length);
}
run();
