import { Article } from '../types';

export function mapRowToArticle(row: any): Article {
  // Handle legacy JSON summaries or malformed strings
  let summary = row.summary;
  if (typeof summary === 'string' && (summary.startsWith('{') || summary.startsWith('['))) {
    try {
      const parsed = JSON.parse(summary);
      summary = parsed.summary || parsed.feed_summary || (Array.isArray(parsed) ? parsed[0] : summary);
    } catch (e) {
      // Not valid JSON, keep as is
    }
  }

  // Fallback for content
  const content = row.content || row.analysis_content || '';
  const contentStr = typeof content === 'string' ? content : '';

  // Handle verdict and sentinel_take if they are embedded in content
  let verdict = row.verdict;
  let sentinel_take = row.sentinel_take;

  if (!verdict && contentStr.includes('**Strategic Verdict:**')) {
    const parts = contentStr.split('**Strategic Verdict:**');
    if (parts.length > 1) {
      const afterVerdict = parts[1].split('**Sentinel\'s Take:**')[0].trim();
      verdict = afterVerdict;
    }
  }

  if (!sentinel_take && contentStr.includes('**Sentinel\'s Take:**')) {
    const parts = contentStr.split('**Sentinel\'s Take:**');
    if (parts.length > 1) {
      sentinel_take = parts[1].trim();
    }
  }

  return {
    id: row.id,
    title: row.title || 'Untitled Report',
    content: contentStr,
    summary: summary || (contentStr ? contentStr.substring(0, 150) + '...' : 'No content available.'),
    category: row.category || 'Intelligence',
    date: row.published_at || row.created_at || new Date().toISOString(),
    readTime: row.read_time || '5 min read',
    source: row.source || 'SaaS Sentinel',
    image_url: row.image_url,
    breakdown: Array.isArray(row.breakdown) ? row.breakdown : [],
    sentinel_take: sentinel_take,
    verdict: verdict
  };
}
