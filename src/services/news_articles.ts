import { supabase } from './supabase.js';
import { Article } from '../types.js';

export async function fetchNewsArticles(categories?: string[]): Promise<Article[]> {
  let query = (supabase
    .from('news_articles') as any)
    .select('*');
  
  if (categories && categories.length > 0) {
    query = query.in('category', categories);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching news articles:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary || (row.content ? row.content.substring(0, 150) + '...' : 'No content available.'),
    category: row.category,
    date: row.created_at,
    readTime: row.read_time || '5 min read',
    source: row.source || 'SaaS Sentinel',
    image_url: row.image_url,
    breakdown: row.breakdown,
    sentinel_take: row.sentinel_take,
    verdict: row.verdict
  }));
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
        category: article.category,
        created_at: new Date().toISOString(),
        image_url: article.image_url
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
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      summary: row.summary || (row.content ? row.content.substring(0, 150) + '...' : 'No content available.'),
      category: row.category,
      date: row.created_at,
      readTime: row.read_time || '5 min read',
      source: row.source || 'SaaS Sentinel',
      image_url: row.image_url,
      breakdown: row.breakdown,
      sentinel_take: row.sentinel_take,
      verdict: row.verdict
    };
  } catch (err: any) {
    console.error(`[DEBUG] Unexpected error in fetchArticleById for id ${id}:`, err.message || err);
    return null;
  }
}
