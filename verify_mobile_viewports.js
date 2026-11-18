import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = path.resolve('mobile_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR);
}

// Start preview server
console.log('Starting preview server...');
const previewProc = spawn('npx', ['vite', 'preview', '--port', '4173'], {
  cwd: path.resolve('frontend'),
  stdio: 'pipe',
});

const waitServer = () => new Promise((resolve, reject) => {
  const start = Date.now();
  const check = () => {
    http.get('http://localhost:4173', (res) => {
      resolve();
    }).on('error', () => {
      if (Date.now() - start > 10000) reject(new Error('Server start timed out'));
      else setTimeout(check, 200);
    });
  };
  check();
});

const runScreenshot = (width, height, name) => new Promise((resolve, reject) => {
  const outPath = path.join(SCREENSHOT_DIR, `${name}_${width}x${height}.png`);
  const args = [
    '--headless',
    '--disable-gpu',
    `--window-size=${width},${height}`,
    `--screenshot=${outPath}`,
    'http://localhost:4173'
  ];
  const p = spawn(CHROME_PATH, args);
  p.on('close', (code) => {
    if (code === 0 && fs.existsSync(outPath)) {
      const stats = fs.statSync(outPath);
      console.log(`  ✓ Captured viewport ${width}x${height} -> ${outPath} (${stats.size} bytes)`);
      resolve(outPath);
    } else {
      reject(new Error(`Failed to capture screenshot for ${name} (code ${code})`));
    }
  });
});

async function main() {
  try {
    await waitServer();
    console.log('Preview server ready at http://localhost:4173. Testing mobile viewports:');

    const viewports = [
      { width: 320, height: 568, name: 'iphone_se' },
      { width: 360, height: 640, name: 'android_compact' },
      { width: 375, height: 667, name: 'iphone_8' },
      { width: 390, height: 844, name: 'iphone_14' },
      { width: 414, height: 896, name: 'iphone_plus' },
      { width: 768, height: 1024, name: 'tablet_ipad' },
      { width: 1280, height: 800, name: 'desktop' },
    ];

    for (const vp of viewports) {
      await runScreenshot(vp.width, vp.height, vp.name);
    }

    console.log('\nAll 7 viewport screenshots successfully captured and verified!');
  } finally {
    previewProc.kill();
  }
}

main().catch((err) => {
  console.error(err);
  previewProc.kill();
  process.exit(1);
});
