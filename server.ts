import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

// SaaS Sentinel - Vercel Optimized Entry Point
console.log("🚀 SaaS Sentinel initializing...");

const app = express();
app.set('trust proxy', true);
app.use(express.json());

// 1. SERVICES HELPER (Dynamic for Vercel)
async function getServices() {
  try {
    const sb = await import("./src/services/supabase");
    const gemini = await import("./src/services/gemini");
    const newsArticles = await import("./src/services/news_articles");
    return { supabase: sb.supabase, ...gemini, ...newsArticles };
  } catch (err) {
    console.error("CRITICAL: Failed to load services", err);
    throw err;
  }
}

// 2. CORE SYSTEM ROUTES (FASTEST)
app.get("/api/health", (req, res) => {
  console.log("Health check pulse...");
  res.json({ 
    status: "ok", 
    vercel: !!process.env.VERCEL, 
    time: new Date().toISOString(),
    node: process.version,
    env: process.env.NODE_ENV
  });
});

app.get(["/robots.txt", "/api/robots.txt"], (req, res) => {
  const host = req.get('host') || 'saas-sentinel-cyan.vercel.app';
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  const base = (process.env.SHARED_APP_URL || `${protocol}://${host}`).replace(/\/$/, '');
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
});

// 3. INTELLIGENCE ROUTES
app.get(["/sitemap.xml", "/api/sitemap.xml"], async (req, res) => {
  try {
    const { supabase } = await getServices();
    const host = req.get('host') || 'saas-sentinel-cyan.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
    const base = (process.env.SHARED_APP_URL || `${protocol}://${host}`).replace(/\/$/, '');
    
    const { data: articles } = await supabase
      .from("news_articles")
      .select("id, updated_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    sitemap += `\n  <url><loc>${base}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`;

    if (articles) {
      articles.forEach((a: any) => {
        const mod = (a.updated_at || a.created_at || new Date().toISOString()).split('T')[0];
        sitemap += `\n  <url><loc>${base}/article/${a.id}</loc><lastmod>${mod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
      });
    }
    sitemap += `\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(sitemap);
  } catch (err) {
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>/</loc></url>\n</urlset>`);
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const { supabase } = await getServices();
    const limit = parseInt(req.query.limit as string) || 20;
    const { data, error } = await supabase
      .from("news_articles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/news/:id", async (req, res) => {
  try {
    const { supabase } = await getServices();
    const { data, error } = await supabase
      .from("news_articles")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    
    if (error) throw error;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.all("/api/cron/fetch-news", async (req, res) => {
  try {
    const services = await getServices();
    const rawNews = await services.fetchTopSaaSNews();
    const stories = await services.parseNewsIntoStories(rawNews);
    if (stories?.[0]) {
      const articleData = await services.generateArticle(stories[0].title, stories[0].snippet);
      await services.saveNewsArticle({ ...articleData, source: "SaaS Sentinel", readTime: "4 min read" });
      res.json({ success: true });
    } else res.json({ success: false });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 4. IMAGE & BOT ENGINE
app.get("/api/proxy-image", async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) return res.status(400).send("No URL");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SaaS-Sentinel-Bot/1.0' }
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error("Upstream error");
    
    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    return res.send(Buffer.from(buffer));
  } catch (e) {
    clearTimeout(timeoutId);
    return res.redirect(imageUrl); // Fallback to direct URL if proxy fails
  }
});

// 5. STATIC SERVING (FOR NON-VERCEL ENVS)
let __dirname = "";
try {
  __dirname = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
  // Safe fallback for Vercel
  __dirname = process.cwd();
}

if (!process.env.VERCEL) {
  const dist = path.resolve(__dirname, "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return res.status(404).end();
      res.sendFile(path.join(dist, "index.html"));
    });
  }
}

// 6. EXPORT & LISTEN / ERROR HANDLING
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Express Error:", err);
  res.status(500).json({ error: "Express Router Failure", details: err.message });
});

export default app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`📡 Sentinel locally active at http://localhost:${PORT}`);
  });
}

