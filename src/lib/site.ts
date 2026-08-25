/**
 * Canonical facts about this site, in one place.
 *
 * Metadata, structured data, the sitemap and robots all read from here so a
 * change of domain or wording cannot leave one of them describing something
 * the others do not.
 */

/**
 * Absolute origin, needed because Open Graph images and canonical URLs cannot
 * be relative.
 *
 * This project is not deployed anywhere, so there is no real value to hardcode
 * and inventing one would put a dead URL in every social card. Set
 * NEXT_PUBLIC_SITE_URL when you deploy; until then everything resolves against
 * localhost, which is honest rather than wrong.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const REPO_URL = 'https://github.com/Vujavujavuja/Payment-to-QR';

export const SITE_NAME = 'Payment to QR';

export const SITE_TAGLINE = 'Serbian payment slip to IPS QR code';

/**
 * One paragraph, written to be quotable.
 *
 * Answer engines extract and cite descriptions like this verbatim, so it
 * states what the tool does, who it is for, and the one constraint that
 * distinguishes it — rather than adjectives about how good it is.
 */
export const SITE_DESCRIPTION =
  'Free, open source generator for NBS IPS QR codes. Photograph a Serbian payment slip, ' +
  'invoice or bill, check the extracted fields, and get a QR code you can scan in any ' +
  'Serbian banking app. Account numbers are verified with mod 97-10 control digits and no ' +
  'code is produced until the payment validates.';

/**
 * Terms real people search for, in both languages and both scripts.
 *
 * The meta keywords tag itself carries no weight with search engines any more.
 * These matter because the same list drives the words used in the page copy,
 * the README and the structured data, which do carry weight.
 */
export const SITE_KEYWORDS = [
  'IPS QR',
  'NBS IPS QR',
  'IPS QR kod',
  'QR kod za plaćanje',
  'uplatnica',
  'QR uplatnica',
  'generator IPS QR koda',
  'plaćanje QR kodom Srbija',
  'Serbian payment QR code',
  'NBS QR generator',
  'Narodna banka Srbije QR',
  'skeniraj i plati',
  'payment slip to QR',
  'open source QR payment generator',
];

/**
 * Questions this project can actually answer, with answers short enough to be
 * quoted whole. These feed both the README and FAQPage structured data.
 */
export const FAQ: { question: string; answer: string }[] = [
  {
    question: 'What is an NBS IPS QR code?',
    answer:
      'It is the QR code standard defined by the National Bank of Serbia (Narodna banka Srbije) ' +
      'for instant payments. Scanning one in a Serbian banking app fills in the recipient ' +
      'account, amount, payment code and reference automatically. The code itself is a flat ' +
      'pipe-separated string of tagged fields, for example K:PR|V:01|C:1|R:...',
  },
  {
    question: 'How do I turn a payment slip into a QR code?',
    answer:
      'Photograph the slip, invoice or bill. The text is read on your device, the fields are ' +
      'shown in a form for you to check, and a scannable IPS QR code is produced once the ' +
      'payment passes validation. You can also type the fields in directly without an image.',
  },
  {
    question: 'Is it free, and does my document leave my device?',
    answer:
      'It is free and open source under the MIT licence. The default extractor runs OCR in ' +
      'your browser, so the image never leaves your device. An optional Claude vision ' +
      'extractor is more accurate but sends the image to a server, which is why it is opt-in ' +
      'and off by default.',
  },
  {
    question: 'Does this move money or make a payment?',
    answer:
      'No. It only encodes payment instructions into a QR code. Nothing is transferred, no ' +
      'bank connection exists, and no account credentials are ever requested. Your banking ' +
      'app performs the payment after you review and confirm it there.',
  },
  {
    question: 'Why do I have to check the fields myself?',
    answer:
      'Because extraction is unreliable by nature — OCR misreads digits and vision models ' +
      'transcribe a 7 as a 1. A wrong digit sends money to a stranger. Fields the extractor ' +
      'was unsure about are flagged, and no QR code is rendered until the payment validates, ' +
      'including the account control digits.',
  },
  {
    question: 'Does it work offline, and can I install it on my phone?',
    answer:
      'Yes to both. It installs to a home screen from your browser and runs in its own ' +
      'window. Typing a payment in and generating a QR code works with no connection at ' +
      'all, because the encoding and QR rendering happen entirely on your device. Reading ' +
      'a slip with the camera also works offline, but only after you have scanned ' +
      'something once while online — the first scan downloads the Serbian and English ' +
      'language data. The optional Claude extractor always needs a connection.',
  },
  {
    question: 'Is this an official National Bank of Serbia application?',
    answer:
      'No. It is an unofficial, independent open source project, not affiliated with or ' +
      'endorsed by the National Bank of Serbia. Always confirm the amount and recipient ' +
      'account in your banking app before paying.',
  },
];
