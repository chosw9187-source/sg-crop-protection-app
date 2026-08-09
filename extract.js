const fs = require('fs');
const path = require('path');

async function extract(pdfPath, outPath) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data });
  const doc = await loadingTask.promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Group by y position roughly to preserve lines
    const items = content.items.map(it => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
    }));
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    let lines = [];
    let curY = null;
    let curLine = [];
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) > 3) {
        if (curLine.length) lines.push(curLine);
        curLine = [it];
        curY = it.y;
      } else {
        curLine.push(it);
      }
    }
    if (curLine.length) lines.push(curLine);
    const pageText = lines.map(line => line.sort((a,b)=>a.x-b.x).map(it=>it.str).join(' ')).join('\n');
    out += `\n===== PAGE ${i} =====\n` + pageText + '\n';
  }
  fs.writeFileSync(outPath, out, 'utf-8');
  console.log(`Extracted ${doc.numPages} pages -> ${outPath}`);
}

const [,, pdfPath, outPath] = process.argv;
extract(pdfPath, outPath).catch(e => { console.error(e); process.exit(1); });
