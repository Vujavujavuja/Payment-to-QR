'use client';

import { useEffect, useMemo, useState } from 'react';
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
  // Encoding is synchronous, so it is derived during render rather than
  // synced into state by an effect. Only the image is genuinely async.
  const { payload, overLength } = useMemo(
    () => (enabled ? encodePayment(payment) : { payload: '', overLength: false }),
    [payment, enabled],
  );

  // The rendered image is stored together with the payload it was made from.
  // The form re-renders on every keystroke, and a code that no longer matches
  // the fields beside it is the one genuinely dangerous thing this component
  // can display -- so a mismatch shows the spinner rather than the old code.
  const [rendered, setRendered] = useState<{ url: string; payload: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const dataUrl = rendered?.payload === payload ? rendered.url : null;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    renderPayloadToDataUrl(payload)
      .then((url) => { if (!cancelled) setRendered({ url, payload }); })
      .catch(() => { if (!cancelled) setRendered(null); });

    return () => { cancelled = true; };
  }, [payload, enabled]);

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
