/**
 * JSON-LD structured data.
 *
 * This is the machine-readable half of the page. Search engines use it for
 * rich results, and answer engines use it as a compact, unambiguous statement
 * of what the thing is — far easier to quote correctly than prose scraped out
 * of markup.
 */
import { FAQ, REPO_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from './site';

export function buildStructuredData() {
  const softwareApplication = {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#app`,
    name: SITE_NAME,
    alternateName: ['IPS QR generator', 'Generator IPS QR koda'],
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript.',
    inLanguage: 'en',
    isAccessibleForFree: true,
    license: 'https://opensource.org/licenses/MIT',
    codeRepository: REPO_URL,
    programmingLanguage: ['TypeScript', 'Python'],
    // Explicit zero price. Without an Offer, "free" is only an adjective in
    // the description; with it, it is a fact a machine can read.
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'RSD',
      availability: 'https://schema.org/InStock',
    },
    featureList: [
      'Extract payment fields from a photographed slip, invoice or bill',
      'On-device OCR — the image never leaves your device',
      'Serbian Cyrillic and Latin script support',
      'mod 97-10 account control digit validation',
      'Model 97 reference number checking',
      'Export as PNG, SVG, or the raw IPS payload',
    ],
  };

  const faqPage = {
    '@type': 'FAQPage',
    '@id': `${SITE_URL}/#faq`,
    mainEntity: FAQ.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };

  const webSite = {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
    license: 'https://opensource.org/licenses/MIT',
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [webSite, softwareApplication, faqPage],
  };
}
