const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const artifactDir = 'D:\\Users\\o1egk\\.gemini\\antigravity\\brain\\7d631b2b-c3c3-4a7d-8f7a-ee42f5a38579';
const menuScreenshotPath = path.join(artifactDir, 'real_android_menu.png');
const gameplayScreenshotPath = path.join(artifactDir, 'real_android_gameplay.png');
const pauseScreenshotPath = path.join(artifactDir, 'real_android_pause.png');

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
  const isAutostart = req.url.includes('autostart=1');
  const isPause = req.url.includes('pause=1');

  if (urlPath === '/' || urlPath === '/index.html') {
    let content = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    if (isAutostart) {
      const inject = `
        <script>
          window.addEventListener('load', () => {
            setTimeout(() => {
              console.log('[AUTOSTART] Starting wave directly...');
              if (typeof startWave === 'function') {
                startWave(0);
              } else {
                const btn = document.getElementById('btn-deploy-wave');
                if (btn) btn.click();
              }
            }, 800);
          });
        </script>
      </body>`;
      content = content.replace('</body>', inject);
    } else if (isPause) {
      const inject = `
        <script>
          window.addEventListener('load', () => {
            setTimeout(() => {
              if (typeof startWave === 'function') startWave(0);
              setTimeout(() => {
                if (typeof pauseGame === 'function') pauseGame();
              }, 600);
            }, 800);
          });
        </script>
      </body>`;
      content = content.replace('</body>', inject);
    }
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

server.listen(4898, () => {
  console.log('Capture Server listening on http://127.0.0.1:4898');

  // Common Chrome flags for realistic Pixel 7 / Galaxy S24 Android landscape emulation
  const baseFlags = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=915,412',
    '--user-agent="Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"',
    '--enable-features=TouchEvents',
    '--blink-settings=primaryPointerType=4' // Touch pointer
  ];

  // 1. Capture Menu
  execFile(chromePath, [...baseFlags, '--virtual-time-budget=2000', `--screenshot=${menuScreenshotPath}`, 'http://127.0.0.1:4898'], () => {
    console.log('[OK] real_android_menu.png captured:', fs.statSync(menuScreenshotPath).size, 'bytes');

    // 2. Capture Gameplay with Virtual Controls & 3D scene
    execFile(chromePath, [...baseFlags, '--virtual-time-budget=4000', `--screenshot=${gameplayScreenshotPath}`, 'http://127.0.0.1:4898/?autostart=1'], () => {
      console.log('[OK] real_android_gameplay.png captured:', fs.statSync(gameplayScreenshotPath).size, 'bytes');

      // 3. Capture Pause Modal
      execFile(chromePath, [...baseFlags, '--virtual-time-budget=4000', `--screenshot=${pauseScreenshotPath}`, 'http://127.0.0.1:4898/?pause=1'], () => {
        console.log('[OK] real_android_pause.png captured:', fs.statSync(pauseScreenshotPath).size, 'bytes');
        server.close();
        console.log('ALL SCREENSHOTS CAPTURED CLEANLY!');
        process.exit(0);
      });
    });
  });
});
