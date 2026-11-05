const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '/index.html') {
    const content = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
    return;
  }
  const relPath = urlPath.replace(/^\//, '');
  const absPath = path.join(rootDir, relPath);
  if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
    const ext = path.extname(absPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(absPath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(4905, async () => {
  const chromeProc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--no-sandbox',
    '--window-size=915,412',
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 1200));
  const jsonRes = await fetch('http://127.0.0.1:9227/json');
  const targets = await jsonRes.json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let id = 1;
  const send = (method, params = {}) => new Promise(res => {
    const curId = id++;
    const handler = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        res(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  ws.onopen = async () => {
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:4905/index.html' });
    await new Promise(r => setTimeout(r, 2000));
    const evalRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const modal = document.querySelector('#armory-modal');
          const dialog = modal.firstElementChild;
          const banner = dialog.children[0];
          const body = dialog.children[1];
          const footer = dialog.children[2];
          const leftCol = body.querySelector('.lg\\\\:col-span-5');
          const rightCol = body.querySelector('.lg\\\\:col-span-7');
          const cardsGrid = document.querySelector('#upgrade-cards-grid');
          return {
            windowInnerHeight: window.innerHeight,
            modalHeight: modal.clientHeight,
            dialogHeight: dialog.clientHeight,
            bannerHeight: banner.offsetHeight,
            bodyClientHeight: body.clientHeight,
            bodyScrollHeight: body.scrollHeight,
            footerHeight: footer.offsetHeight,
            leftColHeight: leftCol ? leftCol.offsetHeight : 0,
            rightColHeight: rightCol ? rightCol.offsetHeight : 0,
            cardsGridHeight: cardsGrid ? cardsGrid.offsetHeight : 0,
            cardHeights: cardsGrid ? Array.from(cardsGrid.children).map(c => c.offsetHeight) : []
          };
        })()
      `,
      returnByValue: true
    });
    console.log('EVAL RES:', JSON.stringify(evalRes, null, 2));
    console.log('MEASUREMENTS:', JSON.stringify(evalRes.result.value, null, 2));
    ws.close();
    chromeProc.kill();
    server.close();
    process.exit(0);
  };
});
