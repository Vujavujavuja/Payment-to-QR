import type { Metadata, Viewport } from 'next';
import {
  REPO_URL,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from '@/lib/site';
import { buildStructuredData } from '@/lib/structured-data';
import './globals.css';

export const metadata: Metadata = {
  // Everything relative below — the canonical URL, the Open Graph image —
  // resolves against this. Without it Next emits relative URLs that no
  // crawler or social scraper can follow.
  metadataBase: new URL(SITE_URL),

  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    // Any future page gets the product name appended without repeating it.
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: 'Nemanja Vujic', url: 'https://github.com/Vujavujavuja' }],
  creator: 'Nemanja Vujic',
  category: 'finance',
  alternates: { canonical: '/' },

  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: 'en_US',
    // The app speaks to a Serbian audience even though its copy is English,
    // so Serbian locales are declared as alternates.
    alternateLocale: ['sr_RS'],
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Payment to QR — a payment slip converted into a scannable NBS IPS QR code',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image.png'],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  // Points at the source. For an open source tool this is the single most
  // useful link a machine can find on the page.
  other: { 'repository': REPO_URL },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The page is used one-handed while holding a bill; let people zoom.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Every string below is English. Declaring "sr" made a screen reader
    // pronounce English text with a Serbian voice. Serbian copy is the real
    // fix and is tracked separately; until then the attribute tells the truth.
    <html lang="en">
      <body>
        {/* Structured data. Search engines use it for rich results; answer
            engines use it as an unambiguous statement of what this is, which
            is far easier to quote correctly than prose scraped from markup. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildStructuredData()) }}
        />
        <div className="page">
          <header className="site-header">
            {/* The h1 carries the product name; the line under it carries the
                words people actually search for -- "NBS IPS QR", "payment
                slip" -- so the page ranks for the task, not just the brand. */}
            <h1>Payment to QR</h1>
            <p>
              Turn a Serbian payment slip into a scannable NBS IPS QR code. Snap a bill, check
              the fields, scan to pay.
            </p>
          </header>
          {children}
          <footer className="site-footer">
            Unofficial and open source — not affiliated with the National Bank of Serbia.{' '}
            <a href="https://github.com/Vujavujavuja/Payment-to-QR">Source on GitHub</a>. Always
            confirm the amount and account in your banking app before paying.
          </footer>
        </div>
      </body>
    </html>
  );
}
