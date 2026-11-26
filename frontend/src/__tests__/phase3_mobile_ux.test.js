import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Phase 3 Design System & Overflow: CSS variables, 16px mobile inputs, overflow-x: clip, and reduced motion', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
  assert.equal(css.includes('--lynqo-bg: #080C14'), true);
  assert.equal(css.includes('--lynqo-surface: #111827'), true);
  assert.equal(css.includes('--lynqo-received: #1E293B'), true);
  assert.equal(css.includes('--lynqo-accent: #7957F5'), true);
  assert.equal(css.includes('--lynqo-accent-secondary: #F472B6'), true);
  assert.equal(css.includes('overflow-x: clip'), true);
  assert.equal(css.includes('font-size: 16px'), true);
  assert.equal(css.includes('prefers-reduced-motion: reduce'), true);
});

test('Phase 3 Viewport & Keyboard: useVisualViewport tracks visualViewport and MainLayout applies dynamic height', () => {
  const vvHook = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useVisualViewport.js'), 'utf8');
  const mainLayout = fs.readFileSync(path.resolve(process.cwd(), 'src/layouts/MainLayout.jsx'), 'utf8');

  assert.equal(vvHook.includes('window.visualViewport'), true);
  assert.equal(vvHook.includes('window.scrollTo(0, 0)'), true);
  assert.equal(mainLayout.includes('useVisualViewport(isChatRoute)'), true);
  assert.equal(mainLayout.includes('overflow-x-clip'), true);
});

test('Phase 3 Composer & Bubbles: auto-expanding textarea, message grouping, and URL word wrapping', () => {
  const composer = fs.readFileSync(path.resolve(process.cwd(), 'src/components/chat/MessageComposer.jsx'), 'utf8');
  const msgList = fs.readFileSync(path.resolve(process.cwd(), 'src/components/chat/MessageList.jsx'), 'utf8');
  const swipeItem = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SwipeableMessageItem.jsx'), 'utf8');

  assert.equal(composer.includes('Math.min(el.scrollHeight, 120)'), true);
  assert.equal(composer.includes('pb-safe'), true);
  assert.equal(msgList.includes('isFirstInGroup={!sameAsPrev}'), true);
  assert.equal(msgList.includes('isLastInGroup={!sameAsNext}'), true);
  assert.equal(swipeItem.includes('[overflow-wrap:anywhere]'), true);
  assert.equal(swipeItem.includes('onPointerCancel={handlePointerEnd}'), true);
});

test('Phase 3 Long-Press, Scroll Anchoring & PWA: Chat.jsx and sw.js preserve reliability and immediate updates', () => {
  const chat = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Chat.jsx'), 'utf8');
  const sw = fs.readFileSync(path.resolve(process.cwd(), 'src/sw.js'), 'utf8');
  const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');

  assert.equal(chat.includes('handleTouchStart'), true);
  assert.equal(chat.includes('oldScrollHeight'), true);
  assert.equal(sw.includes('self.skipWaiting()'), true);
  assert.equal(sw.includes('self.clients.claim()'), true);
  assert.equal(html.includes('apple-mobile-web-app-capable'), true);
  assert.equal(html.includes('viewport-fit=cover'), true);
});
