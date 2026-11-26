import { useState, useEffect } from 'react';

/**
 * Tracks window.visualViewport height for iOS Safari, Android Chrome, and standalone PWA.
 * Prevents virtual keyboard from covering the composer or pushing the chat header off-screen.
 */
export const useVisualViewport = (enabled = true) => {
  const [viewportHeight, setViewportHeight] = useState(() => {
    if (typeof window === 'undefined') return null;
    return window.visualViewport ? Math.round(window.visualViewport.height) : window.innerHeight;
  });
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const vv = window.visualViewport;
    const baseHeightRef = { current: window.innerHeight };

    const handleResize = () => {
      const currentH = vv ? Math.round(vv.height) : window.innerHeight;
      if (currentH > baseHeightRef.current) {
        baseHeightRef.current = currentH;
      }
      setViewportHeight(currentH);
      setIsKeyboardOpen(baseHeightRef.current - currentH > 120);

      // Keep iOS Safari from scrolling the fixed/flex header out of view when keyboard opens
      if (vv && vv.offsetTop > 0) {
        window.scrollTo(0, 0);
      }
    };

    handleResize();

    if (vv) {
      vv.addEventListener('resize', handleResize);
      vv.addEventListener('scroll', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (vv) {
        vv.removeEventListener('resize', handleResize);
        vv.removeEventListener('scroll', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, [enabled]);

  return { viewportHeight, isKeyboardOpen };
};

export default useVisualViewport;
