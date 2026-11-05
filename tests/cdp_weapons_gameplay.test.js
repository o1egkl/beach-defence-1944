const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

describe('Live Browser Weapon & Reload CDP Verification', () => {
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

    await new Promise(r => server.listen(4915, r));

    chromeProc = spawn(chromePath, [
      '--headless=new',
      '--remote-debugging-port=9235',
      '--no-sandbox',
      '--window-size=915,412',
      'about:blank'
    ]);

    let jsonRes, targets;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        await new Promise(r => setTimeout(r, 600));
        jsonRes = await fetch('http://127.0.0.1:9235/json');
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
    await sendCmd('Page.navigate', { url: 'http://127.0.0.1:4915/index.html' });
    await new Promise(r => setTimeout(r, 1500));

    // Start wave 1
    await evalInPage('startWave(0);');
    await new Promise(r => setTimeout(r, 500));
  });

  after(() => {
    if (ws) ws.close();
    if (chromeProc) chromeProc.kill();
    if (server) server.close();
  });

  it('Verifies initial weapon magazines and reserves in live engine', async () => {
    const stats = await evalInPage(`
      (() => {
        return {
          mode: state.mode,
          w1: { cur: state.weapons[1].curAmmo, clip: state.weapons[1].clipSize, res: state.weapons[1].reserveAmmo },
          w2: { cur: state.weapons[2].curAmmo, clip: state.weapons[2].clipSize, res: state.weapons[2].reserveAmmo },
          w3: { cur: state.weapons[3].curAmmo, clip: state.weapons[3].clipSize, res: state.weapons[3].reserveAmmo }
        };
      })()
    `);

    assert.equal(stats.mode, 'PLAYING');
    assert.equal(stats.w1.cur, 45);
    assert.equal(stats.w1.clip, 45);
    assert.equal(stats.w2.cur, 4);
    assert.equal(stats.w2.clip, 4);
    assert.equal(stats.w2.res, 20); // total 24
    assert.equal(stats.w3.cur, 2);
    assert.equal(stats.w3.clip, 2);
    assert.equal(stats.w3.res, 8); // total 10
  });

  it('Fires 75mm Cannon, tests fire delay, and verifies reload replenishes ammo', async () => {
    // Select cannon (slot 2)
    await evalInPage('selectWeapon(2);');
    const selected = await evalInPage('state.selectedWeapon');
    assert.equal(selected, 2);

    // Fire cannon once
    await evalInPage('fireCannon(10.0);');
    let w2 = await evalInPage('({ cur: state.weapons[2].curAmmo, res: state.weapons[2].reserveAmmo, reloading: state.weapons[2].isReloading })');
    assert.equal(w2.cur, 3, 'Cur ammo should decrease by 1');
    assert.equal(w2.res, 20, 'Reserve should not change until reload');
    assert.equal(w2.reloading, false);

    // Press R to trigger reload
    const reloadTriggered = await evalInPage('startWeaponReload(2, false);');
    assert.equal(reloadTriggered, true, 'Reload should start');

    w2 = await evalInPage('({ reloading: state.weapons[2].isReloading, timer: state.weapons[2].reloadTimer })');
    assert.equal(w2.reloading, true);
    assert.ok(w2.timer > 0);

    // Fast-forward reload timer in engine
    await evalInPage(`
      state.weapons[2].reloadTimer = 0.01;
    `);
    await new Promise(r => setTimeout(r, 100));

    w2 = await evalInPage('({ cur: state.weapons[2].curAmmo, res: state.weapons[2].reserveAmmo, reloading: state.weapons[2].isReloading })');
    assert.equal(w2.cur, 4, 'Cannon magazine must be replenished to 4');
    assert.equal(w2.res, 19, 'Reserve must be deducted by 1 shell');
    assert.equal(w2.reloading, false);
  });

  it('Verifies Rocket Launcher auto-reload when magazine reaches 0', async () => {
    await evalInPage('selectWeapon(3);');
    // Fire 2 rockets
    await evalInPage('state.weapons[3].lastShotTime = -999; fireRocket(20.0);');
    await evalInPage('state.weapons[3].lastShotTime = -999; fireRocket(30.0);');

    let w3 = await evalInPage('({ cur: state.weapons[3].curAmmo, res: state.weapons[3].reserveAmmo, reloading: state.weapons[3].isReloading })');
    assert.equal(w3.cur, 0);
    assert.equal(w3.reloading, true, 'Depleted magazine should auto-trigger reload');

    // Complete reload
    await evalInPage('state.weapons[3].reloadTimer = 0.01;');
    await new Promise(r => setTimeout(r, 100));

    w3 = await evalInPage('({ cur: state.weapons[3].curAmmo, res: state.weapons[3].reserveAmmo, reloading: state.weapons[3].isReloading })');
    assert.equal(w3.cur, 2, 'Rockets reloaded to 2');
    assert.equal(w3.res, 6, 'Reserve deducted by 2');
  });

  it('Verifies empty reserve stops reload and prevents negative ammo', async () => {
    await evalInPage(`
      state.weapons[2].curAmmo = 0;
      state.weapons[2].reserveAmmo = 0;
      state.weapons[2].isReloading = false;
    `);

    const canReload = await evalInPage('startWeaponReload(2, false);');
    assert.equal(canReload, false, 'Cannot reload with 0 reserve');

    const w2 = await evalInPage('({ cur: state.weapons[2].curAmmo, res: state.weapons[2].reserveAmmo })');
    assert.equal(w2.cur, 0);
    assert.equal(w2.res, 0);
  });
});
