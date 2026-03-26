import { supabase } from './supabase';
import { Article } from '../types';

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
        summary: article.summary,
        created_at: new Date().toISOString(),
        read_time: article.readTime,
        source: article.source,
        image_url: article.image_url,
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
  const { data, error } = await (supabase
    .from('news_articles') as any)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('Error fetching article by id:', error);
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
}
import { supabase } from './supabase';
import { Article } from '../types';

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
        summary: article.summary,
        created_at: new Date().toISOString(),
        read_time: article.readTime,
        source: article.source,
        image_url: article.image_url,
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
  const { data, error } = await (supabase
    .from('news_articles') as any)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('Error fetching article by id:', error);
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
}
