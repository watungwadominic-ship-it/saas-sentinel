import express, { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getSocialBoost, buildThreadsPost } from './social_booster';

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
  // Using gemini-1.5-flash-latest as it is more specific and often fixes the 404
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash-latest",
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
  const { data, error } = await getSupabase().from('news_articles').select('*').order('created_at', { ascending: false }).limit(30);
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
    const supabase = getSupabase();
    
    // DAILY LIMIT CHECK: Don't produce more than 3 articles per day total
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('news_articles')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', todayStart.toISOString());

    if (count !== null && count >= 3) {
      console.log(`[Sentinel] Daily limit reached (${count}/3). Skipping news generation.`);
      return res.json({ success: false, reason: "Daily limit of 3 articles reached" });
    }

    console.log(`[Sentinel] Starting fetch-news cron (Current day count: ${count || 0})...`);
    
    const searchPrompt = `Search for the top 3 most significant B2B SaaS, Enterprise AI, and Cloud Infrastructure news stories from the last 24 hours. 
    Strict Focus: Only include B2B Tech, Enterprise Software, SaaS Funding (Series A+), M&A, and AI infrastructure. 
    Exclude: Consumer gadget news, smartphones, gaming, or general retail. 
    Provide summaries.`;
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
      Required JSON fields: 
      - title: professional headline
      - summary: 2-sentence summary
      - content: 150-200 words of analysis
      - category: One of (Funding, AI, Growth, M&A, or Strategy)
      - sentinel_take: Your unique strategic take
      - verdict: A 1-sentence strategic Outlook
      - breakdown: An array of exactly 4 strings, each being a specific revenue implication or strategic takeaway for a B2B audience.
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

      // Optimize and enrich the post text for engagement and views
      const boostResult = saved?.[0] ? getSocialBoost(saved[0].title, saved[0].summary, saved[0].category) : null;

      // Optional: Post to Threads
      if (process.env.THREADS_USER_ID && process.env.THREADS_ACCESS_TOKEN && saved?.[0]) {
        try {
          const article = saved[0];
          const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
          const protocol = req.headers['x-forwarded-proto'] || 'https';
          const base = `${protocol}://${host}`;
          
          const postText = buildThreadsPost(article.title, article.summary, article.id || '', article.category, base);

          await fetch(`https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads?media_type=TEXT&text=${encodeURIComponent(postText)}&access_token=${process.env.THREADS_ACCESS_TOKEN}`, { method: 'POST' });
        } catch (postErr) {
          console.error("Threads post error:", postErr);
        }
      }

      // Optional: Post to LinkedIn
      if (saved?.[0] && boostResult) {
        const liToken = process.env.LINKEDIN_ACCESS_TOKEN;
        const liUrn = process.env.LINKEDIN_PERSON_URN;
        
        if (liToken && liUrn) {
          try {
            const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const base = `${protocol}://${host}`;
            const article = saved[0];
            const sharingUrl = article.slug ? `${base}/article/${article.slug}` : `${base}/article/${article.id}`;
            
            let commentary = `📡 SaaS Sentiment Intelligence: ${article.title}\n\n${article.summary}\n\n💡 ${boostResult.cta}\n\nRead the full strategic analysis: ${sharingUrl}`;
            
            if (boostResult.mentions.length > 0) {
              commentary += `\n\nCc: ${boostResult.mentions.join(' ')}`;
            }
            if (boostResult.tags.length > 0) {
              commentary += `\n\n${boostResult.tags.join(' ')}`;
            }
            
            // Clean author URN
            let authorUrn = liUrn.trim();
            if (!authorUrn.startsWith("urn:li:")) {
              authorUrn = `urn:li:person:${authorUrn}`;
            }

            const requestBody = {
              author: authorUrn,
              lifecycleState: "PUBLISHED",
              specificContent: {
                "com.linkedin.ugc.ShareContent": {
                  shareCommentary: { text: commentary },
                  shareMediaCategory: "ARTICLE",
                  media: [{
                    status: "READY",
                    originalUrl: sharingUrl,
                    title: { text: article.title },
                    description: { text: (article.summary || "").substring(0, 200) }
                  }]
                }
              },
              visibility: {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
              }
            };

            const liRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${liToken}`,
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0"
              },
              body: JSON.stringify(requestBody)
            });

            if (liRes.ok) {
              console.log("💼 LinkedIn Post Successful");
            } else {
              const resText = await liRes.text();
              console.error("❌ LinkedIn error response:", resText);
            }
          } catch (liErr) {
            console.error("❌ LinkedIn posting exception:", liErr);
          }
        } else {
          console.log("ℹ️ LinkedIn config missing (LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_URN not set in environment). Skipping LinkedIn dispatch.");
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
    let { data: articles } = await getSupabase()
      .from('news_articles')
      .select('title, summary')
      .gt('created_at', sevenDaysAgo.toISOString())
      .limit(5);
    
    if (!articles || articles.length === 0) {
      console.log("[Sentinel Weekly Newsletter] No articles found in last 7 days. Falling back to the 5 most recent articles in the system.");
      const { data: recentArticles } = await getSupabase()
        .from('news_articles')
        .select('title, summary')
        .order('created_at', { ascending: false })
        .limit(5);
      articles = recentArticles;
    }
    
    if (!articles?.length) return res.json({ success: true, message: "No fresh content available to build newsletter" });

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
  try {
    const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const base = `${protocol}://${host}`;
    
    const { data: articles, error } = await getSupabase()
      .from('news_articles')
      .select('id, slug, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    
    if (error) {
      console.error("Supabase sitemap query error:", error);
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    xml += `\n  <url><loc>${base}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`;
    xml += `\n  <url><loc>${base}/archive</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`;
    xml += `\n  <url><loc>${base}/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
    xml += `\n  <url><loc>${base}/privacy</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`;
    
    if (articles && Array.isArray(articles)) {
      articles.forEach(a => {
        const identifier = a.slug || a.id;
        if (identifier) {
          let mod = new Date().toISOString().split('T')[0];
          if (a.created_at && typeof a.created_at === 'string') {
            mod = a.created_at.split('T')[0];
          }
          xml += `\n  <url><loc>${base}/article/${identifier}</loc><lastmod>${mod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
        }
      });
    }
    
    xml += `\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml');
    return res.send(xml);
  } catch (err) {
    console.error("Global Sitemap Error:", err);
    res.setHeader('Content-Type', 'application/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>/</loc></url>\n</urlset>`);
  }
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
