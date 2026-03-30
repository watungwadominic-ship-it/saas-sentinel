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
  const distPath = path.resolve(__dirname, "dist");
  const rootDistPath = path.join(process.cwd(), "dist");
  
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    cwd: process.cwd(),
    dirname: __dirname,
    distExists: fs.existsSync(distPath),
    rootDistExists: fs.existsSync(rootDistPath),
    indexInDist: fs.existsSync(path.join(distPath, "index.html")),
    indexInRootDist: fs.existsSync(path.join(rootDistPath, "index.html")),
    nodeVersion: process.version
  });
});

// Image Proxy to bypass social media crawler restrictions
app.get("/api/proxy-image", async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) return res.status(400).send("Missing URL");

  try {
    console.log(`[PROXY] Fetching image: ${imageUrl}`);
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24h

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error(`[PROXY-ERROR] ${error}`);
    res.status(500).send("Error proxying image");
  }
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

  // Aggressive bot detection
  const isLinkedIn = /linkedin/i.test(userAgent) || 
                     userAgent.includes('authorizedentity') || 
                     userAgent.includes('linkedinbot') ||
                     userAgent.includes('linkedin-bot') ||
                     userAgent.includes('authorized-entity') ||
                     userAgent.includes('apache-httpclient') ||
                     userAgent.includes('linkedin-post-inspector') ||
                     xLinkedInId !== undefined;
                     
  // AI Studio Preview detection - we should NOT treat this as a bot for script stripping
  const xForwardedHost = req.get('x-forwarded-host') || '';
  const xHost = req.get('host') || '';
  const referer = req.get('referer') || '';
  
  const isAISPreview = xPurpose === 'preview' || 
                       referer.includes('aistudio.google.com') ||
                       xForwardedHost.startsWith('ais-dev-') ||
                       xHost.startsWith('ais-dev-');

  const isBotUA = /\b(bot|googlebot|baiduspider|bingbot|msnbot|duckduckbot|teoma|slurp|yandexbot|facebookexternalhit|twitterbot|slackbot|whatsapp|telegrambot|discordbot|applebot|pinterestbot|redditbot|vkshare|archive.org_bot|crawler|spider|archiver|curl|wget|http-client|embedly|quora|outbrain|validator|skype|bitly|ahrefs|semrush|mj12|dotbot|headless|selenium|puppeteer|lighthouse|gtmetrix|pingdom|uptimerobot|monitoring|statuscake|uptimer|monitis|uptrends|site24x7|nagios|zabbix|datadog|newrelic|appdynamics|dynatrace|instana|sentry|honeycomb|loggly|sumologic|splunk|graylog|elk|kibana|grafana|prometheus|influxdb|telegraf|kapacitor|chronograf|linkedin|linkedinbot|linkedin-bot)\b/i.test(userAgent);
  
  const isRealBrowser = /\b(chrome|safari|firefox|edg|opera|opr)\b/i.test(userAgent) && !isBotUA;
  
  // Explicit signals that override browser detection
  const isExplicitBot = forceBot || isLinkedIn || (req.query.ls !== undefined) || 
                        (req.headers['x-fb-http-engine'] !== undefined) ||
                        (req.headers['x-linkedin-id'] !== undefined);

  // LinkedIn is ALWAYS a bot for us, even in AI Studio preview
  const isBot = (isExplicitBot || isBotUA) && (!isAISPreview || isLinkedIn || forceBot);

  // Extract article ID from query or path
  let articleId = (req.query.article as string) || (req.query.article_id as string) || (req.query.id as string) || (req.query.articleId as string);
  
  // Path-based extraction (e.g. /article/257)
  if (!articleId) {
    const pathParts = req.path.split("/");
    // Matches /article/ID or /news/ID or /article/ID/v/TIMESTAMP
    if (pathParts[1] === "article" || pathParts[1] === "news") {
      articleId = pathParts[2].split(/[\/?#\s\\]/)[0];
      console.log(`[DEBUG-ID] Extracted ID from path: ${articleId}`);
    }
  }

  // Extract from return_url if present (infrastructure cookie checks)
  const returnUrl = req.query.return_url as string;
  if (!articleId && returnUrl) {
    try {
      let decodedReturnUrl = returnUrl;
      // Multi-pass decode to handle nested encoding
      for (let i = 0; i < 3; i++) {
        const next = decodeURIComponent(decodedReturnUrl);
        if (next === decodedReturnUrl) break;
        decodedReturnUrl = next;
      }
      
      // Try to find ID in query params of return_url
      const queryMatch = decodedReturnUrl.match(/[?&](?:article|article_id|id|articleId)=([^&]+)/i);
      if (queryMatch) {
        articleId = queryMatch[1].split(/[\/?#\s\\]/)[0];
      }
      
      // Try to find ID in path of return_url
      if (!articleId) {
        const pathM = decodedReturnUrl.match(/\/(?:article|news)\/([^\/?#\s\\]+)/i);
        if (pathM) {
          articleId = pathM[1].split(/[\/?#\s\\]/)[0];
        }
      }
      
      if (articleId) {
        console.log(`[DEBUG-COOKIE] Extracted ArticleID ${articleId} from return_url: ${returnUrl}`);
      } else {
        // Last ditch effort: look for any 3-digit or longer number in the URL which might be the ID
        const genericIdMatch = decodedReturnUrl.match(/(\d{3,})/);
        if (genericIdMatch) {
          articleId = genericIdMatch[1];
          console.log(`[DEBUG-COOKIE] Generic ID extraction from return_url: ${articleId}`);
        }
      }
    } catch (e) {
      console.error(`[DEBUG-ERR] Failed to parse return_url: ${e}`);
    }
  }

  // Detailed logging for all non-static requests to debug bot traffic
  if (!req.path.includes(".") || isBot || req.path === "/__cookie_check.html") {
    console.log(`[DEBUG-REQ] ${req.method} ${req.path} | Agent: ${userAgent.substring(0, 60)}... | Article: ${articleId} | isBot: ${isBot} | isLinkedIn: ${isLinkedIn}`);
  }

  // CRITICAL: Skip static assets (images, css, js) - even for bots!
  const isStaticAsset = /\.(jpg|jpeg|png|gif|svg|webp|css|js|ico|woff|woff2|ttf|otf|map|json)$/i.test(req.path);
  if (isStaticAsset && req.path !== "/__cookie_check.html") {
    return next();
  }

  if (isBot) {
    console.log(`[BOT-TRAFFIC] [${new Date().toISOString()}] ${req.method} ${req.path} | Bot: ${isBot} | LinkedIn: ${isLinkedIn} | Article: ${articleId} | Agent: ${userAgent}`);
  }

  // Handle robots.txt
  if (req.path === "/robots.txt") {
    res.setHeader('Content-Type', 'text/plain');
    return res.send("User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://ais-pre-k2zyhx7iw4f2x55hvxwlzg-10310046101.europe-west2.run.app/sitemap.xml");
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

  // Only handle GET and HEAD requests for HTML/OG tags
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  // Skip API routes
  if (req.path.startsWith("/api/")) {
    return next();
  }

  // Skip static assets (requests with extensions) UNLESS it's a bot or a cookie check
  // Bots should get the HTML even if they hit a weird URL
  const isCookieCheck = req.path === "/__cookie_check.html";
  if (req.path.includes(".") && !isBot && !isCookieCheck) {
    return next();
  }

  // Handle HTML requests, bot requests, or any path without an extension
  const isHtmlRequest = accept.includes("text/html") || !req.path.includes(".") || isBot;
  
  // If it's not an HTML/bot request and not an article request, let it pass
  if (!isHtmlRequest && !articleId) {
    return next();
  }

  try {
    let html = "";
    
    // For bots or cookie check redirects, we prefer a clean, minimal HTML to avoid any "Cookie check" scripts
    // that might be present in the actual index.html file.
    if (isBot || req.path.includes("cookie_check")) {
      console.log(`[DEBUG-BOT] Generating clean HTML for bot or cookie check | Path: ${req.path} | Article: ${articleId}`);
      html = `<!DOCTYPE html>
<html lang="en" prefix="og: http://ogp.me/ns# article: http://ogp.me/ns/article#">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SaaS Sentinel Intelligence Report</title>
  <!-- SaaS Sentinel Bot Fallback -->
</head>
<body>
  <div id="root">SaaS Sentinel Intelligence Report</div>
</body>
</html>`;
    } else {
      try {
        html = fs.readFileSync(path.join(process.cwd(), "dist", "index.html"), "utf-8");
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
    
    const escapeHtml = (str: string) => {
      if (!str) return "";
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    let ogTitle = escapeHtml("SaaS Sentinel | Elite B2B Market Intelligence");
    let ogDescription = escapeHtml("Tracking high-growth software ecosystems with AI-driven precision. Strategic insights for founders, investors, and developers.");
    
    const FALLBACK_IMAGES = [
      "https://images.unsplash.com/photo-1510511459019-5dee997dd1db?q=80&w=1200&h=630&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=630&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&h=630&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1200&h=630&auto=format&fit=crop"
    ];
    let ogImage = escapeHtml(FALLBACK_IMAGES[0]);
    
    // Use the shared app url for OG tags if available, otherwise fallback to dynamic
    // We prefer the dynamic baseUrl for dev environments to ensure proxying works correctly
    const finalBaseUrl = process.env.SHARED_APP_URL || baseUrl;
    
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
    
    // CRITICAL: Do NOT include force_bot=true in the og:url. 
    // This ensures that when a human clicks the link on LinkedIn, they are taken to the 
    // clean URL which will serve the full React app (since they aren't a bot).
    let ogUrl = `${cleanBaseUrl}${cleanPath}`;
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

                ogImage = escapeHtml(resolvedImg);
                console.log(`[DEBUG-OG] Final Resolved Image URL: ${resolvedImg}`);
                
                // Proxy third-party images to bypass LinkedIn's crawler restrictions
                // This is especially useful for URLs without extensions or from domains that block LinkedIn
                if (resolvedImg && !resolvedImg.includes(finalBaseUrl) && !resolvedImg.includes('picsum.photos') && !resolvedImg.includes('unsplash.com')) {
                  console.log(`[DEBUG-OG] Proxying third-party image: ${resolvedImg}`);
                  // Ensure we use a clean base URL without trailing slash
                  // We use the dynamic baseUrl here to ensure the proxy is reachable from the current environment
                  const cleanBase = baseUrl.replace(/\/$/, '');
                  const proxiedUrl = `${cleanBase}/api/proxy-image?url=${encodeURIComponent(resolvedImg)}&ext=.jpg`;
                  ogImage = escapeHtml(proxiedUrl);
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

    // Always provide dimensions for LinkedIn to ensure proper layout
    // Default to 1200x630 if we're not sure
    
    // Ensure ogImage is absolute
    if (ogImage && !ogImage.startsWith('http')) {
      const cleanBase = finalBaseUrl.replace(/\/$/, '');
      ogImage = `${cleanBase}${ogImage.startsWith('/') ? '' : '/'}${ogImage}`;
    }

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
  <meta name="author" content="SaaS Sentinel">
  <meta name="publish_date" content="${new Date().toISOString()}">
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
    html = html.replace(/<title[^>]*>Cookie check<\/title>/gi, '');
    html = html.replace(/Cookie check/gi, 'SaaS Sentinel');
    html = html.replace(/Checking your browser/gi, 'SaaS Sentinel Intelligence');
    html = html.replace(/Please wait while your application starts/gi, 'SaaS Sentinel Analysis');
    html = html.replace(/Please wait/gi, 'SaaS Sentinel Analysis');
    html = html.replace(/__cookie_check\.html/gi, 'index.html');
    html = html.replace(/<meta[^>]+content=["']Cookie check["'][^>]*>/gi, '');
    
    // If it's a bot (and NOT the AI Studio preview), strip all scripts to prevent client-side redirects or logic
    // that might confuse the scraper or lead it away from the OG tags.
    if (isBot && !isAISPreview) {
      html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
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
    res.setHeader('X-SaaS-Sentinel-Bot', isBot ? 'true' : 'false');
    res.setHeader('X-SaaS-Sentinel-Article', articleId || 'none');
    
    if (isBot) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Robots-Tag', 'index, follow, max-image-preview:large');
      
      console.log(`[BOT-RESPONSE] Sent OG-enriched HTML for ${articleId || 'home'} | isBot: ${isBot}`);
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
