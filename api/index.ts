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

async function callGemini(prompt: string, jsonMode = false) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const key = getGeminiKey();
  if (!key) {
    console.error("[Sentinel] GEMINI_API_KEY IS MISSING");
    throw new Error("GEMINI_API_KEY is missing");
  }
  
  const genAI = new GoogleGenerativeAI(key);
  // Using gemini-1.5-flash as it is the most stable identifier
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    ...(jsonMode ? { generationConfig: { responseMimeType: "application/json" } } : {})
  });
  
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    if (!text) throw new Error("Empty response from Gemini");
    return text;
  } catch (error: any) {
    console.error("[Sentinel] Gemini Call Failed:", error);
    throw error;
  }
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
    const supabase = getSupabase();
    
    const searchPrompt = `Search for the top 3 most significant B2B SaaS and Enterprise AI news stories from the last 24 hours. Focus on: Funding (Series A+), Major Product Launches, M&A, and AI infrastructure breakthroughs. Provide summaries.`;
    const rawNews = await callGemini(searchPrompt);

    const parsePrompt = `Extract news stories from this text: "${rawNews}". Return an array of objects: [{ "title": "...", "snippet": "..." }]. Ensure the titles are professional and specific.`;
    const storiesRaw = await callGemini(parsePrompt, true);
    const stories = JSON.parse(storiesRaw);

    if (stories && stories.length > 0) {
      // Process first high-quality story
      const story = stories[0];
      
      // EXPLICIT DUPLICATE CHECK
      const { data: existing } = await supabase
        .from('news_articles')
        .select('id')
        .ilike('title', `%${story.title.substring(0, 20)}%`)
        .limit(1);

      if (existing && existing.length > 0) {
        return res.json({ success: false, reason: "Similar article already exists in database", title: story.title });
      }

      const genPrompt = `Act as an Elite SaaS Analyst for Bloomberg. Write a detailed, institutional-grade intelligence report on: "${story.title}". 
      Context: "${story.snippet}". 
      Required JSON fields: title, summary, content, category (Funding, AI, Growth, M&A, or Strategy), sentinel_take, verdict. 
      Tone: Sharp, professional, and strategic.`;
      
      const articleDataRaw = await callGemini(genPrompt, true);
      const articleData = JSON.parse(articleDataRaw);

      // Save to Supabase
      const { data: saved, error: saveError } = await supabase.from('news_articles').insert([{
        ...articleData,
        created_at: new Date().toISOString(),
        source: "SaaS Sentinel Intelligence",
        read_time: "4 min read"
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

    const prompt = `Create a high-end HTML newsletter for 'SaaS Sentinel'. Summarize these:\n${articles.map(a => `- ${a.title}: ${a.summary}`).join('\n')}`;
    const htmlRaw = await callGemini(prompt);
    const html = htmlRaw.replace(/```html|```/g, '').trim();

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
