import * as dotenv from "dotenv";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

// Conditional dotenv - only for local dev
if (!process.env.VERCEL) {
  dotenv.config();
}

console.log("🚀 SaaS Sentinel Server Initializing...");

// Lazy imports to prevent boot crashes on Vercel
let supabase: any;
let gemini: any;
let news_articles: any;

const app = express();
app.set('trust proxy', true);
app.use(express.json());

// Routes that don't need heavy services
app.get("/api/health", (req, res) => {
  return res.status(200).json({ status: "ok", vercel: !!process.env.VERCEL, node: process.version });
});

// Helper to get services safely
async function getServices() {
  if (!supabase) {
    const sb = await import("./src/services/supabase");
    supabase = sb.supabase;
  }
  if (!gemini) {
    gemini = await import("./src/services/gemini");
  }
  if (!news_articles) {
    news_articles = await import("./src/services/news_articles");
  }
  return { supabase, ...gemini, ...news_articles };
}

app.get(["/robots.txt", "/api/robots.txt"], (req, res) => {
  const host = req.get('host') || 'saas-sentinel-cyan.vercel.app';
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  const cleanBase = (process.env.SHARED_APP_URL || `${protocol}://${host}`).replace(/\/$/, '');
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${cleanBase}/sitemap.xml\n`);
});

app.get(["/sitemap.xml", "/api/sitemap.xml"], async (req, res) => {
  const { supabase: _supabase } = await getServices();
  const host = req.get('host') || 'saas-sentinel-cyan.vercel.app';
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  const cleanBase = (process.env.SHARED_APP_URL || `${protocol}://${host}`).replace(/\/$/, '');
  
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  try {
    const { data: articles, error } = await _supabase
      .from("news_articles")
      .select("id, updated_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${cleanBase}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`;

    if (!error && articles) {
      articles.forEach((article: any) => {
        const lastMod = (article.updated_at || article.created_at || new Date().toISOString()).split('T')[0];
        sitemap += `\n  <url><loc>${cleanBase}/article/${article.id}</loc><lastmod>${lastMod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
      });
    }
    sitemap += `\n</urlset>`;
    return res.send(sitemap);
  } catch (err) {
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${cleanBase}/</loc></url>\n</urlset>`);
  }
});

// --- 2. BOT METADATA RESCUE ---
async function serveBotMetadata(articleId: string, req: any, res: any) {
  try {
    const { supabase: _supabase } = await getServices();
    const { data: article } = await _supabase.from("news_articles").select("*").eq("id", articleId).maybeSingle();
    const title = article?.title || "SaaS Intelligence Sentinel";
    const desc = (article?.summary || article?.content || "Real-time SaaS market intelligence.").substring(0, 200);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${title}</title>
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${desc}">
      <meta name="twitter:card" content="summary_large_image">
    </head><body><h1>${title}</h1><p>${desc}</p></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  } catch (e) {
    return res.status(500).send("Bot Rescue Failed");
  }
}

app.use(async (req, res, next) => {
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const isBot = /bot|googlebot|crawler|linkedin|facebook|twitter|slack|whatsapp/i.test(userAgent);
  if (isBot && req.path.startsWith('/article/')) {
    const id = req.path.split('/').pop();
    if (id && /^\d+$/.test(id)) return serveBotMetadata(id, req, res);
  }
  next();
});

// --- 3. IMAGE PROXY HELPERS ---
const fetchAndSendImage = async (imageUrl: string, res: any, userAgentHint: string = "") => {
  if (!imageUrl) return res.status(400).send("Missing URL");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgentHint || 'SaaS Sentinel Bot 1.0',
        'Accept': 'image/*,*/*;q=0.8'
      }
    });

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Upstream ${response.status}`);

    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    clearTimeout(timeoutId);
    res.setHeader("Content-Type", "image/png");
    return res.send(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64"));
  }
};

// ROUTES (Simplified & Grouped)
app.get("/api/static-preview/:articleId/og-image.jpg", async (req, res) => {
  const { articleId } = req.params;
  try {
    const { supabase: _supabase } = await getServices();
    const { data: article } = await _supabase.from("news_articles").select("image_url").eq("id", articleId).maybeSingle();
    if (article?.image_url) {
      return fetchAndSendImage(article.image_url, res, req.headers['user-agent'] as string);
    }
  } catch (e) {}
  // Default fallback image
  return fetchAndSendImage("https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=630&auto=format&fit=crop", res);
});

app.get("/api/proxy-image*", (req, res) => {
  let imageUrl = req.query.url as string;
  
  // If ?url= is missing, try to get it from the path if it looks like a URL
  if (!imageUrl && req.params[0]) {
    const pathPart = req.params[0].replace(/^\//, '');
    if (pathPart.startsWith('http')) imageUrl = pathPart;
  }

  // Fallback to a placeholder if everything fails
  if (!imageUrl) imageUrl = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=630&auto=format&fit=crop";

  return fetchAndSendImage(imageUrl, res, req.headers['user-agent'] as string);
});

// --- OLD SEO ROUTES REMOVED ---
app.get("/api/ping", (req, res) => {
  res.json({ status: "alive", timestamp: new Date().toISOString() });
});

app.get("/api/news", async (req, res) => {
  const { supabase: _supabase } = await getServices();
  const { data } = await _supabase.from("news_articles").select("*").order("created_at", { ascending: false });
  res.json(data);
});

app.get("/api/news/:id", async (req, res) => {
  const { supabase: _supabase } = await getServices();
  const { data } = await _supabase.from("news_articles").select("*").eq("id", req.params.id).maybeSingle();
  res.json(data);
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

const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

// PRODUCTION SERVING OR BUILT ARTIFACTS EXIST
const getDistPath = () => {
  // If we are on Vercel, the dist path is usually relative to the task root
  if (process.env.VERCEL) {
    const vercelPaths = ['/var/task/dist', path.join(process.cwd(), 'dist')];
    for (const vp of vercelPaths) {
      if (fs.existsSync(path.join(vp, 'index.html'))) return vp;
    }
  }

  const possiblePaths = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(__dirname, 'dist'),
    path.join(process.cwd(), 'public')
  ];
  
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p) && fs.lstatSync(p).isDirectory()) {
        const indexPath = path.join(p, 'index.html');
        if (fs.existsSync(indexPath)) {
           return p;
        }
      }
    } catch (e) {}
  }
  return null;
};

const distPath = getDistPath();

if (distPath || isProduction) {
  const finalDistPath = distPath || path.resolve(process.cwd(), 'dist');
  console.log(`[SERVER] Mode: ${isProduction ? 'Production' : 'Static Serving'}. Path: ${finalDistPath}`);

  // Serve static assets with explicit MIME types and cache headers
  app.use('/assets', (req, res, next) => {
    const assetPath = req.path.startsWith('/') ? req.path.slice(1) : req.path;
    const filePath = path.join(finalDistPath, 'assets', assetPath);
    
    if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp'
      };
      if (mimeTypes[ext]) res.setHeader('Content-Type', mimeTypes[ext]);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(filePath);
    }
    next();
  });

  app.use(express.static(finalDistPath, { index: false }));

  app.get('*', (req, res) => {
    if (process.env.VERCEL) {
      return res.status(404).send("Not found");
    }
    
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Endpoint not found' });
    
    if (req.path === '/sitemap.xml' || req.path === '/robots.txt') {
       return res.status(404).send("SEO Route Mismatch");
    }

    const indexFile = path.join(finalDistPath, 'index.html');
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    res.status(500).send("Main bundle missing");
  });
}

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[SERVER-FATAL]", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// --- START SERVER ---
async function startViteDevServer() {
  if (isProduction || process.env.VERCEL) return;
  console.log("[SERVER] Starting Vite Dev Server...");
  try {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } catch (e) {
    console.warn("[SERVER] Vite import failed. This is expected in production/Vercel.");
  }
}

// Start dev server if applicable
startViteDevServer();

export default app;

const PORT = process.env.PORT || 3000;
// We listen if we are NOT on Vercel (where it's serverless)
if (!process.env.VERCEL) {
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🚀 Server fully operational on port ${PORT}`);
  });
}
