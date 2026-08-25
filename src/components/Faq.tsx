import { FAQ } from '@/lib/site';

/**
 * The visible half of the FAQPage structured data.
 *
 * Both render from the same array in site.ts. Emitting FAQ schema whose
 * answers do not appear on the page is against Google's own guidelines, and
 * an answer engine that cannot find the text it was promised will simply
 * ignore the markup.
 *
 * Collapsed by default so it stays out of the way of someone who came here to
 * pay a bill. Content inside <details> is still indexed and still extractable.
 */
export function Faq() {
  return (
    <section className="card faq" aria-labelledby="faq-heading">
      <h2 id="faq-heading">Questions</h2>
      {FAQ.map(({ question, answer }) => (
        <details key={question} className="faq-item">
          <summary>
            <h3>{question}</h3>
          </summary>
          <p>{answer}</p>
        </details>
      ))}
    </section>
  );
}
