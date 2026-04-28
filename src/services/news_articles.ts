import { supabase } from './supabase';
import { Article } from '../types';
import { mapRowToArticle } from './article_utils';

export async function fetchNewsArticles(categories?: string[], limit: number = 20): Promise<Article[]> {
  try {
    // Attempt to use our cached API if possible
    const isProduction = typeof window !== 'undefined' && 
                        (window.location.hostname.includes('vercel.app') || 
                         window.location.hostname.includes('europe-west2.run.app'));
    
    if (isProduction && (!categories || categories.length === 0)) {
      const response = await fetch(`/api/news?limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        return data.map(mapRowToArticle);
      }
    }
  } catch (e) {
    console.warn('API fetch failed, falling back to direct Supabase', e);
  }

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

  return (data || []).map(mapRowToArticle);
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
    // Attempt to use cached API
    const isProduction = typeof window !== 'undefined' && 
                        (window.location.hostname.includes('vercel.app') || 
                         window.location.hostname.includes('europe-west2.run.app'));
    
    if (isProduction) {
      const response = await fetch(`/api/news/${id}`);
      if (response.ok) {
        const data = await response.json();
        return mapRowToArticle(data);
      }
    }
  } catch (e) {
    console.warn('API single article fetch failed', e);
  }

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

    return mapRowToArticle(data);
  } catch (err: any) {
    console.error(`[DEBUG] Unexpected error in fetchArticleById for id ${id}:`, err.message || err);
    return null;
  }
}
