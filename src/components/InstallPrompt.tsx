'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** Chrome fires this so a site can choose its own moment to ask. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'p2qr:install-dismissed';

/**
 * True once running in the browser.
 *
 * Everything below reads from window, which does not exist while Next renders
 * this on the server. useSyncExternalStore is the sanctioned way to ask "am I
 * on the client yet" — it gives React a separate server snapshot instead of
 * flipping state from inside an effect and triggering a cascading render.
 */
const subscribeToNothing = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own, non-standard flag for a home screen launch.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, so touch points are the giveaway.
  const ios =
    /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const webkit = /safari/i.test(ua) && !/chrome|crios|fxios|edgios/i.test(ua);
  return ios && webkit;
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    // Private mode and blocked storage both throw. Not being able to remember
    // a dismissal is not a reason to fail.
    return false;
  }
}

/**
 * Offers to install the app.
 *
 * Two paths, because there is no single one. Chrome and Edge fire
 * beforeinstallprompt and hand over a real prompt; Safari fires nothing and
 * has no API at all, so iOS gets the instruction instead — an install button
 * that can never appear is worse than a sentence saying where the control is.
 *
 * Dismissal is remembered. Someone who said no once should not be asked again
 * every time they open a bill.
 */
export function InstallPrompt() {
  const isClient = useIsClient();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Without this Chrome shows its own mini-infobar and the app has no say
      // in when the question gets asked.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // See wasDismissed: storage being unavailable is not fatal.
    }
    setDismissed(true);
    setDeferred(null);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // The event is single use, whatever the answer was.
    setDeferred(null);
  }, [deferred]);

  // Derived during render rather than mirrored into state.
  const suppressed = !isClient || dismissed || isStandalone() || wasDismissed();
  const showIosHint = !suppressed && !deferred && isIosSafari();
  const showInstall = !suppressed && Boolean(deferred);

  if (!showInstall && !showIosHint) return null;

  return (
    <div className="install-bar" role="complementary" aria-label="Install this app">
      <span className="install-text">
        {showInstall ? (
          <>Install it for offline use — a payment code works with no signal.</>
        ) : (
          <>
            Install it: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
          </>
        )}
      </span>
      <span className="install-actions">
        {showInstall && (
          <button type="button" className="button button-primary button-small" onClick={install}>
            Install
          </button>
        )}
        <button
          type="button"
          className="button button-small"
          onClick={dismiss}
          aria-label="Dismiss the install suggestion"
        >
          Not now
        </button>
      </span>
    </div>
  );
}
