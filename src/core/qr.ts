import QRCode from 'qrcode';
import { encodePayment } from './encode';
import type { IpsPayment } from './types';

export interface QrOptions {
  /** Pixel width of the rendered PNG. */
  width?: number;
  /** Quiet-zone width in modules. Below 4 some scanners struggle. */
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

const DEFAULTS: Required<QrOptions> = {
  width: 512,
  margin: 4,
  // The payload is UTF-8 text of non-trivial length; M keeps the module count
  // manageable while still tolerating a creased or poorly lit printout.
  errorCorrectionLevel: 'M',
};

/** Render an already-encoded payload as a PNG data URL. */
export async function renderPayloadToDataUrl(payload: string, options: QrOptions = {}): Promise<string> {
  const opts = { ...DEFAULTS, ...options };
  return QRCode.toDataURL(payload, {
    width: opts.width,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    // Explicit black-on-white: theme-driven colours would break scanning.
    color: { dark: '#000000', light: '#ffffff' },
  });
}

/** Render an already-encoded payload as an SVG string, for print and download. */
export async function renderPayloadToSvg(payload: string, options: QrOptions = {}): Promise<string> {
  const opts = { ...DEFAULTS, ...options };
  return QRCode.toString(payload, {
    type: 'svg',
    width: opts.width,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

/** Convenience: encode a payment and render it in one step. */
export async function renderPaymentToDataUrl(
  payment: IpsPayment,
  options: QrOptions = {},
): Promise<{ dataUrl: string; payload: string; overLength: boolean }> {
  const { payload, overLength } = encodePayment(payment);
  const dataUrl = await renderPayloadToDataUrl(payload, options);
  return { dataUrl, payload, overLength };
}
