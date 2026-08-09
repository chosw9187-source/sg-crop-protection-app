const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const port = 8934;

http.createServer((req, res) => {
  let filePath = path.join(dir, req.url === '/' ? 'artifact.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath);
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}).listen(port, () => console.log('Serving on http://localhost:' + port));
