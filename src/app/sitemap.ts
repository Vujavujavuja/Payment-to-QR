import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * A single page, but a sitemap still earns its place: it is what search
 * engines poll for the canonical origin and the last-modified date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
