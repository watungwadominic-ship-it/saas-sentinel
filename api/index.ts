import express, { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

// --- CONFIG & INITS ---

const app = express();
app.use(express.json());

// Debug log to see incoming requests on deployed environment
app.use((req, res, next) => {
  console.log(`[Sentinel API] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

const getSupabase = () => {
  const url = process.env.SUPABASE_URL || 'https://dpwkojtfeoxlpyevutfc.supabase.co';
  const key = process.env.SUPABASE_KEY || 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE';
  return createClient(url, key);
};

const getGeminiKey = () => process.env.VITE_USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

// --- HELPERS ---

async function getGeminiModel(mimeType?: string) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const key = getGeminiKey();
  if (!key) throw new Error("GEMINI_API_KEY is missing");
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    ...(mimeType ? { generationConfig: { responseMimeType: mimeType } } : {})
  });
}

// --- API ROUTES ---

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'production',
    region: process.env.VERCEL_REGION || 'local'
  });
});

app.get(['/api/news', '/news'], async (req, res) => {
  const { data, error } = await getSupabase().from('news_articles').select('*').order('created_at', { ascending: false }).limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get(['/api/news/:id', '/news/:id'], async (req, res) => {
  const { data, error } = await getSupabase().from('news_articles').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- CRON ROUTES ---

// Using a more flexible route pattern to ensure Vercel and direct calls both reach the handler
app.all(['/api/cron/fetch-news', '/cron/fetch-news', '/api/cron/fetch-news/'], async (req, res) => {
  try {
    console.log("[Sentinel] Starting fetch-news cron...");
    const model = await getGeminiModel();
    const searchPrompt = `Search for the top 3 most significant SaaS news stories from the last 24 hours. Focus on: Funding, Major Product Launches, and AI breakthroughs.`;
    const searchResult = await model.generateContent(searchPrompt);
    const rawNews = searchResult.response.text();

    const parser = await getGeminiModel("application/json");
    const parsePrompt = `Extract news stories from this text: "${rawNews}". Return an array of objects: [{ "title": "...", "snippet": "..." }]`;
    const parseResult = await parser.generateContent(parsePrompt);
    const stories = JSON.parse(parseResult.response.text());

    if (stories && stories[0]) {
      const generator = await getGeminiModel("application/json");
      const genPrompt = `Act as an Elite SaaS Analyst. Write a detailed report on: "${stories[0].title}". Context: "${stories[0].snippet}". 
      Required JSON fields: title, summary, content, category (e.g. Funding, AI, Growth), sentinel_take, verdict.`;
      const genResult = await generator.generateContent(genPrompt);
      const articleData = JSON.parse(genResult.response.text());

      // Save to Supabase
      const { data: saved, error: saveError } = await getSupabase().from('news_articles').insert([{
        ...articleData,
        created_at: new Date().toISOString(),
        source: "SaaS Sentinel AI",
        read_time: "5 min read"
      }]).select();

      if (saveError) {
        if (saveError.code === '23505') return res.json({ success: false, reason: "Article already exists" });
        throw saveError;
      }

      // Optional: Post to Threads
      if (process.env.THREADS_USER_ID && process.env.THREADS_ACCESS_TOKEN && saved?.[0]) {
        try {
          const postText = `📢 SaaS INTELLIGENCE: ${saved[0].title}\n\n${saved[0].summary}\n\nRead more: https://saas-sentinel-cyan.vercel.app/article/${saved[0].id}`;
          await fetch(`https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads?media_type=TEXT&text=${encodeURIComponent(postText)}&access_token=${process.env.THREADS_ACCESS_TOKEN}`, { method: 'POST' });
        } catch (postErr) {
          console.error("Threads post error:", postErr);
        }
      }

      return res.json({ success: true, article: saved?.[0]?.title });
    }
    res.json({ success: false, reason: "No stories found" });
  } catch (err: any) {
    console.error("Fetch News Error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.all(['/api/cron/weekly-newsletter', '/cron/weekly-newsletter', '/api/cron/weekly-newsletter/'], async (req, res) => {
  try {
    const { data: subscribers } = await getSupabase().from('subscribers').select('email');
    if (!subscribers?.length) return res.json({ success: true, message: "No subscribers" });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: articles } = await getSupabase().from('news_articles').select('title, summary').gt('created_at', sevenDaysAgo.toISOString()).limit(5);
    
    if (!articles?.length) return res.json({ success: true, message: "No fresh content" });

    const model = await getGeminiModel();
    const prompt = `Create a high-end HTML newsletter for 'SaaS Sentinel'. Summarize these:\n${articles.map(a => `- ${a.title}: ${a.summary}`).join('\n')}`;
    const result = await model.generateContent(prompt);
    const html = result.response.text().replace(/```html|```/g, '').trim();

    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    let sent = 0;
    for (const sub of subscribers) {
      try {
        await transporter.sendMail({
          from: `"SaaS Sentinel" <${process.env.SMTP_USER}>`,
          to: sub.email,
          subject: `Weekly Intelligence: ${articles[0].title.substring(0, 40)}...`,
          html
        });
        sent++;
      } catch (e) { console.error("Email fail", e); }
    }
    res.json({ success: true, sent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/proxy-image', '/proxy-image'], async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) return res.status(400).send("No URL");
  try {
    const response = await fetch(imageUrl, { headers: { 'User-Agent': 'SaaS-Sentinel/1.0' } });
    if (!response.ok) throw new Error();
    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(Buffer.from(buffer));
  } catch (e) {
    return res.redirect(imageUrl);
  }
});

// --- UTILS ---

app.get(['/sitemap.xml', '/api/sitemap.xml'], async (req, res) => {
  const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const base = `${protocol}://${host}`;
  const { data: articles } = await getSupabase().from('news_articles').select('id, created_at').order('created_at', { ascending: false }).limit(1000);
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
  xml += `\n  <url><loc>${base}/</loc><priority>1.0</priority></url>`;
  xml += `\n  <url><loc>${base}/archive</loc><priority>0.8</priority></url>`;
  xml += `\n  <url><loc>${base}/about</loc><priority>0.5</priority></url>`;
  
  articles?.forEach(a => {
    xml += `\n  <url><loc>${base}/article/${a.id}</loc><lastmod>${a.created_at.split('T')[0]}</lastmod></url>`;
  });
  xml += `\n</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

app.get(['/robots.txt', '/api/robots.txt'], (req, res) => {
  const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: https://${host}/sitemap.xml\n`);
});

// Catch-all for API to debug routing
app.use('/api', (req, res) => {
  res.status(404).json({
    error: "Sentinel Route Not Found",
    method: req.method,
    path: req.path,
    url: req.url,
    originalUrl: req.originalUrl
  });
});

export default app;
