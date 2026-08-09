const fs = require('fs');
const path = require('path');
const dir = __dirname;
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));

// ---------- WEEDS ----------
const weedParts = ['v2_weeds_part1.json', 'v2_weeds_part2.json', 'v2_weeds_part3.json'].map(load).flat();
const weeds = weedParts
  .filter(w => w.name)
  .map(w => {
    let control = w.control || null;
    if (!control && w.sections && w.sections.length) {
      const s = w.sections[0];
      control = { product: s.product || '자쿠사', sprayDate: s.sprayDate, timeline: s.timeline || [] };
    }
    return {
      name: w.name,
      sciName: w.sciName || null,
      family: w.family || null,
      photographer: w.photographer || null,
      shootingTime: w.shootingTime || null,
      description: w.description || null,
      control,
      note: w.note || null,
      physicalPageCover: w.physicalPageCover || null,
      physicalPageDetail: w.physicalPageDetail || null,
      bookPage: w.bookPage || null,
    };
  });
// dedupe by name (keep the one with more complete description)
const weedMap = new Map();
weeds.forEach(w => {
  const existing = weedMap.get(w.name);
  if (!existing || (w.description && (!existing.description || w.description.length > existing.description.length))) {
    weedMap.set(w.name, w);
  }
});
const weedsFinal = [...weedMap.values()];
fs.writeFileSync(path.join(dir, 'v2_weeds_merged.json'), JSON.stringify(weedsFinal, null, 2));
console.log('Weeds merged:', weedsFinal.length);

// ---------- TECH PRODUCTS ----------
const techParts = ['v2_tech_part1.json', 'v2_tech_part2.json', 'v2_tech_part3.json', 'v2_tech_part4.json', 'v2_tech_part5.json'].map(load).flat();
const techWithName = techParts.filter(p => p.productName);
const normalizeName = (n) => n.trim().replace(/[\(（]\s*계속\s*\d*\s*[\)）]/g, '').trim();
const prodMap = new Map();
techWithName.forEach(p => {
  const key = normalizeName(p.productName);
  if (!prodMap.has(key) || !prodMap.get(key)) {
    prodMap.set(key, {
      productName: key,
      formulation: p.formulation || null,
      category: p.category || null,
      activeIngredient: p.activeIngredient || null,
      ingredientClass: p.ingredientClass || null,
      packaging: p.packaging || null,
      features: p.features ? [...p.features] : [],
      targets: p.targets ? [...p.targets] : [],
      bookPage: p.bookPage || null,
    });
  } else {
    const ex = prodMap.get(key);
    if (!ex.formulation && p.formulation) ex.formulation = p.formulation;
    if (!ex.category && p.category) ex.category = p.category;
    if (!ex.activeIngredient && p.activeIngredient) ex.activeIngredient = p.activeIngredient;
    if (!ex.ingredientClass && p.ingredientClass) ex.ingredientClass = p.ingredientClass;
    if (!ex.packaging && p.packaging) ex.packaging = p.packaging;
    if (p.features && p.features.length) {
      p.features.forEach(f => { if (!ex.features.includes(f)) ex.features.push(f); });
    }
    if (p.targets && p.targets.length) ex.targets.push(...p.targets);
  }
});
// dedupe targets within each product (same crop+target+dosage)
const productsFinal = [...prodMap.values()].map(p => {
  const seen = new Set();
  p.targets = p.targets.filter(t => {
    const k = (t.crop||'') + '|' + (t.target||'') + '|' + (t.dosage||'') + '|' + (t.timing||'');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).filter(t => t.crop && t.target);
  p.features = p.features.filter(f => f && !/^note\s*:/i.test(f.trim()) && !/^physicalPage/i.test(f.trim()));
  if (!p.category) p.category = '기타';
  return p;
}).filter(p => p.productName && !/^\s*$/.test(p.productName));
fs.writeFileSync(path.join(dir, 'v2_products_merged.json'), JSON.stringify(productsFinal, null, 2));
console.log('Products merged:', productsFinal.length, '| total target rows:', productsFinal.reduce((a,p)=>a+p.targets.length,0));

// category breakdown
const catCount = {};
productsFinal.forEach(p => { catCount[p.category] = (catCount[p.category]||0)+1; });
console.log('Categories:', catCount);

// ---------- MIXING ----------
const mixParts = ['v2_mix_part1.json', 'v2_mix_part2.json'].map(load).flat();
const mixByCropRaw = mixParts.filter(m => m.type === 'byCrop' && m.baseProduct);
const mixMap = new Map();
mixByCropRaw.forEach(m => {
  const key = m.baseProduct.trim();
  if (!mixMap.has(key)) {
    mixMap.set(key, { baseProduct: key, formulation: m.formulation || null, byCrop: [...(m.byCrop||[])] });
  } else {
    mixMap.get(key).byCrop.push(...(m.byCrop||[]));
  }
});
const mixingFinal = [...mixMap.values()];
const mixLists = mixParts.filter(m => m.type === '제품별혼용표' && m.products && m.products.length);
fs.writeFileSync(path.join(dir, 'v2_mixing_merged.json'), JSON.stringify({ byCrop: mixingFinal, lists: mixLists }, null, 2));
console.log('Mixing byCrop products:', mixingFinal.length, '| lists:', mixLists.length);
