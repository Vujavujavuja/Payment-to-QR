import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/site';

/**
 * The app is used standing at a counter holding a bill, often on a bad
 * connection, so installing it to a home screen is a genuine convenience
 * rather than a checkbox.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable id, so changing start_url later does not make browsers treat
    // this as a different app and orphan everyone's installed copy.
    id: '/',
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Falls back left to right. window-controls-overlay and minimal-ui are
    // ignored by browsers that do not know them, so this costs nothing and
    // gives desktop installs a less boxed-in window.
    display_override: ['window-controls-overlay', 'minimal-ui', 'standalone'],
    orientation: 'portrait-primary',
    background_color: '#f6f7f9',
    theme_color: '#0b5fff',
    lang: 'en',
    dir: 'ltr',
    categories: ['finance', 'utilities', 'productivity'],
    icons: [
      // "any" and "maskable" are deliberately separate entries. Declaring one
      // file as both means Android applies its mask to an icon that was not
      // drawn with a safe zone, and clips the artwork.
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    // Android shows a richer install dialog when screenshots are present, and
    // falls back to a bare one when they are not. Both form factors are
    // supplied because it picks by the device asking.
    //
    // Both show a generated code rather than an empty form: the install
    // prompt is where someone decides whether this does anything useful.
    screenshots: [
      {
        src: '/screenshots/mobile.png',
        sizes: '780x1688',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'A payment slip converted into a scannable IPS QR code on a phone',
      },
      {
        src: '/screenshots/desktop.png',
        sizes: '1280x800',
        type: 'image/png',
        form_factor: 'wide',
        label: 'The payment form beside the generated IPS QR code',
      },
    ],
  };
}
