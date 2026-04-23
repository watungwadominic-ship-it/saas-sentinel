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
        'Referer': 'https://www.linkedin.com/'
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

  if (!forceBot && returnUrl) {
    try {
      const decoded = decodeURIComponent(returnUrl);
      if (decoded.includes('force_bot=true')) forceBot = true;
    } catch (e) {}
  }

  const isLinkedIn = /linkedin/i.test(userAgent) || 
                     userAgent.includes('authorizedentity') || 
                     userAgent.includes('linkedinbot') ||
                     userAgent.includes('apache-httpclient') ||
                     userAgent.includes('post-inspector') ||
                     userAgent.includes('image-fetcher') ||
                     xLinkedInId !== undefined;

  const botRegex = /\b(linkedin|google|facebook|twitter|slack|whatsapp|telegram|discord|crawler|spider|archiver|curl|wget|bot|preview|embed)\b/i;
  const isBotUA = botRegex.test(userAgent) || isLinkedIn;
  const isRealBrowser = /\b(chrome|safari|firefox|edg|opera|opr|mobile|android|iphone|ipad)\b/i.test(userAgent) && !isLinkedIn && !/linkedinbot/i.test(userAgent);
  
  const xHost = req.get('host') || '';
  const isAISDomain = xHost.includes('ais-dev-') || xHost.includes('ais-pre-');
  const isAISPreview = xPurpose === 'preview' || (req.get('referer') || '').includes('aistudio.google.com') || isAISDomain;

  const isBotPath = req.path.includes('.well-known') || req.path.startsWith('/og-article-');
  const isCookieCheck = req.path.includes("cookie_check");
  const isActuallyBot = isBotUA || forceBot;
  const isBot = isActuallyBot && (!isAISDomain || isLinkedIn || forceBot || isBotPath);

  // 1. INFRASTRUCTURE BYPASS: Intercept cookie checks for images
  const isImageProxyInReturnUrl = typeof returnUrl === "string" && returnUrl.includes("/api/proxy-image");
  if (isCookieCheck && isImageProxyInReturnUrl) {
    try {
      const decodedReturnUrl = decodeURIComponent(decodeURIComponent(returnUrl));
      console.log(`[BYPASS] Double-decoded ReturnURL: ${decodedReturnUrl}`);
      
      let actualImageUrl = null;
      const match = decodedReturnUrl.match(/[?&]url=([^&]+)/);
      if (match) actualImageUrl = decodeURIComponent(match[1]);
      
      if (actualImageUrl) {
         console.log(`[BYPASS] Serving proxied image via cookie-check: ${actualImageUrl}`);
         return fetchAndSendImage(actualImageUrl, res, userAgent);
      }
    } catch (e) {}
  }

  // 2. SKIP FOR STATIC ASSETS (EXCEPT COOKIE CHECKS)
  const isStatic = /\.(jpg|jpeg|png|gif|svg|webp|css|js|ico|woff|woff2|ttf|otf|map|json)$/i.test(req.path);
  if (isStatic && !isCookieCheck) return next();

  // 3. HUMAN REDIRECT: If a human hits a bot path, send them to the real UI
  if (isRealBrowser && (isBotPath || req.path.includes('.well-known'))) {
    const idMatch = req.path.match(/og-article-([^.]+)\.html/);
    if (idMatch) return res.redirect(`/article/${idMatch[1]}`);
  }

  // 4. PREPARE OG DATA
  let articleId = (req.query.article || req.query.id || req.query.article_id) as string;
  if (!articleId) {
    const idMatch = req.path.match(/\/(?:article|news|og-article-)\/([^\/?#.]+)/i) || 
                    req.path.match(/\/.well-known\/og-article-([^\/?#.]+)/i);
    if (idMatch) articleId = idMatch[1];
  }

  let ogTitle = "SaaS Sentinel: AI Market Intelligence";
  let ogDesc = "Elite intelligence analysis of the SaaS landscape.";
  let ogImage = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=630&auto=format&fit=crop";

  if (articleId) {
    try {
      const { supabase } = await import("./src/services/supabase.js");
      const { data: article } = await supabase.from("news_articles").select("*").eq("id", articleId).maybeSingle();
      if (article) {
        ogTitle = article.title;
        ogDesc = (article.summary || article.content || "").substring(0, 200);
        if (article.image_url) {
          let resolvedImg = article.image_url.trim();
          if (resolvedImg.startsWith('http')) {
            // Resolution Logic
            if (isLinkedIn) {
              // Direct URL for LinkedIn to avoid local infra issues
              ogImage = resolvedImg;
            } else {
              // Proxy for others to avoid hotlink blocks
              const cleanBase = (process.env.SHARED_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
              ogImage = `${cleanBase}/api/proxy-image?url=${encodeURIComponent(resolvedImg)}&force_bot=true`;
            }
          }
        }
      }
    } catch (e) {}
  }

  const escapeHtml = (str: string) => str.replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m] || m));
  const escapedTitle = escapeHtml(ogTitle);
  const escapedDesc = escapeHtml(ogDesc);
  const escapedImage = escapeHtml(ogImage);
  const ogUrl = escapeHtml(`${(process.env.SHARED_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '')}${req.originalUrl}`);

  const metaTags = `
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDesc}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDesc}" />
    <meta property="og:image" content="${escapedImage}" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:type" content="article" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${escapedImage}" />
    <meta name="robots" content="index, follow, max-image-preview:large">
  `;

  // 5. BOT RESPONSE: Minimal HTML
  if (isBot && !isRealBrowser) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Set-Cookie', 'ais_bot_verified=true; Path=/; SameSite=None; Secure; Max-Age=3600');
    return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">${metaTags}</head><body><article><h1>${escapedTitle}</h1><p>${escapedDesc}</p><img src="${escapedImage}" /></article></body></html>`);
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
app.get(["/api/proxy-image", "/api/proxy-image/:filename"], (req, res) => {
  return fetchAndSendImage(req.query.url as string, res, req.headers['user-agent'] as string);
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
