import express, { Request, Response, NextFunction } from 'express';
import { supabase } from "../src/services/supabase";
import * as gemini from "../src/services/gemini";
import * as newsArticles from "../src/services/news_articles";
import { postToThreads } from "../src/services/threads";

const app = express();
app.use(express.json());

// Logger to see what Vercel passes to us
app.use((req, res, next) => {
  console.log(`[Sentintel API] ${req.method} ${req.url} (Original: ${req.originalUrl})`);
  next();
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    vercel: true,
    time: new Date().toISOString()
  });
});

app.get('/robots.txt', (req, res) => serveRobots(req, res));
app.get('/api/robots.txt', (req, res) => serveRobots(req, res));

function serveRobots(req: Request, res: Response) {
  const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const base = `${protocol}://${host}`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
}

app.get('/sitemap.xml', (req, res) => serveSitemap(req, res));
app.get('/api/sitemap.xml', (req, res) => serveSitemap(req, res));

async function serveSitemap(req: Request, res: Response) {
  try {
    const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const base = `${protocol}://${host}`;
    
    let articles = [];
    try {
      const { data } = await supabase
        .from("news_articles")
        .select("id, updated_at, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      articles = data || [];
    } catch (e) {
      console.error("Supabase fail in sitemap", e);
    }
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    sitemap += `\n  <url><loc>${base}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`;
    sitemap += `\n  <url><loc>${base}/archive</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`;
    sitemap += `\n  <url><loc>${base}/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
    sitemap += `\n  <url><loc>${base}/privacy</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`;

    articles.forEach((a: any) => {
      const mod = (a.updated_at || a.created_at || new Date().toISOString()).split('T')[0];
      sitemap += `\n  <url><loc>${base}/article/${a.id}</loc><lastmod>${mod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
    });
    
    sitemap += `\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(sitemap);
  } catch (err: any) {
    console.error("Sitemap Generation Error:", err);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>/</loc></url>\n</urlset>`);
  }
}

app.get(['/api/news', '/news'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from("news_articles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json(data);
  } catch (e: any) {
    next(e);
  }
});

app.get(['/api/news/:id', '/news/:id'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from("news_articles")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (e: any) {
    next(e);
  }
});

// Explicit Cron routes
app.all('/api/cron/fetch-news', handleFetchNews);
app.all('/cron/fetch-news', handleFetchNews);

async function handleFetchNews(req: Request, res: Response, next: NextFunction) {
  try {
    console.log("Vercel Cron fetch-news triggered...");
    const rawNews = await gemini.fetchTopSaaSNews();
    const stories = await gemini.parseNewsIntoStories(rawNews);
    
    if (stories?.[0]) {
      const articleData = await gemini.generateArticle(stories[0].title, stories[0].snippet);
      const saved = await newsArticles.saveNewsArticle({ ...articleData, source: "SaaS Sentinel", readTime: "4 min read" });
      
      if (saved && saved[0]) {
        console.log(`[BOT] News saved: ${saved[0].title}. Attempting Threads post...`);
        try {
          await postToThreads(saved[0]);
        } catch (postError) {
          console.error("[BOT] Threads post failed:", postError);
        }
        res.json({ success: true, title: saved[0].title });
      } else {
        res.json({ success: false, reason: "Failed to save or already exists" });
      }
    } else {
      res.json({ success: false, reason: "No stories found" });
    }
  } catch (e: any) {
    console.error("Vercel Cron Error:", e);
    next(e);
  }
}

app.all('/api/cron/weekly-newsletter', handleNewsletter);
app.all('/cron/weekly-newsletter', handleNewsletter);

async function handleNewsletter(req: Request, res: Response, next: NextFunction) {
  try {
    console.log("Weekly Newsletter Cron triggered...");
    const { data: subscribers, error: subError } = await supabase
      .from('subscribers')
      .select('email');
      
    if (subError) throw subError;
    if (!subscribers || subscribers.length === 0) {
      return res.json({ success: true, message: "No subscribers to notify." });
    }

    const { data: topArticles, error: articleError } = await supabase
      .from('news_articles')
      .select('title, summary, id')
      .order('created_at', { ascending: false })
      .limit(5);

    if (articleError) throw articleError;
    if (!topArticles || topArticles.length === 0) {
      return res.json({ success: true, message: "No news to share this week." });
    }

    const ai = new (await import("@google/generative-ai")).GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const newsContext = topArticles.map((a, i) => `${i+1}. ${a.title}: ${a.summary}`).join('\n\n');
    const newsletterPrompt = `Create a high-end HTML newsletter briefing for 'SaaS Sentinel'. 
    Theme: Elite B2B Market Intelligence. 
    Content: Summarize these stories:\n\n${newsContext}`;

    const result = await model.generateContent(newsletterPrompt);
    const htmlContent = result.response.text().replace(/```html|```/g, '').trim();

    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    let sentCount = 0;
    for (const sub of subscribers) {
      try {
        await transporter.sendMail({
          from: `"SaaS Sentinel" <${process.env.SMTP_USER}>`,
          to: sub.email,
          subject: `Weekly Intelligence Brief: ${topArticles[0].title.substring(0, 50)}...`,
          html: htmlContent
        });
        sentCount++;
      } catch (err) {
        console.error(`Failed to send to ${sub.email}`, err);
      }
    }
    
    res.json({ success: true, sent: sentCount });
  } catch (e: any) {
    console.error("Newsletter Cron Error:", e);
    next(e);
  }
}

app.get(['/api/proxy-image', '/proxy-image'], async (req: Request, res: Response) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) return res.status(400).send("No URL");
  try {
    const response = await fetch(imageUrl, { headers: { 'User-Agent': 'SaaS-Sentinel-Bot/1.0' } });
    if (!response.ok) throw new Error();
    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(Buffer.from(buffer));
  } catch (e) {
    return res.redirect(imageUrl);
  }
});

// Debug 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: "Route not found in Sentinel API", 
    path: req.path,
    url: req.url,
    method: req.method,
    originalUrl: req.originalUrl
  });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("🔥 Global API Catch:", err);
  res.status(500).json({ 
    status: "error", 
    message: "Sentinel recalibrating.",
    debug: err.message
  });
});

export default app;
