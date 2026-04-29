import express from "express";
import path from "path";
import fs from "fs";

// SaaS Sentinel - Vercel Optimized Entry Point
console.log("🚀 SaaS Sentinel initializing...");

const app = express();
app.set('trust proxy', true);
app.use(express.json());

// Import services statically for Vercel bundling
// We use lazy initialization in the routes to ensure startup is fast
import { supabase } from "./src/services/supabase";
import * as gemini from "./src/services/gemini";
import * as newsArticles from "./src/services/news_articles";

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
    sitemap += `\n  <url><loc>${base}/archive</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`;
    sitemap += `\n  <url><loc>${base}/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
    sitemap += `\n  <url><loc>${base}/privacy</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`;

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
    console.error("Sitemap Error:", err);
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>/</loc></url>\n</urlset>`);
  }
});

app.get("/api/news", async (req, res) => {
  try {
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
    console.log("Cron job triggered...");
    const rawNews = await gemini.fetchTopSaaSNews();
    const stories = await gemini.parseNewsIntoStories(rawNews);
    if (stories?.[0]) {
      const articleData = await gemini.generateArticle(stories[0].title, stories[0].snippet);
      await newsArticles.saveNewsArticle({ ...articleData, source: "SaaS Sentinel", readTime: "4 min read" });
      res.json({ success: true });
    } else res.json({ success: false });
  } catch (e: any) { 
    console.error("Cron Error:", e);
    res.status(500).json({ error: e.message }); 
  }
});

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
    return res.redirect(imageUrl);
  }
});

// 5. VITE MIDDLEWARE & STATIC SERVING
async function startServer() {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    try {
      console.log("🛠️ Setting up Vite middleware...");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Vite failed to initialize:", e);
    }
  } 
  
  if (!process.env.VERCEL) {
    const dist = path.resolve(process.cwd(), "dist");
    app.use(express.static(dist, { index: false }));
    
    app.get("*", (req: any, res: any, next: any) => {
      if (req.path.startsWith("/api")) return next();
      const indexPath = path.join(dist, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        if (process.env.NODE_ENV !== "production") return next();
        res.status(404).send("Frontend assets not built.");
      }
    });

    const PORT = parseInt(process.env.PORT || "3000", 10);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`📡 Sentinel active at http://0.0.0.0:${PORT}`);
    });
  }
}

// Only call startServer if NOT on Vercel
if (!process.env.VERCEL) {
  startServer().catch(err => console.error("StartServer failure:", err));
}

export default app;
