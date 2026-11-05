const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

describe('P1 PWA Base Path & Subfolder Hosting Compatibility', () => {
  it('manifest.json uses relative paths for start_url, scope, id and icons', () => {
    const manifestPath = path.join(rootDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.equal(manifest.start_url, './?source=pwa', 'start_url must be relative');
    assert.equal(manifest.id, './?source=pwa', 'id must be relative');
    assert.equal(manifest.scope, './', 'scope must be relative');

    manifest.icons.forEach((icon, idx) => {
      assert.ok(!icon.src.startsWith('/'), `icon[${idx}].src must not start with leading slash`);
      assert.ok(icon.src.startsWith('icons/'), `icon[${idx}].src must point to icons directory`);
    });

    manifest.shortcuts.forEach((sc, idx) => {
      assert.ok(!sc.url.startsWith('/'), `shortcut[${idx}].url must not have leading slash`);
    });
  });

  it('sw.js dynamically derives base path and builds scoped precache list', () => {
    const swPath = path.join(rootDir, 'sw.js');
    const swCode = fs.readFileSync(swPath, 'utf8');

    assert.ok(swCode.includes('getBasePath'), 'sw.js must contain getBasePath logic');
    assert.ok(!swCode.includes("'/index.html'"), 'sw.js must not contain hardcoded /index.html');
    assert.ok(swCode.includes('BASE +'), 'sw.js must prefix assets with BASE');
  });

  it('Simulates scope resolution on GitHub Pages subdirectory vs Vercel root', () => {
    function computeBasePath(pathname) {
      return pathname.substring(0, pathname.lastIndexOf('/') + 1);
    }

    // Vercel / custom domain root hosting
    const vercelBase = computeBasePath('/index.html');
    assert.equal(vercelBase, '/', 'Vercel root base path should be /');

    // GitHub Pages subdirectory hosting
    const ghPagesBase = computeBasePath('/beach-defence-1944/index.html');
    assert.equal(ghPagesBase, '/beach-defence-1944/', 'GitHub Pages base path should match repository subfolder');

    const manifestUrl = new URL('manifest.json', 'https://o1egkl.github.io/beach-defence-1944/').href;
    const resolvedStartUrl = new URL('./?source=pwa', manifestUrl).href;
    assert.equal(resolvedStartUrl, 'https://o1egkl.github.io/beach-defence-1944/?source=pwa');
  });
});
