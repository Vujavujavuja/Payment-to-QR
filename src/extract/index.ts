export * from './types';
export * from './normalize';
export { TesseractExtractor, TESSERACT_PROVIDER_ID } from './providers/tesseract';
export { ClaudeExtractor, CLAUDE_PROVIDER_ID } from './providers/claude';

/**
 * Providers the UI can offer.
 *
 * Tesseract is listed first and is the default: it works with no
 * configuration and keeps the image on the device. Claude is a deliberate
 * upgrade the user opts into, not a silent fallback.
 */
export const PROVIDER_IDS = ['tesseract', 'claude'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const DEFAULT_PROVIDER_ID: ProviderId = 'tesseract';
