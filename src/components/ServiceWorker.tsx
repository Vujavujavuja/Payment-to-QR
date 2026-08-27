'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Registers the service worker and surfaces an update when one is ready.
 *
 * Production only. In development the bundle changes on every keystroke and a
 * worker sitting in front of it turns "my edit did not apply" into a routine
 * event, which costs more than offline support in dev is worth.
 *
 * The worker does not activate itself. It waits here, and swaps only when the
 * user asks — a version changing underneath someone who is halfway through
 * checking a payment is exactly the surprise this app should not spring.
 */
export function ServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    const watch = (registration: ServiceWorkerRegistration) => {
      // Already waiting when the page loaded.
      if (registration.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // A worker reaching "installed" while another controls the page is
          // an update. Without a controller it is simply the first install.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            if (!cancelled) setWaiting(installing);
          }
        });
      });
    };

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          if (!cancelled) watch(registration);
        })
        .catch((error) => {
          // Not fatal: the app works fully without it, just not offline.
          console.warn('[sw] registration failed', error);
        });
    };

    // After load, so registration never competes with the first render for
    // bandwidth on the slow connection this is meant to help with.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    // The new worker taking control is the signal that the swap is done.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      cancelled = true;
      window.removeEventListener('load', register);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const update = useCallback(() => {
    waiting?.postMessage({ type: 'SKIP_WAITING' });
  }, [waiting]);

  if (!waiting) return null;

  return (
    <div className="install-bar" role="status" aria-live="polite">
      <span className="install-text">A new version is ready.</span>
      <span className="install-actions">
        <button type="button" className="button button-primary button-small" onClick={update}>
          Reload
        </button>
        <button
          type="button"
          className="button button-small"
          onClick={() => setWaiting(null)}
          aria-label="Keep using the current version"
        >
          Later
        </button>
      </span>
    </div>
  );
}
