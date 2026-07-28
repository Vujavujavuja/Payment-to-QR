/**
 * Public surface of the IPS core library.
 *
 * Everything here is framework-agnostic and free of DOM/Node assumptions
 * except qr.ts, so the encoding and validation logic can be reused outside
 * this app (CLI, bot, another framework) without dragging React along.
 */
export * from './types';
export * from './constants';
export * from './format';
export * from './validate';
export * from './encode';
export * from './parse';
export * from './qr';

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
