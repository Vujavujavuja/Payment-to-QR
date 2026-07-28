import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IPS QR generator',
  description:
    'Open source NBS IPS QR code generator. Photograph a payment slip and get a scannable IPS QR code.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The page is used one-handed while holding a bill; let people zoom.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr">
      <body>
        <div className="page">
          <header className="site-header">
            <h1>IPS QR generator</h1>
            <p>Snap a bill, check the fields, scan to pay.</p>
          </header>
          {children}
          <footer className="site-footer">
            Unofficial and open source — not affiliated with the National Bank of Serbia.{' '}
            <a href="https://github.com/Vujavujavuja/open-nbs-ips-qr">Source on GitHub</a>. Always
            confirm the amount and account in your banking app before paying.
          </footer>
        </div>
      </body>
    </html>
  );
}
