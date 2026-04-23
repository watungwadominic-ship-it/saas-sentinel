import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

console.log("🚀 Server starting...");

const app = express();
app.set('trust proxy', true);
app.use(express.json());

// Health Check for Vercel and AIS
app.get("/api/health-check", (req, res) => {
  // ...
});

// Image Proxy to bypass social media crawler restrictions
app.get(["/api/proxy-image", "/api/proxy-image/:filename"], async (req, res) => {
  const imageUrl = req.query.url as string;
  return fetchAndSendImage(imageUrl, res);
});

// API Routes
app.get("/api/health", async (req, res) => {
  try {
    const { supabase } = await import("./src/services/supabase.js");
    const { data, error } = await supabase.from('news_articles').select('id').limit(1);
    if (error) throw error;
    res.status(200).json({ status: "OK", database: "Connected", count: data.length });
  } catch (err: any) {
    console.error("[DEBUG] Health check database error:", err.message);
    res.status(200).json({ status: "OK", database: "Error", message: err.message });
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const { supabase } = await import("./src/services/supabase.js");
    const { data, error } = await supabase
      .from("news_articles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/news/:id", async (req, res) => {
  try {
    const { supabase } = await import("./src/services/supabase.js");
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

// Cron Handlers
app.all("/api/cron/fetch-news", async (req, res) => {
  try {
    console.log("Cron trigger: Fetching news...");
    const { fetchTopSaaSNews, parseNewsIntoStories, generateArticle } = await import("./src/services/gemini.js");
    const { saveNewsArticle } = await import("./src/services/news_articles.js");
    
    const rawNews = await fetchTopSaaSNews();
    const stories = await parseNewsIntoStories(rawNews);
    
    if (stories && stories.length > 0) {
      const story = stories[0];
      const articleData = await generateArticle(story.title, story.snippet);
      
      const savedArticle = await saveNewsArticle({
        ...articleData,
        source: "SaaS Sentinel Intelligence",
        readTime: "4 min read"
      });

      res.json({ success: true, article: savedArticle?.[0]?.title || "Saved" });
    } else {
      res.json({ success: true, message: "No new stories found." });
    }
  } catch (e: any) {
    console.error("Cron Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Shared Image Proxy Helper
const fetchAndSendImage = async (imageUrl: string, res: any) => {
  if (!imageUrl) return res.status(400).send("Missing URL");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    console.log(`[PROXY-HELPER] Fetching: ${imageUrl}`);
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://www.linkedin.com/' // Mimic LinkedIn referer
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24h
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow"); // Don't index proxied images
    // LinkedIn-specific headers for images
    if (isBotUA && req.path.includes('proxy-image')) {
      res.setHeader("X-LinkedIn-Ready", "true");
      res.setHeader("X-Content-Type-Options", "nosniff");
    }

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`[PROXY-HELPER-ERROR] ${error.name === 'AbortError' ? 'Timeout' : error.message} for ${imageUrl}`);
    
    // Fallback logic
    try {
      const fallbackUrl = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200&h=630";
      const fallbackResponse = await fetch(fallbackUrl);
      if (fallbackResponse.ok) {
        const contentType = fallbackResponse.headers.get("content-type") || "image/jpeg";
        res.setHeader("Content-Type", contentType);
        const arrayBuffer = await fallbackResponse.arrayBuffer();
        return res.send(Buffer.from(arrayBuffer));
      }
    } catch (e) {}
    
    res.setHeader("Content-Type", "image/png");
    return res.send(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64"));
  }
};

// OG Tag Injection Middleware
app.use(async (req, res, next) => {
  // Log all requests to help debug bot traffic and redirects
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const accept = (req.headers.accept || "").toLowerCase();
  const xLinkedInId = req.headers['x-linkedin-id'];
  const xPurpose = req.headers['x-purpose'] || req.headers['purpose'];
  // Force bot mode for testing - more robust check to handle malformed query strings
  const forceBotQuery = String(req.query.force_bot || '');
  let forceBot = forceBotQuery.includes('true') || req.headers['x-force-bot'] === 'true';
  
  // Also check for force_bot in the return_url if present (infrastructure cookie checks)
  if (!forceBot && req.query.return_url) {
    try {
      const decoded = decodeURIComponent(req.query.return_url as string);
      if (decoded.includes('force_bot=true')) {
        forceBot = true;
        console.log(`[DEBUG-COOKIE] Force bot detected in return_url`);
      }
    } catch (e) {}
  }

  const isLinkedIn = /linkedin/i.test(userAgent) || 
                     userAgent.includes('authorizedentity') || 
                     userAgent.includes('linkedinbot') ||
                     userAgent.includes('linkedin-bot') ||
                     userAgent.includes('authorized-entity') ||
                     userAgent.includes('apache-httpclient') ||
                     userAgent.includes('linkedin-post-inspector') ||
                     userAgent.includes('post-inspector') ||
                     userAgent.includes('linkedin-image-fetcher') ||
                     userAgent.includes('image-fetcher') ||
                     userAgent.includes('linkedin-share') ||
                     userAgent.includes('linkedin-reader') ||
                     userAgent.includes('ms-office') ||
                     userAgent.includes('office-collaboration') ||
                     userAgent.includes('microsoft-link-preview') ||
                     xLinkedInId !== undefined;
                     
  const xForwardedHost = req.get('x-forwarded-host') || '';
  const xHost = req.get('host') || '';
  const referer = req.get('referer') || '';
  const isAISDomain = xForwardedHost.startsWith('ais-dev-') ||
                      xHost.startsWith('ais-dev-') ||
                      xForwardedHost.startsWith('ais-pre-') ||
                      xHost.startsWith('ais-pre-');
  
  const isAISPreview = xPurpose === 'preview' || 
                       referer.includes('aistudio.google.com') ||
                       referer.includes('localhost:3000') ||
                       isAISDomain;

  // Unified Bot Detection
  const botRegex = /\b(linkedin|google|facebook|twitter|slack|whatsapp|telegram|discord|apple|pinterest|reddit|vk|archive|crawler|spider|archiver|curl|wget|well-known|authorizedentity|authorized-entity|apache-httpclient|validator|scraper|metadata|og-tag|social-share|inspection|prefetch|bot|externalhit|preview|embed|inspection|phantomjs|headless|screenshot|link-preview)\b/i;
  const isBotUA = botRegex.test(userAgent) || isLinkedIn;
  
  const isRealBrowser = /\b(chrome|safari|firefox|edg|opera|opr|google-cloud-preview)\b/i.test(userAgent) && !isBotUA;
  
  // AIS PREVIEW FIX: If it's a real browser and not a bot, let Vite handle it immediately (fixes white screen)
  if (!isRealBrowser || isBotUA || isLinkedIn || req.path.includes('.well-known')) {
    // Keep processing for bots
  } else {
    if (process.env.NODE_ENV !== "production" || !req.path.includes('/article/')) {
        return next();
    }
  }
  
  const ls = String(req.query.ls || '');
  const _bot = String(req.query._bot || '');
  const botParam = String(req.query.bot || '');
  
  // Explicit signals that override browser detection
  const isExplicitBot = forceBot || isLinkedIn || ls === '1' || _bot === '1' || botParam === '1' ||
                        (req.headers['x-fb-http-engine'] !== undefined) ||
                        (req.headers['x-linkedin-id'] !== undefined) ||
                        (req.headers['x-force-bot'] === 'true') ||
                        req.path.includes('.well-known');

  // Extract article ID from query or path
  let articleId = (req.query.article as string) || (req.query.article_id as string) || (req.query.id as string) || (req.query.articleId as string);
  
  // Path-based extraction
  if (!articleId) {
    const pathParts = req.path.split("/");
    if (pathParts[1] === "article" || pathParts[1] === "news") {
      articleId = pathParts[2].split(/[\/?#\s\.\\]/)[0];
    } else if (pathParts[1] === "api" && pathParts[2] === "og" && pathParts[3] === "article") {
      (req as any).isOgApiRoute = true;
      articleId = pathParts[4].split(/[\/?#\s\.\\]/)[0];
    } else if (pathParts[1] === "og" && pathParts[2] === "article") {
      (req as any).isOgApiRoute = true;
      articleId = pathParts[3].split(/[\/?#\s\.\\]/)[0];
    } else if (req.path.startsWith("/og-article-") && req.path.endsWith(".html")) {
      (req as any).isOgApiRoute = true;
      const match = req.path.match(/\/og-article-([^\.]+)\.html/);
      if (match) articleId = match[1];
    } else if (req.path.startsWith("/.well-known/og-article-") && req.path.endsWith(".html")) {
      (req as any).isOgApiRoute = true;
      const match = req.path.match(/\/\.well-known\/og-article-([^\.]+)\.html/);
      if (match) articleId = match[1];
    }
  }

  // Handle return_url early for bot identification
  const returnUrl = req.query.return_url as string;
  if (!articleId && returnUrl) {
    try {
      const decodedReturnUrl = decodeURIComponent(decodeURIComponent(returnUrl));
      if (decodedReturnUrl.includes('force_bot=true')) forceBot = true;
      
      const idMatch = decodedReturnUrl.match(/og-article-(\d+)/i) || 
                      decodedReturnUrl.match(/\/(?:article|news)\/(\d+)/i) ||
                      decodedReturnUrl.match(/\/(?:article|news|api\/og\/article|\.well-known\/og-article-|og-article-)\/([^\/?#\s\.\\]+)/i);
      if (idMatch) {
        articleId = idMatch[1].split(/[\/?#\s\.\\]/)[0];
      }
    } catch (e) {}
  }

  // Final Bot Verdict
  const isBotPath = (req as any).isOgApiRoute || req.path.includes('.well-known');
  const isCookieCheck = req.path === "/__cookie_check.html" || req.path === "/_cookie_check.html" || req.path.includes("cookie_check");
  const isActuallyBot = isBotUA || isExplicitBot || (isBotPath && !isRealBrowser);
  // LinkedIn and explicit bots should bypass pre-deployment domain restrictions
  const isBot = isActuallyBot && (!isAISDomain || isLinkedIn || forceBot || isBotPath || isExplicitBot);
  
  if (isBot) {
    console.log(`[BOT-DETECTED] Path: ${req.path} | UA: ${userAgent.substring(0, 70)} | isLinkedIn: ${isLinkedIn} | isBotPath: ${isBotPath}`);
  }
  
  if (isBotUA || isExplicitBot || forceBot || (req as any).isOgApiRoute) {
    console.log(`[BOT-CHECK] isBot: ${isBot} | isExplicitBot: ${isExplicitBot} | isBotUA: ${isBotUA} | isAISPreview: ${isAISPreview} | isLinkedIn: ${isLinkedIn} | forceBot: ${forceBot} | isOgApiRoute: ${(req as any).isOgApiRoute} | UA: ${userAgent.substring(0, 70)}`);
  }

  // Detailed logging for all non-static requests to debug bot traffic
  if (!req.path.includes(".") || isBot || req.path === "/__cookie_check.html") {
    console.log(`[DEBUG-REQ] ${req.method} ${req.path} | Agent: ${userAgent.substring(0, 60)}... | Article: ${articleId} | isBot: ${isBot} | isLinkedIn: ${isLinkedIn}`);
  }

  // CRITICAL: Skip static assets (images, css, js) - even for bots!
  // UNLESS it's a cookie check path which we need to intercept
  const isStaticAsset = /\.(jpg|jpeg|png|gif|svg|webp|css|js|ico|woff|woff2|ttf|otf|map|json)$/i.test(req.path);
  const isCookieCheckPath = req.path === "/__cookie_check.html" || req.path === "/_cookie_check.html" || req.path.includes("cookie_check");
  
  if (isStaticAsset && !isCookieCheckPath) {
    return next();
  }

  // AIS PREVIEW FIX: If it's a real browser and not a bot, let Vite handle it immediately (fixes white screen)
  if (!isBot && !isCookieCheck && !req.path.startsWith("/api/")) {
    if (process.env.NODE_ENV !== "production") {
      return next();
    }
  }

  // Skip API routes unless it's our OG route
  if (req.path.startsWith("/api/") && !(req as any).isOgApiRoute) {
    return next();
  }

  // Handle robots.txt

  if (isBot) {
    console.log(`[BOT-TRAFFIC] [${new Date().toISOString()}] ${req.method} ${req.path} | Bot: ${isBot} | LinkedIn: ${isLinkedIn} | Article: ${articleId} | Agent: ${userAgent}`);
  }

  // Handle robots.txt
  if (req.path === "/robots.txt") {
    const baseUrl = process.env.SHARED_APP_URL || `${req.protocol}://${req.get("host")}`;
    const cleanBase = baseUrl.replace(/\/$/, '');
    res.setHeader('Content-Type', 'text/plain');
    return res.send(`User-agent: *
Allow: /
Allow: /api/og/
Allow: /api/proxy-image
Disallow: /api/
Sitemap: ${cleanBase}/sitemap.xml`);
  }

  // Handle sitemap.xml
  if (req.path === "/sitemap.xml") {
    try {
      const { supabase } = await import("./src/services/supabase.js");
      const { data: articles } = await supabase.from("news_articles").select("id, created_at").order("created_at", { ascending: false });
      
      const sharedAppUrl = process.env.SHARED_APP_URL || "https://ais-pre-k2zyhx7iw4f2x55hvxwlzg-10310046101.europe-west2.run.app";
      const baseUrl = sharedAppUrl.replace(/\/$/, '');
      
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>`;
      
      if (articles) {
        articles.forEach(a => {
          xml += `
  <url>
    <loc>${baseUrl}/article/${a.id}</loc>
    <lastmod>${new Date(a.created_at).toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
        });
      }
      
      xml += `\n</urlset>`;
      res.setHeader('Content-Type', 'application/xml');
      return res.send(xml);
    } catch (e) {
      console.error("Sitemap Error:", e);
      return res.status(500).send("Error generating sitemap");
    }
  }

  try {
    let html = "";
    let ogTitle = "SaaS Sentinel: AI-Powered Market Intelligence";
    let ogDescription = "Elite intelligence analysis of the SaaS and enterprise AI landscape. Stay ahead of market shifts with SaaS Sentinel's clean, actionable insights.";
    let ogImage = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200&h=630";
    
    // Fetch article data EARLY so we can use it in minimal HTML
    if (articleId && articleId !== "undefined" && articleId !== "null") {
      try {
        const { supabase } = await import("./src/services/supabase.js").catch(() => import("./src/services/supabase.js"));
        const { data: article } = await supabase.from("news_articles").select("*").eq("id", articleId).maybeSingle();
        if (article) {
          ogTitle = article.title;
          const summary = article.summary || (article.content ? article.content.substring(0, 200) : "");
          ogDescription = summary.substring(0, 250);
          if (article.image_url) {
            let img = article.image_url.trim();
            if (img.startsWith('http')) ogImage = img;
          }
        }
      } catch (e) {}
    }

    const isImageProxyInReturnUrl = typeof returnUrl === "string" && returnUrl.includes("/api/proxy-image");
    
    const isActuallyBotAccessing = isActuallyBot || isBotPath || isBotUA;

    if (isCookieCheck && isImageProxyInReturnUrl) {
      try {
        const decodedReturnUrl = decodeURIComponent(req.query.return_url as string);
        // Using URL constructor to safely extract the nested 'url' parameter
        const urlObj = new URL(decodedReturnUrl.startsWith('http') ? decodedReturnUrl : `https://${req.get('host')}${decodedReturnUrl}`);
        const actualImageUrl = urlObj.searchParams.get("url");
        
        if (actualImageUrl) {
           console.log(`[DEBUG-COOKIE] Serving image DIRECTLY from cookie check (URL API Mode): ${actualImageUrl}`);
           return fetchAndSendImage(actualImageUrl, res);
        }
      } catch (e) {
        console.error("[DEBUG-COOKIE] Failed to extract image URL from return_url:", e);
      }
    }

    // Redundant redirect block removed - combined with direct serving above

    const isBotAccessingOg = ((req as any).isOgApiRoute || isCookieCheck) && isActuallyBotAccessing;
    const shouldServeMinimal = (isActuallyBot || isBot) && !isRealBrowser && (!isAISPreview || isLinkedIn || forceBot || isBotPath) && !isImageProxyInReturnUrl;

    if (shouldServeMinimal || isBotAccessingOg) {
      // Refresh OG tags data if it's a bot request
      if (articleId && articleId !== "undefined") {
         try {
           const { supabase } = await import("./src/services/supabase.js");
           const { data: art } = await supabase.from("news_articles").select("*").eq("id", articleId).maybeSingle();
           if (art) {
             ogTitle = art.title;
             ogDescription = (art.summary || art.content || "").substring(0, 200);
             if (art.image_url) ogImage = art.image_url.trim();
             console.log(`[BOT-DATA-REFRESH] Success for ${articleId}: ${ogTitle}`);
           }
         } catch (e) {
           console.error("[BOT-DATA-REFRESH] Error:", e);
         }
      }
      
      // Escape for minimal HTML
      const escapedTitle = ogTitle.replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m] || m));
      const escapedDesc = ogDescription.replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m] || m));

      console.log(`[DEBUG-BOT] Serving Minimal: ${req.path} | Article: ${articleId} | isBot: ${isBot}`);
      html = `<!DOCTYPE html>
<html lang="en" prefix="og: http://ogp.me/ns# article: http://ogp.me/ns/article#">
<head>
  <meta charset="utf-8">
  <title>${escapedTitle}</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
    .container { text-align: center; padding: 3rem; border-left: 6px solid #f08924; border-radius: 12px; background: #111; box-shadow: 0 20px 50px rgba(0,0,0,0.8); max-width: 700px; border: 1px solid rgba(255,255,255,0.05); }
    h1 { margin-top: 0; font-size: 2rem; color: #f08924; text-transform: uppercase; letter-spacing: -0.02em; }
    p { line-height: 1.8; opacity: 0.8; font-size: 1.1rem; }
    .redirect { margin-top: 2rem; font-size: 0.8rem; opacity: 0.4; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; }
  </style>
  <script>
    if (!/bot|linkedin|google|facebook|twitter|crawler|spider|slack|whatsapp|telegram/i.test(navigator.userAgent)) {
      window.location.href = "/article/${articleId || ''}" + window.location.search;
    }
  </script>
</head>
<body>
  <div class="container">
    <h1>${escapedTitle}</h1>
    <p>${escapedDesc}</p>
    <div class="redirect">SaaS Sentinel Intelligence Analysis Loading...</div>
  </div>
</body>
</html>`;
    } else if ((req as any).isOgApiRoute && !isBot) {
      // Real user hit the OG API route, redirect them to the real article
      return res.redirect(`/article/${articleId || ''}`);
    } else {
      try {
        const rootPath = process.cwd();
        const possibleIndexPaths = [
          path.join(rootPath, "dist", "index.html"),
          path.join(rootPath, "index.html"),
          path.join(__dirname, "dist", "index.html"),
          path.join(__dirname, "index.html")
        ];
        
        let foundPath = null;
        for (const p of possibleIndexPaths) {
          if (fs.existsSync(p)) {
            foundPath = p;
            break;
          }
        }
        
        if (foundPath) {
          html = fs.readFileSync(foundPath, "utf-8");
        } else {
          // Fallback to a functional (though minimal) HTML that can still load the app if served correctly
          html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root">Loading...</div></body></html>`;
        }
      } catch (e) {
        html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>`;
      }
    }

    if (!html) {
      console.log("[DEBUG] No index.html found in any possible path, using minimal fallback");
      html = `<!DOCTYPE html><html prefix="og: http://ogp.me/ns#"><head><title>SaaS Sentinel</title><meta charset="utf-8"></head><body><div id="root"></div></body></html>`;
    }

    // Determine the base URL dynamically from the request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    // Explicitly check SHARED_APP_URL - if it's set, we should definitely use it for OG tags
    const envSharedUrl = process.env.SHARED_APP_URL || "";
    const finalBaseUrl = envSharedUrl.length > 10 ? envSharedUrl : baseUrl;
    
    const escapeHtml = (str: string) => {
      if (!str) return "";
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    ogTitle = escapeHtml(ogTitle);
    ogDescription = escapeHtml(ogDescription);
    
    const FALLBACK_IMAGES = [
      "https://images.unsplash.com/photo-1510511459019-5dee997dd1db?q=80&w=1200&h=630&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=630&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&h=630&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1200&h=630&auto=format&fit=crop"
    ];
    
    // Use early fetched image if available, else fallback
    if (!ogImage || ogImage.includes('unsplash.com') && !ogImage.includes('w=')) {
        const base = (ogImage || FALLBACK_IMAGES[0]).split('?')[0];
        ogImage = `${base}?auto=format&fit=crop&q=80&w=1200&h=630`;
    }
    ogImage = escapeHtml(ogImage);
    
    // Use the shared app url for OG tags if available, otherwise fallback to dynamic
    // We prefer the dynamic baseUrl for dev environments to ensure proxying works correctly
    // But for SHARED_APP_URL we want consistent results
    
    // Use the articleId and returnUrl extracted earlier in the middleware
    let canonicalPath = req.path;
    
    // If we're in a cookie check, reconstruct the original intended path
    if (typeof req.query.return_url === "string") {
      try {
        const decoded = decodeURIComponent(req.query.return_url as string);
        // Extract the path part, handling both full URLs and relative paths
        let pathOnly = decoded.split(/[?#\s\\]/)[0];
        
        if (pathOnly.includes('://')) {
          try {
            pathOnly = new URL(pathOnly).pathname;
          } catch (e) {
            // Fallback for malformed URLs that still have ://
            const parts = pathOnly.split('://')[1].split('/');
            parts.shift(); // remove host
            pathOnly = '/' + parts.join('/');
          }
        }
        
        canonicalPath = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
        console.log(`[DEBUG-COOKIE] Reconstructed canonicalPath: ${canonicalPath} from return_url`);
      } catch (e) {
        console.error("[DEBUG] Failed to parse returnUrl for canonicalPath:", e);
        canonicalPath = "/";
      }
    }
    
    // If we have an article ID, ensure the canonical URL points to the article page
    if (articleId && articleId !== "undefined" && articleId !== "null") {
      canonicalPath = `/article/${articleId}`;
    }
    
    const cleanBaseUrl = finalBaseUrl.replace(/\/$/, '');
    const cleanPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
    
    // CRITICAL: For og:url, we should point to the cleanest representation possible.
    // For bots, og:url SHOULD match the URL we gave them to scrape (the .well-known path if used).
    // This prevents LinkedIn from trying to perform a second "canonical" scrape on a different URL
    // which might trigger more security gates.
    let ogUrl = `${cleanBaseUrl}${req.path}`;
    
    // Ensure it's absolute and includes query params if they are bypass flags
    const bypassParams = [];
    if (forceBot) bypassParams.push('force_bot=true');
    if (req.query.ls === '1') bypassParams.push('ls=1');
    if (req.query._bot === '1') bypassParams.push('_bot=1');
    if (req.query.bot === '1') bypassParams.push('bot=1');
    
    if (bypassParams.length > 0) {
      ogUrl += (ogUrl.includes('?') ? '&' : '?') + bypassParams.join('&');
    }
    
    if (!isBot && articleId && articleId !== "undefined" && articleId !== "null") {
      ogUrl = `${cleanBaseUrl}/article/${articleId}`;
    } else if (!isBot && !articleId) {
      ogUrl = `${cleanBaseUrl}${cleanPath}`;
    }
    
    ogUrl = escapeHtml(ogUrl);

    if (isBot) {
      console.log(`[BOT-OG-GEN] BaseURL: ${finalBaseUrl} | CanonicalPath: ${canonicalPath} | OgURL: ${ogUrl} | ArticleID: ${articleId} | isBot: ${isBot}`);
    }

    if (articleId && articleId !== "undefined" && articleId !== "null") {
      try {
        console.log(`[DEBUG-OG] Attempting to fetch article ${articleId} for OG tags...`);
        const { supabase } = await import("./src/services/supabase.js").catch(async (err) => {
          console.warn(`[DEBUG-OG] Failed to import supabase.js, trying .ts: ${err.message}`);
          return await import("./src/services/supabase.ts");
        });
        
        const { data: article, error: fetchError } = await supabase
          .from("news_articles")
          .select("*")
          .eq("id", articleId)
          .maybeSingle();

        if (fetchError) {
          console.error(`[DEBUG-OG] Supabase fetch error for ID ${articleId}:`, fetchError);
        }

        if (article && article.title) {
          ogTitle = escapeHtml(article.title);
          const summary = article.summary || (article.content ? article.content.substring(0, 200) : "");
          ogDescription = escapeHtml((summary.length > 100 ? summary : (summary + " " + ogDescription)).substring(0, 200));
          
          if (article.image_url) {
            let img = article.image_url.trim();
            console.log(`[DEBUG-OG] Article Image URL from DB: ${img}`);
            if (img && img.length > 5) {
              let resolvedImg = "";
              try {
                if (img.startsWith('http:')) {
                  resolvedImg = img.replace('http:', 'https:');
                } else if (img.startsWith('//')) {
                  resolvedImg = `https:${img}`;
                } else if (img.startsWith('https:')) {
                  resolvedImg = img;
                } else if (img.match(/^[a-zA-Z0-9_-]+$/)) {
                  // If it's just an ID or keyword, try to make it an Unsplash URL
                  resolvedImg = `https://images.unsplash.com/photo-${img}?auto=format&fit=crop&q=80&w=1200&h=630`;
                } else if (img.includes('unsplash.com')) {
                  // Ensure Unsplash URLs have proper dimensions for social media
                  // We split by '?' to remove existing params and add our own optimized ones
                  const cleanUrl = img.split('?')[0];
                  resolvedImg = `${cleanUrl}?auto=format&fit=crop&q=80&w=1200&h=630`;
                  console.log(`[DEBUG-OG] Optimized Unsplash URL: ${resolvedImg}`);
                } else {
                  // For other URLs, if they are relative, they are likely from the news source
                  // and we can't easily resolve them here without the source domain.
                  // But if they look like a path, we'll try our domain as a last resort.
                  if (img.startsWith('/')) {
                    const cleanBase = finalBaseUrl.replace(/\/$/, '');
                    resolvedImg = `${cleanBase}${img}`;
                  } else if (!img.includes('://')) {
                    // If it's a relative path without a leading slash
                    const cleanBase = finalBaseUrl.replace(/\/$/, '');
                    resolvedImg = `${cleanBase}/${img}`;
                  } else {
                    resolvedImg = img;
                  }
                }
                
                // Final validation: if it doesn't look like a URL, use fallback
                if (!resolvedImg.includes('://')) {
                   const randomIdx = Math.floor(Math.random() * FALLBACK_IMAGES.length);
                   resolvedImg = FALLBACK_IMAGES[randomIdx];
                }
                
                // Clean up URL: remove common tracking params that might confuse crawlers
                // but keep most others to avoid breaking CDN-specific features
                try {
                  const urlObj = new URL(resolvedImg);
                  const params = urlObj.searchParams;
                  
                  // Parameters to explicitly remove
                  const trackingParams = [
                    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
                    'fbclid', 'gclid', '_ga', '_gl', 'mc_cid', 'mc_eid', 'ls', 'v'
                  ];
                  
                  trackingParams.forEach(p => params.delete(p));
                  
                  // Special handling for WordPress proxy de-proxying
                  if (resolvedImg.includes('i0.wp.com') || resolvedImg.includes('i1.wp.com') || resolvedImg.includes('i2.wp.com')) {
                    const wpMatch = resolvedImg.match(/i[0-2]\.wp\.com\/(.+)/);
                    if (wpMatch) {
                      let original = wpMatch[1].split('?')[0];
                      if (!original.startsWith('http')) original = 'https://' + original;
                      resolvedImg = original;
                      console.log(`[DEBUG-OG] De-proxied WP image: ${resolvedImg}`);
                    }
                  } else {
                    resolvedImg = urlObj.toString();
                  }
                } catch (urlErr) {
                  console.warn("[DEBUG] Could not parse URL for cleaning:", resolvedImg);
                }

                console.log(`[DEBUG-OG] Final Resolved Image URL: ${resolvedImg}`);
                
    // Proxy third-party images to bypass social media crawler restrictions
    // CRITICAL: For social media crawlers (LinkedIn), they usually have their own proxy/CDN
    // that handles hotlink protection better than our small proxy.
    // We only use the proxy for bots if the original URL is NOT HTTPS
    // or if it's from a known-restrictive source.
    
    const restrictiveSources = [
      'wsj.com', 'nytimes.com', 'bloomberg.com', 'ft.com'
    ];
    const isRestrictive = resolvedImg && restrictiveSources.some(source => resolvedImg.includes(source));
    const isLikelyHotlinkBlocked = resolvedImg && !resolvedImg.includes('unsplash.com') && 
                                  !resolvedImg.includes('supabase.co') && 
                                  !resolvedImg.includes('cloudinary.com') &&
                                  !resolvedImg.includes('marketingprofs.com') &&
                                  !resolvedImg.includes('deadline.com') &&
                                  !resolvedImg.includes('theverge.com') &&
                                  !resolvedImg.includes('techcrunch.com');

    // BOT vs USER Decision:
    // With our Aggressive Mode for proxy bypass in cookie checks (URL API Mode),
    // we can SAFELY use the proxy for bots too.
    // Proxying is better because our server bypasses the source's hotlink protection
    // which might be blocking the generic LinkedIn crawler (e.g. regmedia.co.uk).
    const isThirdParty = resolvedImg && !resolvedImg.includes(finalBaseUrl) && 
                        !resolvedImg.includes('localhost') && 
                        !resolvedImg.includes('google-cloud-preview');

    if (resolvedImg && isThirdParty) {
      console.log(`[DEBUG-OG] Proxying third-party image (isBot: ${isBot}): ${resolvedImg}`);
      const cleanBase = cleanBaseUrl;
      // Use the simplest possible proxy URL for bots to avoid any crawler issues
      const proxiedUrl = `${cleanBase}/api/proxy-image?url=${encodeURIComponent(resolvedImg)}&force_bot=true&ls=1`;
      ogImage = escapeHtml(proxiedUrl);
    } else if (resolvedImg) {
      // Use original URL
      let finalImg = resolvedImg;
      if (!finalImg.startsWith('http')) {
        const cleanBase = cleanBaseUrl;
        finalImg = `${cleanBase}${finalImg.startsWith('/') ? '' : '/'}${finalImg}`;
      }
      
      if (finalImg.startsWith('http://')) {
        finalImg = finalImg.replace('http://', 'https://');
      }
      
      const separator = finalImg.includes('?') ? '&' : '?';
      // For bots, don't add the cache buster to original URLs unless strictly needed, 
      // as some scrapers (LinkedIn) can be picky about unusual query params on images.
      ogImage = escapeHtml(finalImg);
      console.log(`[DEBUG-OG] Using original image URL (isBot: ${isBot}): ${finalImg}`);
    }
              } catch (e) {
                console.error("[DEBUG] Failed to resolve image URL:", img, e);
              }
            }
          }
          console.log(`[DEBUG-OG] Success for ${articleId}: Title="${ogTitle}", Image="${ogImage}"`);
        } else {
          console.log(`[DEBUG-OG] Article not found or title missing for ID ${articleId}`);
        }
      } catch (e) {
        console.error("[DEBUG-OG] Error fetching article:", e);
      }
    }

    // Determine image type dynamically
    let ogImageType = "image/jpeg";
    const lowerImage = ogImage.toLowerCase();
    if (lowerImage.includes(".png")) ogImageType = "image/png";
    else if (lowerImage.includes(".gif")) ogImageType = "image/gif";
    else if (lowerImage.includes(".webp")) ogImageType = "image/webp";
    else if (lowerImage.includes(".svg")) ogImageType = "image/svg+xml";

    const metaTags = `
  <title>${ogTitle}</title>
  <meta name="description" content="${ogDescription}" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDescription}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:url" content="${ogImage}" />
  <meta property="og:image:secure_url" content="${ogImage}" />
  <meta property="og:image:type" content="${ogImageType}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${ogTitle}" />
  <meta property="og:url" content="${ogUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="SaaS Sentinel" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDescription}" />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="twitter:image:alt" content="${ogTitle}" />
  <meta name="twitter:url" content="${ogUrl}" />
  <link rel="canonical" href="${ogUrl}" />
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="image" content="${ogImage}">
  <meta name="thumbnail" content="${ogImage}">
  <meta name="author" content="SaaS Sentinel">
  <meta name="publish_date" content="${new Date().toISOString()}">
  <meta property="article:published_time" content="${new Date().toISOString()}">
  <meta property="article:author" content="SaaS Sentinel">
  <meta property="article:section" content="SaaS Intelligence">
`;

    if (isBot) {
      console.log(`[BOT-META] Generated Tags for ${articleId || 'home'}: Title="${ogTitle}", Image="${ogImage}"`);
    }

    // Aggressive removal of existing tags (handles both property and name)
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
    html = html.replace(/<meta[^>]+(?:property|name)=["']og:[^"']+["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]+(?:property|name)=["']twitter:[^"']+["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]+name=["']description["'][^>]*>/gi, '');
    html = html.replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]+name=["']keywords["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]+name=["']author["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]+name=["']title["'][^>]*>/gi, '');
    
    // Also remove any generic "Cookie check" content if it somehow leaked into the base HTML
    html = html.replace(/<title[^>]*>.*?Cookie check.*?<\/title>/gi, '');
    html = html.replace(/Cookie check/gi, 'SaaS Sentinel');
    html = html.replace(/Checking your browser/gi, 'SaaS Sentinel Intelligence');
    html = html.replace(/Please wait while your application starts/gi, 'SaaS Sentinel Analysis');
    html = html.replace(/Please wait/gi, 'SaaS Sentinel Analysis');
    html = html.replace(/__cookie_check\.html/gi, 'index.html');
    html = html.replace(/<meta[^>]+content=["'].*?Cookie check.*?["'][^>]*>/gi, '');
    
    // If it's a bot (and NOT the AI Studio preview browser), strip all scripts
    // LinkedIn is an exception: we ALWAYS strip scripts for LinkedIn to ensure it sees the OG tags clearly.
    // However, if it's a real browser or AI Studio preview hitting a .well-known path, we DON'T strip scripts.
    if (isBot && (!isAISPreview || isLinkedIn || forceBot) && !(!isBotUA && req.path.includes('.well-known'))) {
      html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      // Add no-cache for bots
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      // Consolidated bot cookie at the end
      res.setHeader('Vary', 'User-Agent');
    }

    // If it's a real user on a .well-known path, inject a redirect script to the real article page
    if (!isBotUA && req.path.includes('.well-known') && articleId) {
      const redirectScript = `
        <script>
          (function() {
            var articleId = "${articleId}";
            var currentUrl = window.location.href;
            var targetUrl = "/article/" + articleId;
            // Preserve query params if any
            if (window.location.search) {
              targetUrl += window.location.search;
            }
            console.log("Redirecting real user from .well-known to", targetUrl);
            window.location.href = targetUrl;
          })();
        </script>
      `;
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/(<\/head>)/i, `${redirectScript}$1`);
      } else {
        html += redirectScript;
      }
    }

    // Inject meta tags
    const debugComment = isBot ? `\n  <!-- Bot Detection: ${userAgent.substring(0, 100)} | Article: ${articleId} -->\n` : '';
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/(<head[^>]*>)/i, `$1${debugComment}${metaTags}`);
    } else if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/(<html[^>]*>)/i, `$1<head>${debugComment}${metaTags}</head>`);
    } else {
      html = `<head>${debugComment}${metaTags}</head>${html}`;
    }
    
    if (!html.includes('prefix="og:')) {
      html = html.replace(/<html([^>]*)>/i, '<html$1 prefix="og: http://ogp.me/ns# article: http://ogp.me/ns/article#">');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Vary', 'User-Agent');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('X-SaaS-Sentinel-Bot', isBot ? 'true' : 'false');
    res.setHeader('X-SaaS-Sentinel-Article', articleId || 'none');
    
    // Add bot bypass cookie for infrastructure
    if (isBot) {
      res.setHeader('Set-Cookie', 'ais_bot_verified=true; Path=/; SameSite=None; Secure; Max-Age=3600');
      // Preload hint for the image to help scrapers find it faster
      if (ogImage && ogImage.startsWith('http')) {
        res.setHeader('Link', `<${ogImage}>; rel=preload; as=image`);
      }
    }
    
    if (isLinkedIn || forceBot) {
      console.log(`[BOT-FINAL] Responding to LinkedIn/ForceBot: path=${req.path}, title=${ogTitle}, isLinkedIn=${isLinkedIn}, forceBot=${forceBot}, image=${ogImage}`);
    }
    
    if (isBot) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Robots-Tag', 'index, follow, max-image-preview:large');
      
      console.log(`[BOT-RESPONSE] Sent OG-enriched HTML for ${articleId || 'home'} | isBot: ${isBot} | isCookieCheck: ${isCookieCheck} | UA: ${userAgent.substring(0, 70)}`);
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    
    return res.status(200).send(html);
  } catch (error: any) {
    console.error("[DEBUG] Error in OG tag injection middleware:", error);
    return next(); // Fall through to static/Vite if something goes wrong
  }
});

// Production Route Registration
// We check for dist folder existence to determine production mode more reliably
const distPath = path.resolve(__dirname, "dist");
const hasDist = fs.existsSync(distPath);

if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1" || hasDist) {
  if (hasDist) {
    app.use(express.static(distPath));
  }
  
  // Catch-all for SPA in production
  app.get("*", (req, res) => {
    const indexPath = fs.existsSync(path.join(distPath, "index.html"))
      ? path.join(distPath, "index.html")
      : fs.existsSync(path.join(process.cwd(), "dist", "index.html"))
        ? path.join(process.cwd(), "dist", "index.html")
        : fs.existsSync(path.join(__dirname, "index.html"))
          ? path.join(__dirname, "index.html")
          : null;
    
    if (indexPath) {
      res.sendFile(indexPath);
    } else {
      res.status(200).send(`<!DOCTYPE html><html><head><title>SaaS Sentinel</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root">Fallback UI: index.html not found.</div></body></html>`);
    }
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

// Final 404 Handler
app.use((req, res) => {
  console.log(`[404-FINAL] ${req.method} ${req.url}`);
  res.status(404).send(`SaaS Sentinel 404: The path ${req.url} was not found on this server. (Env: ${process.env.NODE_ENV})`);
});

// Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("🔥 Global Server Error:", err);
  if (!res.headersSent) {
    res.status(500).send(`SaaS Sentinel Server Error: ${err.message || "Unknown Error"}`);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

if (process.env.VERCEL !== "1") {
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
