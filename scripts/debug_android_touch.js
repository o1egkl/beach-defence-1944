const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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

server.listen(4899, async () => {
  console.log('[Server] Listening on http://127.0.0.1:4899');

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=915,412',
    '--user-agent="Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"',
    '--enable-features=TouchEvents',
    '--blink-settings=primaryPointerType=4',
    'about:blank'
  ]);

  // Wait for Chrome CDP port
  await new Promise(r => setTimeout(r, 1200));

  let targets;
  try {
    const jsonRes = await fetch('http://127.0.0.1:9223/json');
    targets = await jsonRes.json();
  } catch (err) {
    console.error('[CDP] Failed to fetch targets:', err);
    chromeProc.kill();
    server.close();
    process.exit(1);
  }

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  console.log('[CDP] Connecting to target:', pageTarget.title, pageTarget.webSocketDebuggerUrl);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 1;
  const pendingRequests = new Map();

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pendingRequests.set(id, { resolve, reject, method });
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

    if (data.method === 'Runtime.consoleAPICalled') {
      const args = data.params.args.map(a => a.value !== undefined ? a.value : (a.description || JSON.stringify(a)));
      console.log(`[Browser Console ${data.params.type}]`, ...args);
    } else if (data.method === 'Runtime.exceptionThrown') {
      console.error('[Browser Exception]', data.params.exceptionDetails);
    }
  };

  ws.onopen = async () => {
    console.log('[CDP] Connected via WebSocket');
    await sendCmd('Runtime.enable');
    await sendCmd('Page.enable');
    await sendCmd('Log.enable');

    console.log('[CDP] Navigating to game...');
    await sendCmd('Page.navigate', { url: 'http://127.0.0.1:4899/index.html' });

    // Wait 2 seconds for initial script and load
    await new Promise(r => setTimeout(r, 2000));

    // Check game state and inspect deploy button
    const inspectRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const deployBtn = document.getElementById('btn-deploy-wave');
          const rect = deployBtn ? deployBtn.getBoundingClientRect() : null;
          const armoryModal = document.getElementById('armory-modal');
          const centerBtnX = rect ? rect.left + rect.width / 2 : 0;
          const centerBtnY = rect ? rect.top + rect.height / 2 : 0;
          const elAtPoint = rect ? document.elementFromPoint(centerBtnX, centerBtnY) : null;
          const cards = document.querySelectorAll('.btn-buy-upgrade').length;

          return {
            mode: typeof state !== 'undefined' ? state.mode : 'undefined',
            score: typeof state !== 'undefined' ? state.score : 'undefined',
            deployBtnExists: !!deployBtn,
            deployBtnRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
            elementFromPoint: elAtPoint ? elAtPoint.outerHTML.slice(0, 150) : null,
            upgradeCardsCount: cards,
            armoryModalClasses: armoryModal ? armoryModal.className : null
          };
        })()
      `,
      returnByValue: true
    });

    console.log('[Game Initial Inspection]:', JSON.stringify(inspectRes.result.value, null, 2));

    const btnInfo = inspectRes.result.value;
    if (!btnInfo.deployBtnRect) {
      console.error('Deploy button rect is null!');
    } else {
      const clickX = Math.round(btnInfo.deployBtnRect.left + btnInfo.deployBtnRect.width / 2);
      const clickY = Math.round(btnInfo.deployBtnRect.top + btnInfo.deployBtnRect.height / 2);
      console.log(`[CDP] Dispatching real touch tap at (${clickX}, ${clickY})...`);

      // 1. Dispatch touchStart
      await sendCmd('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: clickX, y: clickY, id: 0 }]
      });

      await new Promise(r => setTimeout(r, 60));

      // 2. Dispatch touchEnd
      await sendCmd('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });

      console.log('[CDP] Touch events dispatched. Waiting 500ms...');
      await new Promise(r => setTimeout(r, 500));

      // Re-evaluate game state
      const stateAfterTouch = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const armory = document.getElementById('armory-modal');
            const hud = document.getElementById('hud-overlay');
            return {
              mode: typeof state !== 'undefined' ? state.mode : 'undefined',
              isWaveInProgress: typeof state !== 'undefined' ? state.isWaveInProgress : 'undefined',
              armoryHidden: armory ? armory.classList.contains('hidden') : null,
              hudHidden: hud ? hud.classList.contains('hidden') : null
            };
          })()
        `,
        returnByValue: true
      });

      console.log('[Game State After Touch]:', JSON.stringify(stateAfterTouch.result.value, null, 2));

      // Also test a regular click on the button
      console.log('[CDP] Now testing programmatic click on btn-deploy-wave...');
      const clickEval = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btn = document.getElementById('btn-deploy-wave');
            if (btn) btn.click();
            return {
              mode: state.mode,
              isWaveInProgress: state.isWaveInProgress
            };
          })()
        `,
        returnByValue: true
      });
      console.log('[Game State After btn.click()]:', JSON.stringify(clickEval.result.value, null, 2));
    }

    ws.close();
    chromeProc.kill();
    server.close();
    process.exit(0);
  };
});
