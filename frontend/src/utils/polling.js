/**
 * Runs callback on an interval, but only while the tab is visible.
 * Fetches immediately when the tab becomes visible again.
 */
export function createVisibilityAwareInterval(callback, delayMs) {
  let intervalId = null;

  const tick = () => {
    if (document.visibilityState === 'visible') {
      callback();
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      callback();
    }
  };

  intervalId = setInterval(tick, delayMs);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
