const fs = require('fs');
const path = require('path');
const dir = __dirname;

const products = JSON.parse(fs.readFileSync(path.join(dir, 'v2_products_merged.json'), 'utf-8'));
const supplementary = [
  { productName: '병모리' }, { productName: '사천왕' }
];
const allProducts = products.concat(supplementary);

const siteItems = JSON.parse(fs.readFileSync(path.join(dir, 'site_products.json'), 'utf-8'));

function matchKey(name) {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const matched = [];
const unmatched = [];
const usedIdx = new Set();

allProducts.forEach(p => {
  const key = matchKey(p.productName);
  // find all site entries whose text contains this key as substring
  const candidates = siteItems.filter(s => s.text.includes(key));
  if (candidates.length === 0) {
    unmatched.push(p.productName);
    return;
  }
  // prefer one not already used by another product (in case of duplicate name collisions), else first
  let chosen = candidates.find(c => !usedIdx.has(c.idx)) || candidates[0];
  usedIdx.add(chosen.idx);
  matched.push({ productName: p.productName, idx: chosen.idx, img: chosen.img, candidateCount: candidates.length });
});

fs.writeFileSync(path.join(dir, 'image_match.json'), JSON.stringify(matched, null, 2));
console.log('Matched:', matched.length, '/ Unmatched:', unmatched.length);
console.log('Unmatched names:', unmatched.join(', '));
