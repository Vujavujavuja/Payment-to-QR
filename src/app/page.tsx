'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Faq } from '@/components/Faq';
import { ImageDropzone } from '@/components/ImageDropzone';
import { PaymentForm } from '@/components/PaymentForm';
import { QrPreview } from '@/components/QrPreview';
import { emptyPayment, validatePayment } from 'ips-qr';
import type { IpsPayment } from 'ips-qr';
import type { ExtractionResult, FieldConfidence } from '@/extract/types';

type ProviderId = 'tesseract' | 'claude';

export default function Home() {
  const [payment, setPayment] = useState<IpsPayment>(emptyPayment);
  const [confidence, setConfidence] = useState<FieldConfidence>({});
  const [notes, setNotes] = useState<string[]>([]);
  const [provider, setProvider] = useState<ProviderId>('tesseract');
  const [claudeAvailable, setClaudeAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask the server whether a key is configured, so the option is hidden rather
  // than offered and then failing on upload.
  useEffect(() => {
    fetch('/api/extract')
      .then((res) => (res.ok ? res.json() : { available: false }))
      .then((body) => setClaudeAvailable(Boolean(body.available)))
      .catch(() => setClaudeAvailable(false));
  }, []);

  const validation = useMemo(() => validatePayment(payment), [payment]);

  const patch = useCallback((update: Partial<IpsPayment>) => {
    setPayment((previous) => ({ ...previous, ...update }));
  }, []);

  const applyExtraction = useCallback((result: ExtractionResult) => {
    // Merge rather than replace: anything the user already typed is theirs,
    // and an extractor that found nothing should not wipe the form.
    setPayment((previous) => ({ ...previous, ...result.payment }));
    setConfidence(result.confidence);
    setNotes(result.notes ?? []);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setNotes([]);
      try {
        if (provider === 'claude') {
          const body = new FormData();
          body.append('image', file);
          const response = await fetch('/api/extract', { method: 'POST', body });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error ?? 'Extraction failed.');
          applyExtraction(json as ExtractionResult);
        } else {
          // Imported here so the OCR wasm bundle is only fetched on first use.
          const { TesseractExtractor } = await import('@/extract/providers/tesseract');
          const result = await new TesseractExtractor().extract({
            data: new Uint8Array(await file.arrayBuffer()),
            mimeType: file.type,
          });
          applyExtraction(result);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Something went wrong reading the image.');
      } finally {
        setBusy(false);
      }
    },
    [applyExtraction, provider],
  );

  return (
    <main className="layout">
      <section className="card">
        <h2>1 · Read a slip</h2>

        <ImageDropzone onSelect={handleFile} disabled={busy} />

        {claudeAvailable && (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="provider">Extraction method</label>
            <select
              id="provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value as ProviderId)}
              disabled={busy}
            >
              <option value="tesseract">On-device OCR — free, image stays on your device</option>
              <option value="claude">Claude vision — more accurate, image is sent to the server</option>
            </select>
          </div>
        )}

        {busy && (
          <p className="muted">
            <span className="spinner" aria-hidden="true" />
            Reading the image…
          </p>
        )}

        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}

        {notes.length > 0 && (
          <div className="notice notice-warning">
            <strong>Worth checking</strong>
            <ul>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        <h2 style={{ marginTop: '1.5rem' }}>2 · Check the details</h2>
        <PaymentForm
          payment={payment}
          issues={validation.issues}
          confidence={confidence}
          onChange={patch}
        />

        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={() => {
              setPayment(emptyPayment());
              setConfidence({});
              setNotes([]);
              setError(null);
            }}
          >
            Clear
          </button>
        </div>
      </section>

      <section className="card">
        <h2>3 · Scan to pay</h2>
        <QrPreview payment={payment} enabled={validation.valid} />
      </section>

      <Faq />
    </main>
  );
}
