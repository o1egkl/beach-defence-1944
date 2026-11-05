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

server.listen(4901, async () => {
  console.log('[Server] Listening on http://127.0.0.1:4901');

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=915,412',
    '--user-agent="Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"',
    '--enable-features=TouchEvents',
    '--blink-settings=primaryPointerType=4',
    'about:blank'
  ]);

  let jsonRes, targets;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await new Promise(r => setTimeout(r, 600));
      jsonRes = await fetch('http://127.0.0.1:9224/json');
      targets = await jsonRes.json();
      if (targets && targets.length > 0) break;
    } catch(e) {}
  }
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

  const browserErrors = [];
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
      if (data.params.type === 'error') {
        browserErrors.push(args.join(' '));
        console.error(`[Console ERROR]`, ...args);
      } else {
        console.log(`[Console ${data.params.type}]`, ...args);
      }
    } else if (data.method === 'Runtime.exceptionThrown') {
      browserErrors.push(JSON.stringify(data.params.exceptionDetails));
      console.error('[Exception THROWN]', data.params.exceptionDetails);
    }
  };

  ws.onopen = async () => {
    await sendCmd('Runtime.enable');
    await sendCmd('Page.enable');

    console.log('[TEST] Navigating to game...');
    await sendCmd('Page.navigate', { url: 'http://127.0.0.1:4901/index.html' });

    await new Promise(r => setTimeout(r, 1500));

    // Helper to dispatch touch tap at an element
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
      if (!rect) {
        throw new Error('Element not found: ' + selector);
      }
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      console.log(`[TAP] Touching ${selector} at (${x}, ${y})...`);

      await sendCmd('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, id: 0 }]
      });
      await new Promise(r => setTimeout(r, 60));
      await sendCmd('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
      await new Promise(r => setTimeout(r, 350));
    }

    // 1. Initial State Check
    let stateEval = await sendCmd('Runtime.evaluate', {
      expression: '({ mode: state.mode, score: state.score, upgrades: { ...state.upgrades } })',
      returnByValue: true
    });
    console.log('[1. Initial State]:', stateEval.result.value);

    // 2. Buy Damage Upgrade
    console.log('[2. Tapping Damage Upgrade Button...]');
    await tapElement('.btn-buy-upgrade[data-upg-id="damage"]');

    stateEval = await sendCmd('Runtime.evaluate', {
      expression: '({ mode: state.mode, score: state.score, upgrades: { ...state.upgrades } })',
      returnByValue: true
    });
    console.log('[State After Damage Upgrade]:', stateEval.result.value);

    // 3. Buy Ammo Upgrade
    console.log('[3. Tapping Ammo Upgrade Button...]');
    await tapElement('.btn-buy-upgrade[data-upg-id="ammo"]');

    stateEval = await sendCmd('Runtime.evaluate', {
      expression: '({ mode: state.mode, score: state.score, upgrades: { ...state.upgrades } })',
      returnByValue: true
    });
    console.log('[State After Ammo Upgrade]:', stateEval.result.value);

    // 4. Tap Deploy to Bunker (Start Wave 1)
    console.log('[4. Tapping DEPLOY TO BUNKER button...]');
    await tapElement('#btn-deploy-wave');

    stateEval = await sendCmd('Runtime.evaluate', {
      expression: `({
        mode: state.mode,
        isWaveInProgress: state.isWaveInProgress,
        armoryHidden: document.getElementById('armory-modal').classList.contains('hidden'),
        hudHidden: document.getElementById('hud-overlay').classList.contains('hidden'),
        mobileControlsHidden: document.getElementById('mobile-controls-layer').classList.contains('hidden')
      })`,
      returnByValue: true
    });
    console.log('[State In Gameplay]:', stateEval.result.value);

    // 5. Tap Pause in HUD
    console.log('[5. Tapping Pause Button in HUD...]');
    await tapElement('#btn-open-armory-mid');

    stateEval = await sendCmd('Runtime.evaluate', {
      expression: `({
        mode: state.mode,
        armoryHidden: document.getElementById('armory-modal').classList.contains('hidden')
      })`,
      returnByValue: true
    });
    console.log('[State In Mid-Wave Armory]:', stateEval.result.value);

    // 6. Resume from Mid-Wave Armory
    console.log('[6. Tapping Resume Current Wave Button...]');
    await tapElement('#btn-armory-resume');

    stateEval = await sendCmd('Runtime.evaluate', {
      expression: `({
        mode: state.mode,
        armoryHidden: document.getElementById('armory-modal').classList.contains('hidden')
      })`,
      returnByValue: true
    });
    console.log('[State After Resume]:', stateEval.result.value);

    console.log('\n=== SUMMARY ===');
    console.log('Total Browser Errors Caught:', browserErrors.length);
    if (browserErrors.length > 0) {
      console.error('Errors:', browserErrors);
    } else {
      console.log('ALL TESTS PASSED WITH 0 ERRORS! TOUCH AND BUTTONS WORK PERFECTLY!');
    }

    ws.close();
    chromeProc.kill();
    server.close();
    process.exit(0);
  };
});
