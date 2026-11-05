const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const artifactDir = 'D:\\Users\\o1egk\\.gemini\\antigravity\\brain\\7d631b2b-c3c3-4a7d-8f7a-ee42f5a38579';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const menuImg = path.join(artifactDir, 'verified_android_menu.png');
const upgradedImg = path.join(artifactDir, 'verified_android_upgraded.png');
const gameplayImg = path.join(artifactDir, 'verified_android_gameplay.png');
const pauseImg = path.join(artifactDir, 'verified_android_pause.png');

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
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(absPath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(4902, async () => {
  console.log('[Server] Listening on http://127.0.0.1:4902');

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9225',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=915,412',
    '--user-agent="Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"',
    '--enable-features=TouchEvents',
    '--blink-settings=primaryPointerType=4',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 1200));

  const jsonRes = await fetch('http://127.0.0.1:9225/json');
  const targets = await jsonRes.json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 1;
  const pendingRequests = new Map();

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
      return;
    }
  };

  async function takeScreenshot(filePath) {
    const res = await sendCmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log('[Screenshot Saved]:', filePath, fs.statSync(filePath).size, 'bytes');
  }

  async function tapElement(selector) {
    const evalRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const el = document.querySelector('${selector}');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        })()
      `,
      returnByValue: true
    });
    const rect = evalRes.result.value;
    if (!rect) throw new Error('Element not found: ' + selector);
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);

    await sendCmd('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 0 }]
    });
    await new Promise(r => setTimeout(r, 60));
    await sendCmd('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await new Promise(r => setTimeout(r, 300));
  }

  ws.onopen = async () => {
    await sendCmd('Runtime.enable');
    await sendCmd('Page.enable');

    console.log('[CDP] Navigating to game...');
    await sendCmd('Page.navigate', { url: 'http://127.0.0.1:4902/index.html' });

    // Enable touch controls
    await sendCmd('Runtime.evaluate', {
      expression: 'if (typeof mobileControls !== "undefined") { mobileControls.enabled = true; }'
    });

    await new Promise(r => setTimeout(r, 1200));

    // 1. Capture Initial Menu
    console.log('[1/4] Capturing Initial Menu...');
    await takeScreenshot(menuImg);

    // 2. Tap Damage Upgrade
    console.log('[2/4] Tapping Damage Upgrade...');
    await tapElement('.btn-buy-upgrade[data-upg-id="damage"]');
    await takeScreenshot(upgradedImg);

    // 3. Tap Deploy to Bunker
    console.log('[3/4] Tapping DEPLOY TO BUNKER button...');
    await tapElement('#btn-deploy-wave');
    await sendCmd('Runtime.evaluate', {
      expression: 'if (typeof mobileControls !== "undefined") { mobileControls.enabled = true; updateMobileControlsVisibility(); }'
    });
    await new Promise(r => setTimeout(r, 1200));
    await takeScreenshot(gameplayImg);

    // 4. Tap Pause
    console.log('[4/4] Tapping Pause...');
    await sendCmd('Runtime.evaluate', { expression: 'pauseGame();' });
    await new Promise(r => setTimeout(r, 400));
    await takeScreenshot(pauseImg);

    console.log('[COMPLETE] All screenshots captured successfully!');
    ws.close();
    chromeProc.kill();
    server.close();
    process.exit(0);
  };
});
