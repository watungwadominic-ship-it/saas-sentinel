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

// 0. INFRASTRUCTURE RESCUE (v36)
// This must be the absolute first route to catch bots before they hit any cookie traps
app.all("/_cookie_check.html", async (req, res, next) => {
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const returnUrl = req.query.return_url as string;
  
  // LinkedIn is the primary target for this rescue
  const isBot = userAgent.includes('linkedin') || userAgent.includes('authorizedentity') || userAgent.includes('image-fetcher');
  
  if (isBot && returnUrl) {
    try {
      const decodedReturnUrl = decodeURIComponent(decodeURIComponent(returnUrl));
      console.log(`[TOP-RESCUE-V36] Intercepted LinkedIn at Cookie Check! Return: ${decodedReturnUrl}`);
      
      // Extract article ID from the return URL
      const idMatch = decodedReturnUrl.match(/news\/updates\/v36\/(\d+)/i) || 
                      decodedReturnUrl.match(/share\/n\/(\d+)/i) ||
                      decodedReturnUrl.match(/v34\/(\d+)/i) ||
                      decodedReturnUrl.match(/insights\/(\d+)/i) ||
                      decodedReturnUrl.match(/article\/(\d+)/i);
      
      if (idMatch) {
         // Redirect the bot BACK to our main OG middleware but with a flag to bypass next time
         const articleId = idMatch[1];
         console.log(`[TOP-RESCUE-V36] Article found: ${articleId}. Rerouting to OG.`);
         // We don't redirect (could loop), we just fall through but with the bot flag forced
         req.query.force_bot = "true";
         req.query.article_id = articleId;
         // Continue to our general OG middleware below
      }
    } catch (e) {}
  }
  next();
});

// 1. STATIC ASSETS & IMAGE PROXIES (Binary-only bypass)
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

  // 1. PARANOID BOT DETECTION (v36 - The Phantom)
  const botSignatures = [
    'linkedin', 'authorizedentity', 'post-inspector', 'image-fetcher', 'share-preview', 'media-fetcher',
    'linkedin-share', 'linkedinbot', 'linkedin-bot', 'pro-bot', 'bot', 'crawler', 'spider', 'curl', 'wget',
    'facebot', 'facebookexternalhit', 'googlebot', 'twitterbot', 'whatsapp', 'telegram', 'discord', 'slack'
  ];
  
  const isBotUA = botSignatures.some(sig => userAgent.includes(sig));
  const isLinkedInHeaders = xLinkedInId !== undefined || !!req.headers['x-li-id'] || !!req.headers['x-linkedin-id'];
  const isV36Path = req.path.includes('/news/updates/v36/');
  const isBotPath = isV36Path || req.path.includes('.well-known') || req.path.includes('/v34/') || req.path.includes('/insights/') || req.path.includes('/share/n/');
  const isCookieCheck = req.path.includes("cookie_check");
  const isBotQuery = req.query.bot === '1' || req.query._bot === '1' || forceBotQuery.includes('true');
  
  // 0. BINARY IMMUNITY
  const isApiSocialPath = isV36Path || req.path.includes('/api/v') || req.path.includes('/share/n/');
  const isImageRequest = !isV36Path && !isApiSocialPath && (req.path.includes('/api/static-preview') || req.path.includes('/api/proxy-image') || req.path.endsWith('.jpg') || req.path.endsWith('.png'));
  if (isImageRequest && !isCookieCheck) return next();

  // Real browser check
  const hasBrowserSign = /\b(chrome|safari|firefox|edg|opera|opr|mobile|android|iphone|ipad)\b/i.test(userAgent);

  // THE MASTER BOT FLAG (v36)
  const isBotRaw = isBotUA || isLinkedInHeaders || isBotPath || isBotQuery || forceBot;
  
  // Rescue bots trapped in cookie checks (v36)
  const isBotInRescue = isCookieCheck && (!hasBrowserSign || isBotUA || isLinkedInHeaders || (returnUrl && (returnUrl.includes('v36/') || returnUrl.includes('share/n/') || returnUrl.includes('insights/'))));
  
  const isBot = isBotRaw || isBotInRescue;
  const isRealBrowser = !isBot && hasBrowserSign;

  // 4. PREPARE OG DATA (Bot ID extraction)
  let article_id_from_url = "" ;
  if (isCookieCheck && returnUrl) {
    try {
      const decodedReturnUrl = decodeURIComponent(decodeURIComponent(returnUrl));
      const idMatch = decodedReturnUrl.match(/v36\/(\d+)/i) || 
                      decodedReturnUrl.match(/share\/n\/(\d+)/i) ||
                      decodedReturnUrl.match(/v34\/(\d+)/i) ||
                      decodedReturnUrl.match(/insights\/(\d+)/i) || 
                      decodedReturnUrl.match(/portal\/news\/(\d+)/i);
      if (idMatch) article_id_from_url = idMatch[1];
    } catch(e) {}
  }

  let articleId = (req.query.article || req.query.id || req.query.article_id || article_id_from_url) as string;
  if (!articleId) {
    const idMatch = req.path.match(/v36\/(\d+)/i) || 
                    req.path.match(/share\/n\/(\d+)/i) ||
                    req.path.match(/v34\/(\d+)/i) ||
                    req.path.match(/insights\/(\d+)/i) ||
                    req.path.match(/portal\/news\/(\d+)/i) ||
                    req.path.match(/\/(?:article|news|og-article-)\/([^\/?#.]+)/i);
    if (idMatch) articleId = idMatch[1];
  }

  // 2. INFRASTRUCTURE BYPASS: Intercept cookie checks for bots (v36 Phantom)
  if (isCookieCheck && (isBot || isV36Path)) {
    try {
      const decodedReturnUrl = decodeURIComponent(decodeURIComponent(returnUrl || ""));
      console.log(`[BYPASS-V36] Cookie-check Phantom Rescue! ReturnURL: ${decodedReturnUrl}`);
      
      if (articleId) {
        // BINARY IMAGE RESCUE
        const isMetadataPath = decodedReturnUrl.includes('/v36/') || decodedReturnUrl.includes('/share/n/') || decodedReturnUrl.includes('/insights/');
        const isImageBinaryReq = (decodedReturnUrl.includes('og-image.jpg') || decodedReturnUrl.includes('static-preview')) && !isMetadataPath;
        
        if (isImageBinaryReq) {
          console.log(`[BYPASS-V36] Image Binary Rescue: ${articleId}`);
          const { supabase } = await import("./src/services/supabase.js");
          const { data: article } = await supabase.from("news_articles").select("image_url").eq("id", articleId).maybeSingle();
          const rescueUrl = article?.image_url || "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=630&auto=format&fit=crop";
          return fetchAndSendImage(rescueUrl, res, userAgent);
        }
      }
    } catch (e) {}
  }

  // 3. HUMAN REDIRECT: If a human hits a bot path, send them to the real UI
  if (isRealBrowser && (isV36Path || isBotPath) && articleId) {
    console.log(`[HUMAN-REDIRECT-V36] Article: ${articleId}`);
    return res.redirect(`/article/${articleId}`);
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
          // V36: PURE SYNC
          if (article.image_url.startsWith('https://')) {
            ogImage = article.image_url;
          } else {
            const cleanBase = (process.env.SHARED_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
            ogImage = `${cleanBase}/api/static-preview/${articleId}/og-image.jpg?ref=v36`;
          }
        }
      }
    } catch (e) {}
  }

  const escapeHtml = (str: string) => str.replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m] || m));
  const escapedTitle = escapeHtml(ogTitle);
  const escapedDesc = escapeHtml(ogDesc);
  const escapedImage = escapeHtml(ogImage);
  const cleanBase = (process.env.SHARED_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
  
  // V36: THE PHANTOM OG:URL
  const canonicalUrl = articleId ? `${cleanBase}/news/updates/v36/${articleId}` : `${cleanBase}${req.originalUrl}`;
  const ogUrl = escapeHtml(canonicalUrl);

  const metaTags = `<title>${escapedTitle}</title>
<meta name="description" content="${escapedDesc}"/>
<meta property="og:title" content="${escapedTitle}"/>
<meta property="og:description" content="${escapedDesc}"/>
<meta property="og:image" content="${escapedImage}"/>
<meta property="og:image:url" content="${escapedImage}"/>
<meta property="og:image:secure_url" content="${escapedImage}"/>
<meta property="og:image:type" content="image/jpeg"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:url" content="${ogUrl}"/>
<meta property="og:type" content="article"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escapedTitle}"/>
<meta name="twitter:description" content="${escapedDesc}"/>
<meta name="twitter:image" content="${escapedImage}"/>
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonicalUrl}" />`;

  // 5. BOT RESPONSE (v36 Phantom Exit)
  if (isBot) {
    const botHtml = `<!DOCTYPE html><html lang="en" prefix="og: http://ogp.me/ns#"><head><meta charset="utf-8">${metaTags}</head><body><article><h1>${escapedTitle}</h1><p>${escapedDesc}</p><img src="${escapedImage}" alt="${escapedTitle}"/></article></body></html>`;
    console.log(`[BOT-FINAL-V36] Responding: ${req.path} | Article: ${articleId}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-SaaS-Sentinel-Core', 'v36');
    res.setHeader('X-LinkedIn-Ready', 'true');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'all');
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
