'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  onSelect: (file: File) => void;
  disabled?: boolean;
}

const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp';

/**
 * Image input: tap to open the camera, drag a file in, or paste a screenshot.
 *
 * Paste matters more than it looks — a large share of payments start as a
 * screenshot someone was sent, and asking those users to save the image first
 * is friction for no reason.
 */
export function ImageDropzone({ onSelect, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const accept = useCallback(
    (file: File | null | undefined) => {
      if (!file || !file.type.startsWith('image/')) return;
      setPreviewUrl((old) => {
        // Object URLs are not garbage collected; release the previous one.
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
      onSelect(file);
    },
    [onSelect],
  );

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (disabled) return;
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      if (item) accept(item.getAsFile());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [accept, disabled]);

  return (
    <div
      className={`dropzone${dragging ? ' is-active' : ''}`}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) accept(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        // Opens the rear camera directly on mobile instead of the file browser.
        capture="environment"
        onChange={(event) => accept(event.target.files?.[0])}
        disabled={disabled}
      />

      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL, nothing for the optimizer to do
        <img className="preview-thumb" src={previewUrl} alt="Selected payment slip" />
      ) : (
        <>
          <strong>Take a photo or choose an image</strong>
          <div className="dropzone-hint">You can also drag one here, or paste a screenshot.</div>
        </>
      )}
    </div>
  );
}
