import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compressImageFile } from '../utils/imageUtils.js';

test('Phase 2 Bundle & Fonts: index.css has no render-blocking @import url(...) and includes offscreen message optimization', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
  assert.equal(css.includes('@import url('), false);
  assert.equal(css.includes('.message-row-opt'), true);
  assert.equal(css.includes('content-visibility: auto'), true);
});

test('Phase 2 Bundle: ToastContext and Modal do not import framer-motion eagerly', () => {
  const toastSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/context/ToastContext.jsx'), 'utf8');
  const modalSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Modal.jsx'), 'utf8');
  assert.equal(toastSrc.includes('framer-motion'), false);
  assert.equal(modalSrc.includes('framer-motion'), false);
});

test('Phase 2 Touch & Voice: SwipeableMessageItem and VoiceMessage use React.memo and ref-based DOM updates', () => {
  const swipeSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SwipeableMessageItem.jsx'), 'utf8');
  const voiceSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/VoiceMessage.jsx'), 'utf8');

  assert.equal(swipeSrc.includes('React.memo'), true);
  assert.equal(swipeSrc.includes('requestAnimationFrame'), true);
  assert.equal(swipeSrc.includes('setOffsetX'), false);

  assert.equal(voiceSrc.includes('React.memo'), true);
  assert.equal(voiceSrc.includes('progressOverlayRef'), true);
  assert.equal(voiceSrc.includes('clipPath'), true);
});

test('Phase 2 Image: compressImageFile skips small files safely without errors', async () => {
  const smallFile = new File([new Uint8Array(1024)], 'tiny.jpg', { type: 'image/jpeg' });
  const res = await compressImageFile(smallFile, { maxDimension: 1600, quality: 0.82 });
  assert.equal(res.file, smallFile);
  assert.equal(res.compressed, false);
});

test('Phase 2 GPU: MainLayout and Login do not use expensive blur-[150px] ambient layers', () => {
  const layoutSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/layouts/MainLayout.jsx'), 'utf8');
  const loginSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Login.jsx'), 'utf8');
  assert.equal(layoutSrc.includes('blur-[150px]'), false);
  assert.equal(loginSrc.includes('blur-[150px]'), false);
});
