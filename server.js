const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  const filePath = '.' + req.url;
  const extname = path.extname(filePath);
  let contentType = 'text/html';

  switch (extname) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    case '.json':
      contentType = 'application/json';
      break;
    case '.png':
      contentType = 'image/png';
      break;
    case '.jpg':
      contentType = 'image/jpg';
      break;
    case '.wav':
      contentType = 'audio/wav';
      break;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code == 'ENOENT') {
        res.writeHead(404);
        res.end('File not found!');
      } else {
        res.writeHead(500);
        res.end('Internal server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data, 'utf-8');
    }
  });
});

const port = 3000;
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});