/**
 * LYNQO Busy Tracker
 * Ensures active voice recordings, media uploads, and message sends
 * defer PWA service worker reloads and background updates until complete.
 */

export function markBusy() {
  if (typeof window === 'undefined') return () => {};
  window.__lynqoBusyCount = (window.__lynqoBusyCount || 0) + 1;
  let cleared = false;
  return () => {
    if (cleared || typeof window === 'undefined') return;
    cleared = true;
    window.__lynqoBusyCount = Math.max(0, (window.__lynqoBusyCount || 1) - 1);
    if (window.__lynqoBusyCount === 0) {
      window.dispatchEvent(new CustomEvent('lynqo:idle'));
    }
  };
}

export function isBusy() {
  if (typeof window === 'undefined') return false;
  return (window.__lynqoBusyCount || 0) > 0;
}
