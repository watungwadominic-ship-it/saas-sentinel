import express, { Request, Response, NextFunction } from 'express';
import { supabase } from "../src/services/supabase";
import * as gemini from "../src/services/gemini";
import * as newsArticles from "../src/services/news_articles";
import { postToThreads } from "../src/services/threads";

import nodemailer from 'nodemailer';

const app = express();

// Helper to send email
async function sendEmail(to: string, subject: string, html: string) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465');

  if (!user || !pass) {
    console.warn(`[MAIL-WARN] SMTP credentials missing. Skipping email to ${to}`);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  try {
    await transporter.sendMail({
      from: `"SaaS Sentinel Intelligence" <${user}>`,
      to,
      subject,
      html
    });
    return true;
  } catch (error) {
    console.error(`[MAIL-ERROR] Failed to send to ${to}:`, error);
    return false;
  }
}

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    vercel: true,
    time: new Date().toISOString(),
    config: {
      supabase: !!process.env.SUPABASE_URL,
      gemini: !!process.env.GEMINI_API_KEY
    }
  });
});

app.get(["/robots.txt", "/api/robots.txt"], (req: Request, res: Response) => {
  const host = req.get('host') || 'saas-sentinel-cyan.vercel.app';
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  const base = `${protocol}://${host}`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
});

app.get(["/sitemap.xml", "/api/sitemap.xml"], async (req: Request, res: Response) => {
  try {
    const host = req.get('host') || 'saas-sentinel-cyan.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
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

    articles.forEach((a: any) => {
      const mod = (a.updated_at || a.created_at || new Date().toISOString()).split('T')[0];
      sitemap += `\n  <url><loc>${base}/article/${a.id}</loc><lastmod>${mod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
    });
    
    sitemap += `\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(sitemap);
  } catch (err) {
    console.error("Sitemap Generation Error:", err);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>/</loc></url>\n</urlset>`);
  }
});

// Proxy image to bypass CORS and prevent direct hotlinking crashes
app.get("/api/proxy-image", async (req: Request, res: Response) => {
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

app.get("/api/news", async (req: Request, res: Response, next: NextFunction) => {
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

app.get("/api/news/:id", async (req: Request, res: Response, next: NextFunction) => {
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

app.all("/api/cron/fetch-news", async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log("Vercel Cron triggered...");
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
});

// Weekly Intelligence Newsletter Cron
app.all("/api/cron/weekly-newsletter", async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log("Weekly Newsletter Cron triggered...");
    
    // 1. Fetch all subscribers
    const { data: subscribers, error: subError } = await supabase
      .from('subscribers')
      .select('email');
      
    if (subError) throw subError;
    if (!subscribers || subscribers.length === 0) {
      return res.json({ success: true, message: "No subscribers to notify." });
    }

    // 2. Fetch top news from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: topArticles, error: articleError } = await supabase
      .from('news_articles')
      .select('title, summary, id')
      .gt('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (articleError) throw articleError;
    if (!topArticles || topArticles.length === 0) {
      return res.json({ success: true, message: "No news to share this week." });
    }

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // 3. Generate Newsletter Content with Gemini
    const newsContext = topArticles.map((a, i) => `${i+1}. ${a.title}: ${a.summary}`).join('\n\n');
    const newsletterPrompt = `Create a high-end HTML newsletter for 'SaaS Sentinel'. 
    Theme: Elite B2B Market Intelligence. 
    Content: Summarize these stories.
    Stories:
    ${newsContext}`;

    const result = await model.generateContent(newsletterPrompt);
    const htmlContent = result.response.text().replace(/```html|```/g, '').trim();

    // 4. Send emails
    let sentCount = 0;
    const subject = `Weekly Intelligence: ${topArticles[0].title.substring(0, 40)}...`;
    
    for (const sub of subscribers) {
      const success = await sendEmail(sub.email, subject, htmlContent);
      if (success) sentCount++;
    }
    
    res.json({ 
      success: true, 
      recipients: subscribers.length,
      sent: sentCount,
      articleCount: topArticles.length,
      message: `Newsletter briefing sent to ${sentCount} elite subscribers.`
    });
  } catch (e: any) {
    console.error("Newsletter Cron Error:", e);
    next(e);
  }
});

// Global Error Handler to prevent 5xx crashes
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("🔥 GLOBAL API ERROR:", err);
  // Return 200 with error data to avoid Google indexing penalty for 5xx
  res.status(200).json({ 
    status: "handled_error", 
    message: "The Sentinel is currently recalibrating systems.",
    debug: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;


