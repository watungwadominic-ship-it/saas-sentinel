import express, { Request, Response, NextFunction } from 'express';

const app = express();
app.use(express.json());

// Lazy service loaders to prevent top-level crashes
const getSupabase = async () => (await import("../src/services/supabase")).supabase;
const getGemini = async () => (await import("../src/services/gemini"));
const getNewsArticles = async () => (await import("../src/services/news_articles"));
const getThreads = async () => (await import("../src/services/threads"));

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    vercel: true,
    time: new Date().toISOString()
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
    
    const supabase = await getSupabase();
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
  } catch (err) {
    console.error("Sitemap Generation Error:", err);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>/</loc></url>\n</urlset>`);
  }
});

app.get(["/api/news", "/news"], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = await getSupabase();
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

app.get(["/api/news/:id", "/news/:id"], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = await getSupabase();
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

app.all(["/api/cron/fetch-news", "/cron/fetch-news"], async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log("Vercel Cron fetch-news triggered...");
    const gemini = await getGemini();
    const newsArticles = await getNewsArticles();
    const threads = await getThreads();

    const rawNews = await gemini.fetchTopSaaSNews();
    const stories = await gemini.parseNewsIntoStories(rawNews);
    
    if (stories?.[0]) {
      const articleData = await gemini.generateArticle(stories[0].title, stories[0].snippet);
      const saved = await newsArticles.saveNewsArticle({ ...articleData, source: "SaaS Sentinel", readTime: "4 min read" });
      
      if (saved && saved[0]) {
        console.log(`[BOT] News saved: ${saved[0].title}. Attempting Threads post...`);
        try {
          await threads.postToThreads(saved[0]);
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

app.all(["/api/cron/weekly-newsletter", "/cron/weekly-newsletter"], async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log("Weekly Newsletter Cron triggered...");
    const supabase = await getSupabase();
    const { data: subscribers, error: subError } = await supabase
      .from('subscribers')
      .select('email');
      
    if (subError) throw subError;
    if (!subscribers || subscribers.length === 0) {
      return res.json({ success: true, message: "No subscribers to notify." });
    }

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

    // Dynamic import for content generation since it's the only place and needs heavy SDK
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const newsContext = topArticles.map((a, i) => `${i+1}. ${a.title}: ${a.summary}`).join('\n\n');
    const newsletterPrompt = `Create a high-end HTML newsletter briefing for 'SaaS Sentinel'. 
    Theme: Elite B2B Market Intelligence. 
    Content: Summarize these stories:
    ${newsContext}`;

    const result = await model.generateContent(newsletterPrompt);
    const htmlContent = result.response.text().replace(/```html|```/g, '').trim();

    const nodemailer = await import('nodemailer');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '465');

    const transporter = nodemailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    let sentCount = 0;
    const subject = `Weekly Intelligence Brief: ${topArticles[0].title.substring(0, 50)}...`;
    
    for (const sub of subscribers) {
      try {
        await transporter.sendMail({
          from: `"SaaS Sentinel" <${user}>`,
          to: sub.email,
          subject,
          html: htmlContent
        });
        sentCount++;
      } catch (err) {
        console.error(`Failed to send to ${sub.email}`, err);
      }
    }
    
    res.json({ success: true, sent: sentCount, message: `Newsletter briefing sent to elite subscribers.` });
  } catch (e: any) {
    console.error("Newsletter Cron Error:", e);
    next(e);
  }
});

// Proxy image bypass
app.get(["/api/proxy-image", "/proxy-image"], async (req: Request, res: Response) => {
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

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("🔥 Global API Catch:", err);
  res.status(200).json({ 
    status: "handled_error", 
    message: "Sentinel recalibrating.",
    debug: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;




