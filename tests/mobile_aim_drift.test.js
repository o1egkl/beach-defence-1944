const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

describe('Mobile Aim Drift & Bunker Aperture CDP Verification', () => {
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

    await new Promise(r => server.listen(4925, r));

    chromeProc = spawn(chromePath, [
      '--headless=new',
      '--remote-debugging-port=9245',
      '--no-sandbox',
      '--disable-gpu',
      '--window-size=915,412',
      '--user-agent="Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"',
      '--enable-features=TouchEvents',
      'about:blank'
    ]);

    let targets;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await new Promise(r => setTimeout(r, 600));
        const res = await fetch('http://127.0.0.1:9245/json');
        targets = await res.json();
        if (targets && targets.length > 0) break;
      } catch (e) {}
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

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    await sendCmd('Runtime.enable');
    await sendCmd('Page.enable');
    await sendCmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await sendCmd('Page.navigate', { url: 'http://127.0.0.1:4925/index.html' });

    // Wait for engine state
    for (let i = 0; i < 20; i++) {
      try {
        const ready = await evalInPage("typeof state !== 'undefined' && state.mode !== undefined");
        if (ready) break;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 300));
    }
  });

  after(async () => {
    if (ws) ws.close();
    if (chromeProc) chromeProc.kill();
    if (server) server.close();
  });

  it('Wave deployment cleanly centers aim and resets joystick state', async () => {
    await evalInPage("document.getElementById('btn-deploy-wave').click()");
    await new Promise(r => setTimeout(r, 600));

    const aimState = await evalInPage(`
      (() => ({
        mode: state.mode,
        mouseNDCY: state.mouseNDC.y,
        mouseNDCX: state.mouseNDC.x,
        aimYaw: state.aimYaw,
        aimPitch: state.aimPitch,
        activePointerId: mobileControls.activePointerId,
        deltaX: mobileControls.delta.x,
        deltaY: mobileControls.delta.y
      }))()
    `);

    assert.equal(aimState.mode, 'PLAYING');
    assert.equal(aimState.mouseNDCX, 0);
    assert.equal(aimState.mouseNDCY, 0);
    assert.equal(aimState.aimYaw, 0);
    assert.equal(aimState.deltaX, 0);
    assert.equal(aimState.deltaY, 0);
  });

  it('Touch-down on virtual joystick has ZERO initial deflection and does not drift', async () => {
    // Dispatch touch down near the bottom of the left quadrant
    await evalInPage(`
      (() => {
        const zone = document.getElementById('mobile-aim-zone') || document.getElementById('mobile-joystick-base');
        const pDown = new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 99,
          pointerType: 'touch',
          clientX: 80,
          clientY: 360
        });
        zone.dispatchEvent(pDown);
      })()
    `);

    // Wait 500ms while finger rests without movement
    await new Promise(r => setTimeout(r, 500));

    const restingState = await evalInPage(`
      (() => ({
        mouseNDCY: state.mouseNDC.y,
        deltaY: mobileControls.delta.y,
        smoothDeltaY: mobileControls.smoothDelta.y
      }))()
    `);

    assert.equal(restingState.deltaY, 0, 'Resting thumb must have 0 delta');
    assert.equal(restingState.smoothDeltaY, 0, 'Resting thumb must have 0 smooth delta');
    assert.equal(restingState.mouseNDCY, 0, 'Crosshair must not drift downward while resting');
  });

  it('Maximum downward pan is strictly clamped above -0.36 and never reaches lower concrete sill (-0.58)', async () => {
    // Drag down to maximum deflection
    await evalInPage(`
      (() => {
        const zone = document.getElementById('mobile-aim-zone') || document.getElementById('mobile-joystick-base');
        const pMove = new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          pointerId: 99,
          pointerType: 'touch',
          clientX: 80,
          clientY: 440
        });
        zone.dispatchEvent(pMove);
      })()
    `);

    // Let it pan for 1 second
    await new Promise(r => setTimeout(r, 1000));

    const clampedState = await evalInPage(`
      (() => ({
        mouseNDCY: +state.mouseNDC.y.toFixed(4),
        camRotX: +camera.rotation.x.toFixed(4)
      }))()
    `);

    assert.ok(clampedState.mouseNDCY >= -0.35, `mouseNDC.y (${clampedState.mouseNDCY}) must be >= -0.35 to clear concrete wall`);
    assert.ok(clampedState.camRotX > -0.18, `camRotX (${clampedState.camRotX}) must not pitch into bunker floor`);

    // Release touch
    await evalInPage(`
      (() => {
        const zone = document.getElementById('mobile-aim-zone') || document.getElementById('mobile-joystick-base');
        const pUp = new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId: 99,
          pointerType: 'touch',
          clientX: 80,
          clientY: 440
        });
        zone.dispatchEvent(pUp);
      })()
    `);
  });
});
