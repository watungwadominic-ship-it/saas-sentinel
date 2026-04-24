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

// 0. INFRASTRUCTURE BOT RESCUE (v38)
// If a bot gets trapped by the infrastructure's cookie check, we serve the metadata directly from the trap page.
app.all("/_cookie_check.html", async (req, res, next) => {
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const xLinkedInId = req.headers['x-li-id'] || req.headers['x-linkedin-id'];
  const xRestli = req.headers['x-restli-protocol-version'];
  const returnUrl = req.query.return_url as string || "";
  
  const botSignatures = ['linkedin', 'authorizedentity', 'post-inspector', 'image-fetcher', 'bot', 'crawler', 'spider'];
  const isBotDetected = botSignatures.some(sig => userAgent.includes(sig)) || !!xLinkedInId || !!xRestli;
  
  if (isBotDetected) {
    try {
      const decodedReturnUrl = decodeURIComponent(decodeURIComponent(returnUrl));
      console.log(`[RESCUE-V38] Bot at Trap! URL: ${decodedReturnUrl}`);
      
      const idMatch = decodedReturnUrl.match(/v\d+\/\w+\/(\d+)/i) || 
                      decodedReturnUrl.match(/news\/(\d+)/i) ||
                      decodedReturnUrl.match(/portal\/news\/(\d+)/i) ||
                      decodedReturnUrl.match(/article\/(\d+)/i) ||
                      decodedReturnUrl.match(/api\/\w+\/news\/(\d+)/i);
      
      if (idMatch) {
        console.log(`[RESCUE-V38] Serving metadata directly for ID: ${idMatch[1]}`);
        return serveBotMetadata(idMatch[1], req, res, "v38-rescue");
      }
    } catch (e) {
      console.error("[RESCUE-V38] Error:", e);
    }
  }
  next();
});

// Helper function to serve bot metadata to avoid code duplication
async function serveBotMetadata(articleId: string, req: any, res: any, version: string) {
  let ogTitle = "SaaS Intelligence Portal";
  let ogDesc = "Real-time market insights and AI-driven SaaS intelligence monitoring.";
  let ogImage = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=630&auto=format&fit=crop";

  try {
    const { supabase } = await import("./src/services/supabase.js");
    const { data: article } = await supabase.from("news_articles").select("title, summary, content, image_url").eq("id", articleId).maybeSingle();
    if (article) {
      ogTitle = article.title;
      ogDesc = (article.summary || article.content || "").substring(0, 200).replace(/[\r\n\t]/gm, " ").trim();
      if (article.image_url) {
        ogImage = article.image_url.startsWith('https://') ? article.image_url : 
                  `${(process.env.SHARED_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '')}/api/static-preview/${articleId}/og-image.jpg?ref=${version}`;
      }
    }
  } catch (e) {}

  const escapeHtml = (str: string) => str.replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m] || m));
  const cleanBase = (process.env.SHARED_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
  const canonicalUrl = `${cleanBase}/v38/share/${articleId}`;
  
  const html = `<!DOCTYPE html><html lang="en" prefix="og: http://ogp.me/ns#"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(ogTitle)}</title>
<meta name="description" content="${escapeHtml(ogDesc)}">
<meta property="og:site_name" content="SaaS Sentinel">
<meta property="og:title" content="${escapeHtml(ogTitle)}">
<meta property="og:description" content="${escapeHtml(ogDesc)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(ogTitle)}">
<meta name="twitter:description" content="${escapeHtml(ogDesc)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
<meta name="robots" content="all">
<link rel="canonical" href="${canonicalUrl}" />
</head><body><article><h1>${escapeHtml(ogTitle)}</h1><p>${escapeHtml(ogDesc)}</p><img src="${escapeHtml(ogImage)}"/></article></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-SaaS-Sentinel-Core', version);
  res.setHeader('Vary', 'User-Agent');
  res.setHeader('X-Robots-Tag', 'all');
  return res.status(200).send(html);
}

// 1. OG METADATA MIDDLEWARE (v38 Ghost Protocol)
app.use(async (req, res, next) => {
  // Static assets and internal API bypass
  if (req.path.includes('/api/static-preview') || req.path.includes('/api/proxy-image') || req.path.includes('/api/auth') || req.path.includes('/assets/')) {
    return next();
  }

  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const forceBotQuery = (req.query.force_bot || req.query.bot || "") as string;

  // 1. Bot Identification
  const botSignatures = ['linkedin', 'authorizedentity', 'post-inspector', 'image-fetcher', 'bot', 'crawler', 'spider', 'whatsapp', 'slack', 'discord'];
  const isBotSigs = botSignatures.some(sig => userAgent.includes(sig));
  const isLinkedInHeaders = !!req.headers['x-li-id'] || !!req.headers['x-linkedin-id'] || !!req.headers['x-restli-protocol-version'];
  const isBotQuery = forceBotQuery.includes('true') || req.query.bot === '1' || req.query._bot === '1';
  
  // REAL BROWSER SIGNATURE (High precision)
  const hasBrowserSign = /\b(chrome|safari|firefox|edg|opera|opr|mobile|android|iphone|ipad)\b/i.test(userAgent);
  
  // Bot classification is NEVER path-dependent for redirects
  const isActuallyBot = (isBotSigs || isLinkedInHeaders || isBotQuery) && !userAgent.includes('mozilla');
  const isSuspicious = (isBotSigs || isLinkedInHeaders || isBotQuery); // Might be bot, might be browser

  // 2. Path Recognition
  const isV38Path = req.path.includes('/v38/share/');
  const isSharePath = isV38Path || req.path.includes('/insights/') || req.path.includes('/v34/') || req.path.includes('/api/v37/');
  const isCookieCheck = req.path.includes("cookie_check");

  if (isCookieCheck) return next();

  // 3. HUMAN REDIRECT: If a real browser hits a sharing path, send them to the app
  if (hasBrowserSign && !isActuallyBot && isSharePath) {
    const idMatch = req.path.match(/\/(\d+)/);
    if (idMatch) {
       console.log(`[HUMAN-REDIRECT-V38] Redirecting human from ${req.path} to /article/${idMatch[1]}`);
       return res.redirect(`/article/${idMatch[1]}`);
    }
  }

  // 4. BOT RESPONSE: If it's a bot OR if it's a sharing path and not a clear human
  if (isActuallyBot || isSharePath) {
    let articleId = (req.query.article_id || req.query.id) as string;
    if (!articleId) {
      const match = req.path.match(/\/(\d+)/);
      if (match) articleId = match[1];
    }

    if (articleId) {
      console.log(`[BOT-SERVE-V38] Responding to ${userAgent.substring(0, 50)} at ${req.path}`);
      return serveBotMetadata(articleId, req, res, "v38-ghost");
    }
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
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(process.cwd(), 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
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
