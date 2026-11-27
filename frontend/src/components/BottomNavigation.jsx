import React, { useRef, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Search, Users, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Chats', path: '/dashboard', icon: MessageSquare },
  { name: 'Find', path: '/find', icon: Search },
  { name: 'Friends', path: '/connections', icon: Users },
  { name: 'Settings', path: '/settings', icon: Settings },
];

const HOLD_DELAY_MS = 160;
const DRAG_THRESHOLD_PX = 6;
const LIFT_SCALE = 1.15;

export const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeIdx = Math.max(
    0,
    NAV_ITEMS.findIndex((item) => location.pathname.startsWith(item.path))
  );

  const navContainerRef = useRef(null);
  const pillRef = useRef(null);
  const itemRefs = useRef([]);
  const suppressClickRef = useRef(false);

  const gestureRef = useRef({
    active: false,
    isLifted: false,
    isDragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startTabIdx: 0,
    tabWidth: 0,
    baseX: 0,
    currentX: 0,
    targetIdx: 0,
    holdTimer: null,
    rafId: null,
  });

  const prefersReducedMotion = useCallback(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const clearHoverHighlight = useCallback(() => {
    itemRefs.current.forEach((el) => {
      if (el) el.removeAttribute('data-liquid-hover');
    });
  }, []);

  const setHoverHighlight = useCallback((idx) => {
    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      if (i === idx) el.setAttribute('data-liquid-hover', 'true');
      else el.removeAttribute('data-liquid-hover');
    });
  }, []);

  const setContainerCompressed = useCallback(
    (compressed) => {
      const container = navContainerRef.current;
      if (!container) return;
      container.style.transition = prefersReducedMotion()
        ? 'none'
        : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)';
      container.style.transform = compressed
        ? 'scale3d(0.985, 0.94, 1)'
        : 'scale3d(1, 1, 1)';
    },
    [prefersReducedMotion]
  );

  const applyPillFrame = useCallback(
    (xPx, lifted, animateTransition) => {
      const pill = pillRef.current;
      if (!pill) return;

      if (animateTransition && !prefersReducedMotion()) {
        pill.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
      } else {
        pill.style.transition = 'none';
      }

      if (lifted) {
        pill.classList.add('liquid-glass-indicator-lifted');
      } else {
        pill.classList.remove('liquid-glass-indicator-lifted');
      }

      const scale = lifted ? LIFT_SCALE : 1;
      pill.style.transform = `translateX(${xPx}px) scale3d(${scale}, ${scale}, 1)`;
    },
    [prefersReducedMotion]
  );

  const snapPillToTab = useCallback(
    (tabIdx) => {
      const pill = pillRef.current;
      if (!pill) return;
      pill.style.transition = prefersReducedMotion()
        ? 'none'
        : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
      pill.classList.remove('liquid-glass-indicator-lifted');
      pill.style.transform = `translateX(${tabIdx * 100}%) scale3d(1, 1, 1)`;
    },
    [prefersReducedMotion]
  );

  // Keep resting pill synced with route changes when not actively dragging
  useEffect(() => {
    if (!gestureRef.current.active) {
      snapPillToTab(activeIdx);
      clearHoverHighlight();
    }
  }, [activeIdx, snapPillToTab, clearHoverHighlight]);

  // Cleanup timers and animation frames on unmount
  useEffect(() => {
    const g = gestureRef.current;
    return () => {
      if (g.holdTimer) clearTimeout(g.holdTimer);
      if (g.rafId) cancelAnimationFrame(g.rafId);
    };
  }, []);

  const enterLiftedState = useCallback(() => {
    const g = gestureRef.current;
    if (!g.active || g.isLifted) return;
    g.isLifted = true;
    setContainerCompressed(true);
    applyPillFrame(g.currentX, true, true);
    setHoverHighlight(g.targetIdx);
  }, [setContainerCompressed, applyPillFrame, setHoverHighlight]);

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const container = navContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const innerWidth = Math.max(1, rect.width - 12);
    const tabWidth = innerWidth / NAV_ITEMS.length;
    const baseX = activeIdx * tabWidth;

    const g = gestureRef.current;
    if (g.holdTimer) clearTimeout(g.holdTimer);
    if (g.rafId) cancelAnimationFrame(g.rafId);

    g.active = true;
    g.isLifted = false;
    g.isDragging = false;
    g.pointerId = e.pointerId;
    g.startX = e.clientX;
    g.startY = e.clientY;
    g.startTabIdx = activeIdx;
    g.tabWidth = tabWidth;
    g.baseX = baseX;
    g.currentX = baseX;
    g.targetIdx = activeIdx;

    // Only capture pointer once hold activates or drag begins so normal taps dispatch click cleanly
    g.holdTimer = setTimeout(() => {
      g.holdTimer = null;
      if (g.active) {
        try {
          container.setPointerCapture?.(g.pointerId);
        } catch {}
        enterLiftedState();
      }
    }, HOLD_DELAY_MS);
  };

  const handlePointerMove = (e) => {
    const g = gestureRef.current;
    if (!g.active || e.pointerId !== g.pointerId) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (!g.isDragging) {
      if (Math.abs(dx) > DRAG_THRESHOLD_PX && Math.abs(dx) >= Math.abs(dy) * 0.8) {
        g.isDragging = true;
        if (g.holdTimer) {
          clearTimeout(g.holdTimer);
          g.holdTimer = null;
        }
        try {
          navContainerRef.current?.setPointerCapture?.(g.pointerId);
        } catch {}
        if (!g.isLifted) {
          g.isLifted = true;
          setContainerCompressed(true);
        }
      } else if (!g.isLifted && Math.abs(dy) > 14) {
        // Vertical scroll intent: cancel hold
        if (g.holdTimer) {
          clearTimeout(g.holdTimer);
          g.holdTimer = null;
        }
        g.active = false;
        return;
      } else {
        return;
      }
    }

    const maxX = (NAV_ITEMS.length - 1) * g.tabWidth;
    const rawX = g.baseX + dx;
    const clampedX = Math.max(0, Math.min(maxX, rawX));

    const nearestIdx = Math.max(
      0,
      Math.min(NAV_ITEMS.length - 1, Math.round(rawX / g.tabWidth))
    );

    g.currentX = clampedX;
    if (nearestIdx !== g.targetIdx) {
      g.targetIdx = nearestIdx;
      setHoverHighlight(nearestIdx);
    }

    if (!g.rafId) {
      g.rafId = requestAnimationFrame(() => {
        g.rafId = null;
        if (g.active && g.isDragging) {
          applyPillFrame(g.currentX, true, false);
        }
      });
    }
  };

  const finishGesture = (cancelled) => {
    const g = gestureRef.current;
    if (!g.active) return;

    if (g.holdTimer) {
      clearTimeout(g.holdTimer);
      g.holdTimer = null;
    }
    if (g.rafId) {
      cancelAnimationFrame(g.rafId);
      g.rafId = null;
    }

    const wasDragging = g.isDragging;
    const wasLifted = g.isLifted;
    const finalIdx = cancelled ? g.startTabIdx : g.targetIdx;

    g.active = false;
    g.isLifted = false;
    g.isDragging = false;

    try {
      if (navContainerRef.current?.hasPointerCapture?.(g.pointerId)) {
        navContainerRef.current.releasePointerCapture(g.pointerId);
      }
    } catch {}

    setContainerCompressed(false);
    clearHoverHighlight();

    if (wasDragging) {
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 60);
    }

    if (wasDragging || wasLifted) {
      snapPillToTab(finalIdx);
    }

    if (!cancelled && wasDragging && finalIdx !== g.startTabIdx) {
      navigate(NAV_ITEMS[finalIdx].path);
    }
  };

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed bottom-3 left-3.5 right-3.5 z-40 md:hidden mb-safe"
    >
      <div
        ref={navContainerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => finishGesture(false)}
        onPointerCancel={() => finishGesture(true)}
        style={{ touchAction: 'pan-y' }}
        className="liquid-glass-nav rounded-[30px] p-1.5 relative grid grid-cols-4 items-center select-none overflow-hidden"
      >
        {/* Interactive Liquid Glass active-tab indicator */}
        <div
          ref={pillRef}
          aria-hidden="true"
          style={{
            width: 'calc((100% - 12px) / 4)',
            transform: `translateX(${activeIdx * 100}%) scale3d(1, 1, 1)`,
          }}
          className="liquid-glass-indicator absolute top-1.5 bottom-1.5 left-1.5 rounded-[24px] motion-reduce:transition-none pointer-events-none will-change-transform"
        />

        {NAV_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              to={item.path}
              draggable={false}
              onClick={(e) => {
                if (suppressClickRef.current) {
                  e.preventDefault();
                }
              }}
              className={({ isActive }) =>
                `liquid-nav-item relative z-10 flex flex-col items-center justify-center min-h-[54px] py-1.5 rounded-[24px] gap-1 text-[12px] font-medium transition-transform duration-150 active:scale-95 ${
                  isActive ? 'text-white font-semibold' : 'text-[#B8ABC7] hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-6 h-6 ${isActive ? 'fill-white/20' : ''}`} />
                  <span className="leading-none">{item.name}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavigation;
