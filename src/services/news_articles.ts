import { supabase } from './supabase';
import { Article } from '../types';

export async function fetchNewsArticles(categories?: string[], limit: number = 20): Promise<Article[]> {
  let query = (supabase
    .from('news_articles') as any)
    .select('*');
  
  if (categories && categories.length > 0) {
    query = query.in('category', categories);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching news articles:', error);
    return [];
  }

  return (data || []).map((row: any) => {
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
  });
}

export async function saveNewsArticle(article: Partial<Article>) {
  // Check if article with same title already exists
  const { data: existing, error: checkError } = await (supabase
    .from('news_articles') as any)
    .select('id')
    .eq('title', article.title)
    .maybeSingle();

  if (checkError) {
    console.error('Error checking for existing article:', checkError);
    throw checkError;
  }

  if (existing) {
    console.log(`Article with title "${article.title}" already exists. Skipping.`);
    return [existing]; // Return as array for consistency
  }

  const { data, error } = await (supabase
    .from('news_articles') as any)
    .insert([
      {
        title: article.title,
        content: article.content,
        summary: article.summary,
        category: article.category,
        created_at: new Date().toISOString(),
        image_url: article.image_url,
        read_time: article.readTime || '5 min read',
        source: article.source || 'SaaS Sentinel AI',
        breakdown: article.breakdown,
        sentinel_take: article.sentinel_take,
        verdict: article.verdict
      }
    ])
    .select();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchArticleById(id: string): Promise<Article | null> {
  console.log(`[DEBUG] fetchArticleById called with id: ${id}`);
  try {
    if (!supabase) {
      console.error('[DEBUG] Supabase client is not initialized');
      return null;
    }
    
    const { data, error } = await (supabase
      .from('news_articles') as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`[DEBUG] Supabase error in fetchArticleById for id ${id}:`, error);
      return null;
    }

    if (!data) {
      console.log(`[DEBUG] No article found in Supabase for id: ${id}`);
      return null;
    }

    const row = data as any;
    
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
  } catch (err: any) {
    console.error(`[DEBUG] Unexpected error in fetchArticleById for id ${id}:`, err.message || err);
    return null;
  }
}
