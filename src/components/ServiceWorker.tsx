'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Production only. In development the bundle changes on every keystroke and a
 * worker sitting in front of it turns "my edit did not apply" into a routine
 * event, which costs more than offline support in dev is worth.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    // After load, so registration never competes with the first render for
    // bandwidth on the slow connection this is meant to help with.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        // Not fatal: the app works fully without it, just not offline.
        console.warn('[sw] registration failed', error);
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
