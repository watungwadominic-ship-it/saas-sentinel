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

// 0. STATIC ASSETS & IMAGE PROXIES (Bypass EVERYTHING for high performance and crawler safety)
app.use(['/api/static-preview', '/api/proxy-image', '/assets', '/favicon.ico'], (req, res, next) => {
  // These routes MUST bypass the OG middleware to ensure bots get BINARY data, not HTML metadata
  next();
});

app.get("/api/health-check", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// OG Tag Injection Middleware - MUST run before other routes
app.use(async (req, res, next) => {
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const xLinkedInId = req.headers['x-linkedin-id'];
  const xPurpose = req.headers['x-purpose'] || req.headers['purpose'];
  const forceBotQuery = String(req.query.force_bot || '');
  let forceBot = forceBotQuery.includes('true') || req.headers['x-force-bot'] === 'true';
  const returnUrl = req.query.return_url as string;

  // 1. PARANOID BOT DETECTION (v23 - Absolute Priority)
  // We include every possible LinkedIn crawler signature, including the ones they use during redirects.
  const botSignatures = [
    'linkedin', 'authorizedentity', 'post-inspector', 'image-fetcher', 'share-preview', 'media-fetcher',
    'linkedin-share', 'linkedinbot', 'linkedin-bot', 'pro-bot', 'bot', 'crawler', 'spider', 'curl', 'wget',
    'preview', 'facebookexternalhit', 'googlebot', 'slackbot', 'twitterbot', 'whatsapp', 'telegram'
  ];
  
  const isBotUA = botSignatures.some(sig => userAgent.includes(sig));
  const isLinkedInHeaders = xLinkedInId !== undefined || !!req.headers['x-li-id'] || !!req.headers['x-linkedin-id'];
  const isBotPath = req.path.includes('.well-known') || req.path.includes('/og-article-');
  const isCookieCheck = req.path.includes("cookie_check");
  const isBotQuery = req.query.bot === '1' || req.query._bot === '1' || forceBotQuery.includes('true');
  
  // 0. BINARY IMMUNITY (v23)
  // Ensure image routes NEVER run through the bot HTML metadata logic.
  const isImageRequest = req.path.includes('/api/static-preview') || req.path.includes('/api/proxy-image') || req.path.includes('/assets');
  if (isImageRequest && !isCookieCheck) return next();

  // THE MASTER BOT FLAG (v24)
  const isBotRaw = isBotUA || isLinkedInHeaders || isBotPath || isBotQuery || forceBot;
  
  // Rescue bots trapped in cookie checks
  // If we are at _cookie_check and it's not a clear human browser sign, and the return URL looks like an article, assume it's a bot being checked.
  const isBotInRescue = isCookieCheck && (
    isBotUA || 
    isLinkedInHeaders || 
    (returnUrl && (returnUrl.includes('bot') || returnUrl.includes('.well-known') || returnUrl.includes('article') || returnUrl.includes('ref=v'))) ||
    !hasBrowserSign
  );
  
  const isBot = isBotRaw || isBotInRescue;

  // Real browser check - MUST NOT match if it's already a bot.
  // We exclude common bot patterns from the browser check to be safe.
  const hasBrowserSign = /\b(chrome|safari|firefox|edg|opera|opr|mobile|android|iphone|ipad)\b/i.test(userAgent);
  const isRealBrowser = !isBot && hasBrowserSign;

  // 4. PREPARE OG DATA
  let articleId = (req.query.article || req.query.id || req.query.article_id) as string;
  if (!articleId) {
    const idMatch = req.path.match(/\/(?:article|news|og-article-)\/([^\/?#.]+)/i) || 
                    req.path.match(/\/.well-known\/og-article-([^\/?#.]+)/i);
    if (idMatch) articleId = idMatch[1];
  }

  // 2. INFRASTRUCTURE BYPASS: Intercept cookie checks for bots (v26 Titan)
  if (isCookieCheck && isBot) {
    try {
      const decodedReturnUrl = decodeURIComponent(decodeURIComponent(returnUrl || ""));
      console.log(`[BYPASS-V26] Cookie-check Absolute Rescue! ReturnURL: ${decodedReturnUrl}`);
      
      // Article ID Recovery (Super-Hardened v26)
      const idMatch = decodedReturnUrl.match(/\/(?:article|news|og-article-|static-preview)\/([^\/?#.]+)/i) || 
                      decodedReturnUrl.match(/\/.well-known\/og-article-([^\/?#.]+)/i) ||
                      decodedReturnUrl.match(/article%2F(\d+)/) ||
                      decodedReturnUrl.match(/%2F(\d+)(?:%3F|$)/) ||
                      decodedReturnUrl.match(/article_id=(\d+)/) ||
                      decodedReturnUrl.match(/og-article-(\d+)/) ||
                      decodedReturnUrl.match(/\/(\d+)(?:\.html|\?|$)/) ||
                      decodedReturnUrl.match(/\/(\d+)$/);
      
      if (idMatch) {
        articleId = idMatch[1];
        console.log(`[BYPASS-V26] Article ID captured: ${articleId}`);
        
        // BINARY RESCUE: If the bot wanted an image but got trapped in a cookie check, serve the image binary NOW.
        const isImageRescue = decodedReturnUrl.includes('/api/static-preview') || decodedReturnUrl.includes('/api/proxy-image') || decodedReturnUrl.includes('og-image.jpg');
        if (isImageRescue) {
          console.log(`[BYPASS-V26] Image Rescue triggered for Article: ${articleId}`);
          const { supabase } = await import("./src/services/supabase.js");
          const { data: article } = await supabase.from("news_articles").select("image_url").eq("id", articleId).maybeSingle();
          const rescueUrl = article?.image_url || "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=630&auto=format&fit=crop";
          return fetchAndSendImage(rescueUrl, res, userAgent);
        }
      }
    } catch (e) {}
  }

  // 2. SKIP FOR STATIC ASSETS (EXCEPT COOKIE CHECKS OR PROXIED IMAGES)
  const isStatic = /\.(jpg|jpeg|png|gif|svg|webp|css|js|ico|woff|woff2|ttf|otf|map|json)$/i.test(req.path);
  const isProxyPath = req.path.includes('/api/proxy-image');
  
  if (isStatic && !isCookieCheck && !isProxyPath) return next();

  // 3. HUMAN REDIRECT: If a human hits a bot path, send them to the real UI
  if (isRealBrowser && (isBotPath || req.path.includes('.well-known'))) {
    const idMatch = req.path.match(/og-article-([^.]+)\.html/);
    if (idMatch) return res.redirect(`/article/${idMatch[1]}`);
  }

  // 4. PREPARE OG DATA
  let ogTitle = "SaaS Sentinel: AI Market Intelligence";
  let ogDesc = "Elite intelligence analysis of the SaaS landscape.";
  let ogImage = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=630&auto=format&fit=crop";

  if (articleId) {
    try {
      const { supabase } = await import("./src/services/supabase.js");
      const { data: article } = await supabase.from("news_articles").select("*").eq("id", articleId).maybeSingle();
      if (article) {
        ogTitle = article.title;
        ogDesc = (article.summary || article.content || "").substring(0, 200).replace(/[\r\n\t]/gm, " ").trim();
        if (article.image_url) {
          const cleanBase = (process.env.SHARED_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
          // NEW CLEAN STATIC PROXY URL (v26 reset)
          ogImage = `${cleanBase}/api/static-preview/${articleId}/og-image.jpg?ref=v26`;
        }
      }
    } catch (e) {}
  }

  const escapeHtml = (str: string) => str.replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m] || m));
  const escapedTitle = escapeHtml(ogTitle);
  const escapedDesc = escapeHtml(ogDesc);
  const escapedImage = escapeHtml(ogImage);
  const cleanBase = (process.env.SHARED_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
  
  // For bots, we want og:url to point to the scrappable .well-known path (v26)
  // This prevents LinkedIn from following a human redirect and getting lost.
  const botFriendlyUrl = articleId ? `${cleanBase}/.well-known/og-article-${articleId}.html` : `${cleanBase}${req.originalUrl}`;
  const humanUrl = articleId ? `${cleanBase}/article/${articleId}` : `${cleanBase}${req.originalUrl}`;
  const ogUrl = escapeHtml(isBot ? botFriendlyUrl : humanUrl);

  const metaTags = `<title>${escapedTitle}</title><meta name="description" content="${escapedDesc}"/><meta property="og:title" content="${escapedTitle}"/><meta property="og:description" content="${escapedDesc}"/><meta property="og:image" content="${escapedImage}"/><meta property="og:image:url" content="${escapedImage}"/><meta property="og:image:secure_url" content="${escapedImage}"/><meta property="og:image:type" content="image/jpeg"/><meta property="og:image:alt" content="${escapedTitle}"/><meta property="og:url" content="${ogUrl}"/><meta property="og:type" content="article"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${escapedTitle}"/><meta name="twitter:description" content="${escapedDesc}"/><meta name="twitter:image" content="${escapedImage}"/><meta name="twitter:image:src" content="${escapedImage}"/><meta name="robots" content="index, follow, max-image-preview:large"><link rel="image_src" href="${escapedImage}" />`;

  // 5. BOT RESPONSE (v26 Titan Exit)
  if (isBot) {
    const botHtml = `<!DOCTYPE html><html lang="en" prefix="og: http://ogp.me/ns# article: http://ogp.me/ns/article#"><head><meta charset="utf-8">${metaTags}<meta itemprop="image" content="${escapedImage}"/></head><body><article><h1>${escapedTitle}</h1><p>${escapedDesc}</p><img src="${escapedImage}" alt="${escapedTitle}"/></article></body></html>`;
    console.log(`[BOT-FINAL-V26] Responding to Bot | Path: ${req.path} | Article: ${articleId}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Force the verification cookie
    res.setHeader('Set-Cookie', 'ais_bot_verified=true; Path=/; SameSite=None; Secure; Max-Age=3600; HttpOnly');
    return res.status(200).send(botHtml);
  }

  // 6. HUMAN RESPONSE: Inject Tags into index.html
  try {
    const indexPath = path.join(process.cwd(), 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf-8');
      html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
      html = html.replace(/<meta[^>]+(?:property|name)=["']og:[^"']+["'][^>]*>/gi, '');
      html = html.replace(/(<head[^>]*>)/i, `$1${metaTags}`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }
  } catch (e) {}

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
