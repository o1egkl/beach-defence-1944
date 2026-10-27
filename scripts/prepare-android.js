const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const wwwDir = path.join(rootDir, 'www');

console.log('[Android] Preparing www directory for Capacitor packaging...');

if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir, { recursive: true });

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    fs.copyFileSync(src, dest);
  }
}

// Assets to bundle in www
const assetsToCopy = [
  'index.html',
  'manifest.json',
  'sw.js',
  'favicon.ico',
  'favicon.png',
  'lib',
  'models',
  'icons'
];

assetsToCopy.forEach((asset) => {
  const srcPath = path.join(rootDir, asset);
  const destPath = path.join(wwwDir, asset);
  if (fs.existsSync(srcPath)) {
    console.log(`[Android] Copying ${asset}...`);
    copyRecursiveSync(srcPath, destPath);
  } else {
    console.warn(`[Android] Warning: Asset ${asset} does not exist at ${srcPath}`);
  }
});

// Sync custom app icons to Android mipmap resource directories
const mipmapDirs = [
  'mipmap-mdpi',
  'mipmap-hdpi',
  'mipmap-xhdpi',
  'mipmap-xxhdpi',
  'mipmap-xxxhdpi'
];
const iconSrc = path.join(rootDir, 'icons', 'icon-192.png');
const resDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');

if (fs.existsSync(iconSrc) && fs.existsSync(resDir)) {
  console.log('[Android] Updating launcher icons with custom game icon...');
  mipmapDirs.forEach((mDir) => {
    const targetDir = path.join(resDir, mDir);
    if (fs.existsSync(targetDir)) {
      fs.copyFileSync(iconSrc, path.join(targetDir, 'ic_launcher.png'));
      fs.copyFileSync(iconSrc, path.join(targetDir, 'ic_launcher_round.png'));
      fs.copyFileSync(iconSrc, path.join(targetDir, 'ic_launcher_foreground.png'));
    }
  });
}

console.log('[Android] www asset preparation complete!');
