'use client';

import { useEffect, useState } from 'react';
import { encodePayment } from '@/core/encode';
import { renderPayloadToDataUrl, renderPayloadToSvg } from '@/core/qr';
import type { IpsPayment } from '@/core/types';

interface Props {
  payment: IpsPayment;
  /** False when validation found errors — we refuse to render a bad code. */
  enabled: boolean;
}

function download(filename: string, href: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
}

export function QrPreview({ payment, enabled }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [payload, setPayload] = useState('');
  const [overLength, setOverLength] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDataUrl(null);
      setPayload('');
      return;
    }

    // The form re-renders on every keystroke; a stale async render arriving
    // late would otherwise paint a QR for an older payment.
    let cancelled = false;
    const encoded = encodePayment(payment);
    setPayload(encoded.payload);
    setOverLength(encoded.overLength);

    renderPayloadToDataUrl(encoded.payload)
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setDataUrl(null); });

    return () => { cancelled = true; };
  }, [payment, enabled]);

  if (!enabled) {
    return (
      <p className="muted">
        Fill in the recipient account, name, amount and payment code to generate a code.
      </p>
    );
  }

  return (
    <div>
      {overLength && (
        <div className="notice notice-warning">
          The payload is longer than the recommended maximum. It will still render, but some
          scanners may reject it — try shortening the purpose or the names.
        </div>
      )}

      <div className="qr-frame">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data: URL
          <img src={dataUrl} alt="IPS QR code for this payment" />
        ) : (
          <p className="muted">
            <span className="spinner" aria-hidden="true" />
            Rendering…
          </p>
        )}
      </div>

      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          disabled={!dataUrl}
          onClick={() => dataUrl && download('ips-qr.png', dataUrl)}
        >
          Download PNG
        </button>
        <button
          type="button"
          className="button"
          onClick={async () => {
            const svg = await renderPayloadToSvg(payload);
            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
            download('ips-qr.svg', url);
            URL.revokeObjectURL(url);
          }}
        >
          Download SVG
        </button>
        <button
          type="button"
          className="button"
          onClick={async () => {
            await navigator.clipboard.writeText(payload);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'Copied' : 'Copy payload'}
        </button>
      </div>

      <details>
        <summary className="muted" style={{ cursor: 'pointer', marginTop: '0.75rem' }}>
          Show the encoded payload
        </summary>
        <div className="payload">{payload}</div>
      </details>
    </div>
  );
}
