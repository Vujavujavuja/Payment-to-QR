/**
 * Public surface of the IPS core library.
 *
 * Everything here is framework-agnostic, dependency-free, and free of DOM and
 * Node assumptions, so the encoding and validation logic can be reused outside
 * this app (CLI, bot, another framework) without dragging React along.
 *
 * QR rendering is deliberately not re-exported. It is the only part that needs
 * a third-party package, and importing this barrel should not drag `qrcode`
 * in with it — import from `./qr` when you actually want to draw one.
 */
export * from './types';
export * from './constants';
export * from './format';
export * from './validate';
export * from './encode';
export * from './parse';

import { DEFAULT_PAYMENT_CODE } from './constants';
import type { IpsPayment } from './types';

/** A blank payment, for seeding an empty form. */
export function emptyPayment(): IpsPayment {
  return {
    recipientAccount: '',
    recipientName: '',
    amount: '',
    payerName: '',
    paymentCode: DEFAULT_PAYMENT_CODE,
    purpose: '',
    referenceModel: '',
    referenceNumber: '',
  };
}
