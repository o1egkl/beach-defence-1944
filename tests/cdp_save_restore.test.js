const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

describe('Live Browser Campaign Save & Restore CDP Verification', () => {
  let server, chromeProc, ws;
  let msgId = 1;
  const pendingRequests = new Map();

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evalInPage(expression) {
    const res = await sendCmd('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text + ': ' + (res.exceptionDetails.exception ? res.exceptionDetails.exception.description : ''));
    }
    return res.result ? res.result.value : undefined;
  }

  before(async () => {
    server = http.createServer((req, res) => {
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
        fs.createReadStream(absPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise(r => server.listen(4918, r));

    chromeProc = spawn(chromePath, [
      '--headless=new',
      '--remote-debugging-port=9238',
      '--no-sandbox',
      '--window-size=915,412',
      'about:blank'
    ]);

    let jsonRes, targets;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        await new Promise(r => setTimeout(r, 600));
        jsonRes = await fetch('http://127.0.0.1:9238/json');
        targets = await jsonRes.json();
        if (targets && targets.length > 0) break;
      } catch(e) {}
    }

    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pendingRequests.has(data.id)) {
        const { resolve, reject } = pendingRequests.get(data.id);
        pendingRequests.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };

    await new Promise(r => ws.onopen = r);
    await sendCmd('Runtime.enable');
    await sendCmd('Page.enable');
    await sendCmd('Page.navigate', { url: 'http://127.0.0.1:4918/index.html' });
    await new Promise(r => setTimeout(r, 1500));
  });

  after(() => {
    if (ws) ws.close();
    if (chromeProc) chromeProc.kill();
    if (server) server.close();
  });

  it('Saves campaign state to localStorage on upgrade purchase', async () => {
    // Clear storage first
    await evalInPage('clearCampaignProgress();');

    // Simulate buying Damage upgrade (Lv 0 -> Lv 1)
    await evalInPage(`
      (() => {
        state.score = 800;
        state.upgrades.damage = 1;
        state.waveIndex = 2; // Wave 3
        saveCampaignProgress();
      })()
    `);

    const rawSave = await evalInPage("localStorage.getItem('pacific_defence_save_v1');");
    assert.ok(rawSave !== null, 'Save must exist in localStorage');
    const parsed = JSON.parse(rawSave);
    assert.equal(parsed.waveIndex, 2);
    assert.equal(parsed.score, 800);
    assert.equal(parsed.upgrades.damage, 1);
  });

  async function waitForState() {
    for (let i = 0; i < 25; i++) {
      try {
        const ok = await evalInPage("typeof state !== 'undefined' && state !== null");
        if (ok) return;
      } catch(e) {}
      await new Promise(r => setTimeout(r, 200));
    }
  }

  it('Reloading page automatically restores saved campaign state', async () => {
    // Reload page
    await sendCmd('Page.reload');
    await waitForState();

    const restored = await evalInPage(`
      (() => {
        return {
          waveIndex: state.waveIndex,
          score: state.score,
          damage: state.upgrades.damage
        };
      })()
    `);

    assert.equal(restored.waveIndex, 2, 'Restored wave index should be 2');
    assert.equal(restored.score, 800, 'Restored score should be 800');
    assert.equal(restored.damage, 1, 'Restored damage upgrade should be 1');
  });

  it('Corrupted save data is ignored and defaults to clean start without crashing', async () => {
    await evalInPage("localStorage.setItem('pacific_defence_save_v1', '{corrupt-json!!!');");
    await sendCmd('Page.reload');
    await waitForState();
    await new Promise(r => setTimeout(r, 1500));

    const stateCheck = await evalInPage(`
      (() => {
        return {
          mode: state.mode,
          hasArmory: !!document.getElementById('armory-modal')
        };
      })()
    `);

    assert.equal(stateCheck.mode, 'ARMORY');
    assert.equal(stateCheck.hasArmory, true);
  });
});
