import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

console.log("🚀 SaaS Sentinel Server Starting...");

const app = express();
app.set('trust proxy', true);
app.use(express.json());

// Shared Image Proxy Helper
const fetchAndSendImage = async (imageUrl: string, res: any, userAgentHint: string = "") => {
  if (!imageUrl) return res.status(400).send("Missing URL");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

  try {
    console.log(`[PROXY-HELPER] Fetching: ${imageUrl}`);
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgentHint || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24h
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow"); 
    
    if (userAgentHint && userAgentHint.toLowerCase().includes('linkedin')) {
      res.setHeader("X-LinkedIn-Ready", "true");
    }
    
    // Clear cookies for image requests to prevent interference
    res.setHeader('Set-Cookie', 'ais_bot_verified=true; Path=/; SameSite=None; Secure; Max-Age=3600; HttpOnly');

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`[PROXY-HELPER-ERROR] ${error.name === 'AbortError' ? 'Timeout' : error.message} for ${imageUrl}`);
    res.setHeader("Content-Type", "image/png");
    return res.send(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64"));
  }
};

// --- CORE MIDDLEWARE START (CRITICAL ORDER) ---

// 0. SUPREME BOT RESCUE (v48 Stealth Hardened)
app.all(['/_cookie_check.html', '/cookie_check', '/security_check'], async (req, res, next) => {
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const returnUrl = (req.query.return_url as string || req.query.return_path as string || "").trim();
  
  // High-priority LinkedIn/Social detection
  const isLinkedIn = userAgent.includes('linkedin') || userAgent.includes('social-preview') || userAgent.includes('bot') || userAgent.includes('crawler');
  const referer = (req.headers['referer'] || "").toLowerCase();
  
  if (!returnUrl && !isLinkedIn && !referer.includes('linkedin')) return next();

  let decoded = returnUrl;
  try { if (returnUrl) decoded = decodeURIComponent(returnUrl); } catch(e) {}
  if (decoded.includes('%')) { try { decoded = decodeURIComponent(decoded); } catch(e) {} }

  // Extract ID from anywhere possible (URL, referer, or platform context)
  const idMatch = decoded.match(/\/(\d+)/) || 
                  req.path.match(/\/(\d+)/) || 
                  referer.match(/\/(\d+)/) ||
                  decoded.match(/[?&]article_id=(\d+)/i);

  if (idMatch) {
     const articleId = idMatch[1];
     console.log(`[RESCUE-V48] Hardened Intercept for ID: ${articleId} | Target: ${decoded.substring(0, 40)}`);
     
     if (decoded.includes('/og-image.jpg')) {
        const { supabase } = await import("./src/services/supabase.js");
        const { data } = await supabase.from("news_articles").select("image_url").eq("id", articleId).maybeSingle();
        if (data?.image_url) return fetchAndSendImage(data.image_url, res, userAgent);
     }
     
     res.cookie('ais_bot_verified', 'true', { maxAge: 3600000, path: '/', sameSite: 'none', secure: true });
     return serveBotMetadata(articleId, req, res, "v48-rescue");
  }
  next();
});

async function serveBotMetadata(articleId: string, req: any, res: any, version: string) {
  let ogTitle = "SaaS Intelligence Sentinel";
  let ogDesc = "Real-time market insights and AI-driven SaaS intelligence monitoring.";
  let ogImage = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=630&auto=format&fit=crop";

  try {
    const { supabase } = await import("./src/services/supabase.js");
    const { data: article } = await supabase.from("news_articles").select("*").eq("id", articleId).maybeSingle();
    if (article) {
      ogTitle = (article.title || ogTitle).substring(0, 95);
      ogDesc = (article.summary || article.content || "").substring(0, 250).replace(/[\r\n\t]/gm, " ").trim();
      if (article.image_url) {
        const cleanBase = (process.env.SHARED_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
        ogImage = `${cleanBase}/api/static-preview/${articleId}/og-image.jpg?v=${version}`;
      }
    }
  } catch (e) {}

  const escapeHtml = (str: string) => str.replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m] || m));
  const cleanBase = (process.env.SHARED_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
  const canonicalUrl = `${cleanBase}/news/v48/article/${articleId}/index.html`;
  
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(ogTitle)}</title>
<meta name="description" content="${escapeHtml(ogDesc)}">
<meta property="og:title" content="${escapeHtml(ogTitle)}">
<meta property="og:site_name" content="SaaS Sentinel Intelligence">
<meta property="og:description" content="${escapeHtml(ogDesc)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonicalUrl}" />
<style>body{background:#fff;font-family:sans-serif;max-width:800px;margin:2rem auto;padding:1rem}img{width:100%;border-radius:12px;margin:1.5rem 0}h1{font-size:32px;margin-bottom:1rem}p{font-size:18px;line-height:1.6;color:#333}</style>
</head><body><article><h1>${escapeHtml(ogTitle)}</h1><p>${escapeHtml(ogDesc)}</p><img src="${escapeHtml(ogImage)}"></article></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Bot-Rescue', version);
  return res.status(200).send(html);
}

app.use(async (req, res, next) => {
  if (req.path.startsWith('/api/static-preview') || req.path.startsWith('/api/proxy-image') || req.path.startsWith('/assets/')) return next();
  
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const isRealBrowser = /\b(chrome|safari|firefox|edg|opera|opr|mobile|android|iphone|ipad)\b/i.test(userAgent) && userAgent.includes('mozilla');
  const isSharePath = req.path.includes('/news/') || req.path.includes('/share/') || req.path.includes('/v');
  const isDirectAppPath = req.path.startsWith('/article/');

  // Fix human redirect loop: Only redirect legacy share paths to the clean app path
  if (isRealBrowser && isSharePath && !isDirectAppPath) {
    const idMatch = req.path.match(/\/(\d+)/);
    if (idMatch) return res.redirect(`/article/${idMatch[1]}`);
    return res.redirect('/');
  }

  // Bot rescue on any share-like path
  if (!isRealBrowser && (isSharePath || isDirectAppPath)) {
    const idMatch = req.path.match(/\/(\d+)/);
    if (idMatch) return serveBotMetadata(idMatch[1], req, res, "v48-phantom");
  }
  next();
});

// --- CORE MIDDLEWARE END ---

// ROUTES (Simplified & Grouped)
app.get("/api/static-preview/:articleId/og-image.jpg", async (req, res) => {
  const { articleId } = req.params;
  try {
    const { supabase } = await import("./src/services/supabase.js");
    const { data: article } = await supabase.from("news_articles").select("image_url").eq("id", articleId).maybeSingle();
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

app.get("/api/news", async (req, res) => {
  const { supabase } = await import("./src/services/supabase.js");
  const { data } = await supabase.from("news_articles").select("*").order("created_at", { ascending: false });
  res.json(data);
});

app.get("/api/news/:id", async (req, res) => {
  const { supabase } = await import("./src/services/supabase.js");
  const { data } = await supabase.from("news_articles").select("*").eq("id", req.params.id).maybeSingle();
  res.json(data);
});

app.all("/api/cron/fetch-news", async (req, res) => {
  try {
    const { fetchTopSaaSNews, parseNewsIntoStories, generateArticle } = await import("./src/services/gemini.js");
    const { saveNewsArticle } = await import("./src/services/news_articles.js");
    const rawNews = await fetchTopSaaSNews();
    const stories = await parseNewsIntoStories(rawNews);
    if (stories?.[0]) {
      const articleData = await generateArticle(stories[0].title, stories[0].snippet);
      await saveNewsArticle({ ...articleData, source: "SaaS Sentinel", readTime: "4 min read" });
      res.json({ success: true });
    } else res.json({ success: false });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PRODUCTION SERVING
if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  const distPath = path.resolve(process.cwd(), 'dist');
  console.log(`[SERVER] Production mode. Serving static from: ${distPath}`);
  
  // Explicitly serve assets folder first
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true
  }));

  // Serve other static files
  app.use(express.static(distPath, {
    index: false,
    maxAge: '1d'
  }));

  app.get('*', (req, res) => {
    // Prevent serving index.html for missing assets
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff2?|webp|html)$/i) && !req.path.endsWith('index.html')) {
      console.log(`[SERVER] 404 for asset: ${req.path}`);
      return res.status(404).send('Not found');
    }
    
    const indexFile = path.resolve(distPath, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.sendFile(indexFile);
    } else {
      console.error(`[SERVER] ERROR: Build output missing index.html at ${indexFile}`);
      res.status(500).send("Application build artifacts missing. Contact administrator.");
    }
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
