import type { MetadataRoute } from 'next';
import { ferramentas } from '@/lib/calculadoras';

const siteUrl = 'https://prov-financeiro.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/ferramentas`, changeFrequency: 'monthly', priority: 0.8 },
    ...ferramentas.map((tool) => ({ url: `${siteUrl}/ferramentas/${tool.slug}`, changeFrequency: 'yearly' as const, priority: 0.7 })),
  ];
}
