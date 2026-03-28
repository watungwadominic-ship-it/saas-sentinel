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
  const userAgent = req.headers["user-agent"] || "";
  const accept = req.headers.accept || "";
  // Added LinkedInBot explicitly and made it more comprehensive
  const isBot = /bot|googlebot|linkedin|linkedinbot|facebook|twitter|slack|whatsapp|telegram|crawler|spider|archiver|curl|wget|bingbot|yandex|baiduspider|duckduckbot|facebot|ia_archiver|Apache-HttpClient|LinkedInBot|facebookexternalhit|Embedly|quora link preview|showyoubot|outbrain|pinterest|vkShare|W3C_Validator|whatsapp|redditbot|Applebot|Discordbot|Discord-GTM|LinkedInBot\/1\.0/i.test(userAgent) || 
                req.headers['x-linkedin-id'] !== undefined ||
                req.headers['x-purpose'] === 'preview' ||
                req.headers['purpose'] === 'preview' ||
                userAgent.includes('LinkedInBot');
  const isCookieCheck = req.path.includes("_cookie_check");

  if (isBot || isCookieCheck) {
    console.log(`[BOT-TRAFFIC] [${new Date().toISOString()}] ${req.method} ${req.path} | Bot: ${isBot} | CookieCheck: ${isCookieCheck} | Agent: ${userAgent}`);
  }

  // Only handle GET and HEAD requests for HTML/OG tags
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  // Skip API routes
  if (req.path.startsWith("/api/")) {
    return next();
  }

  // Skip static assets (requests with extensions) UNLESS it's a bot OR a cookie check
  // Bots and cookie checks should get the HTML even if they hit a weird URL
  if (req.path.includes(".") && !isBot && !isCookieCheck) {
    return next();
  }

  // Handle HTML requests, bot requests, or any path without an extension
  const isHtmlRequest = accept.includes("text/html") || !req.path.includes(".") || isBot || isCookieCheck;
  const articleQuery = req.query.article;
  const returnUrl = req.query.return_url;
  const pathParts = req.path.split("/").filter(Boolean);
  let articleId = "";
  
  if (typeof articleQuery === "string") {
    articleId = articleQuery;
  } else if (Array.isArray(articleQuery)) {
    articleId = String(articleQuery[0]);
  } else if (req.path.startsWith("/article/") && pathParts.length > 0) {
    articleId = pathParts[pathParts.length - 1];
  } else if (typeof returnUrl === "string") {
    // Extract article ID from return_url (happens during infrastructure cookie checks)
    // Handle both decoded and encoded versions
    const decodedReturnUrl = decodeURIComponent(returnUrl);
    
    // Try query param style: ?article=ID
    const queryMatch = decodedReturnUrl.match(/[?&]article=([^&]+)/);
    if (queryMatch) {
      articleId = queryMatch[1].split(/[?#\s\\]/)[0];
    } else {
      // Try path style: /article/ID
      const pathMatch = decodedReturnUrl.match(/\/article\/([^\/?#\s\\]+)/);
      if (pathMatch) {
        articleId = pathMatch[1].split(/[?#\s\\]/)[0];
      }
    }
    
    if (articleId) {
      console.log(`[DEBUG] Extracted articleId ${articleId} from return_url: ${decodedReturnUrl}`);
    }
  }

  // If it's not an HTML/bot request and not an article request, let it pass
  if (!isHtmlRequest && !articleId) {
    return next();
  }

  try {
    const possiblePaths = [
      path.join(process.cwd(), "dist", "index.html"),
      path.join(process.cwd(), "index.html"),
      path.join(__dirname, "dist", "index.html"),
      path.join(__dirname, "index.html"),
      "/var/task/dist/index.html",
      "/var/task/index.html",
    ];

    let indexPath = "";
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        indexPath = p;
        break;
      }
    }

    let html = "";
    if (indexPath) {
      try {
        html = fs.readFileSync(indexPath, "utf-8");
      } catch (e) {
        console.error(`[DEBUG] Failed to read index.html at ${indexPath}:`, e);
      }
    }

    if (!html) {
      console.log("[DEBUG] No index.html found in any possible path, using minimal fallback");
      html = `<!DOCTYPE html><html><head><title>SaaS Sentinel</title><meta charset="utf-8"></head><body><div id="root"></div></body></html>`;
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
    let ogImage = escapeHtml("https://images.unsplash.com/photo-1510511459019-5dee997dd1db?q=80&w=1200&h=630&auto=format&fit=crop");
    
    // Use the shared app url for OG tags if available, otherwise fallback to dynamic
    const sharedAppUrl = "https://ais-pre-k2zyhx7iw4f2x55hvxwlzg-10310046101.europe-west2.run.app";
    const finalBaseUrl = sharedAppUrl;
    
    // Use the full URL including query parameters for og:url
    // If we're in a cookie check, reconstruct the original intended URL
    let ogUrl = escapeHtml(`${finalBaseUrl}${req.originalUrl}`);
    if (isCookieCheck && typeof returnUrl === "string") {
      try {
        let decodedUrl = decodeURIComponent(returnUrl).split(/[\s\\]/)[0];
        // Ensure it's an absolute URL
        if (decodedUrl.startsWith('/')) {
          decodedUrl = `${finalBaseUrl}${decodedUrl}`;
        }
        ogUrl = escapeHtml(decodedUrl);
      } catch (e) {
        ogUrl = escapeHtml(returnUrl);
      }
    }

    if (isBot) {
      console.log(`[BOT-OG-GEN] BaseURL: ${finalBaseUrl} | OgURL: ${ogUrl} | ArticleID: ${articleId}`);
    }

    if (articleId && articleId !== "undefined" && articleId !== "null") {
      try {
        // Use .js extension for compatibility with ESM and Node's TS stripping
        const { fetchArticleById } = await import("./src/services/news_articles.js");
        const article = await Promise.race([
          fetchArticleById(articleId),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
        ]).catch((err) => {
          console.error(`[DEBUG] Article fetch failed or timed out for ID ${articleId}:`, err);
          return null;
        });

        if (article && article.title) {
          ogTitle = escapeHtml(article.title);
          const summary = article.summary || (article.content ? article.content.substring(0, 200) : "");
          ogDescription = escapeHtml((summary.length > 100 ? summary : (summary + " " + ogDescription)).substring(0, 200));
          
          if (article.image_url) {
            let img = article.image_url.trim();
            let resolvedImg = "";
            if (img.startsWith('//')) {
              resolvedImg = `https:${img}`;
            } else if (img.startsWith('http')) {
              resolvedImg = img;
            } else {
              // Handle relative paths
              const cleanBase = finalBaseUrl.replace(/\/$/, '');
              const cleanImage = img.startsWith('/') ? img : `/${img}`;
              resolvedImg = `${cleanBase}${cleanImage}`;
            }
            ogImage = escapeHtml(resolvedImg);
          }
          console.log(`[DEBUG] OG Tags generated for ${articleId}: Title="${ogTitle}", Image="${ogImage}"`);
        } else {
          console.log(`[DEBUG] Article found but title missing or null for ID ${articleId}`);
        }
      } catch (e) {
        console.error("[DEBUG] Error fetching article for OG tags:", e);
      }
    } else {
      console.log(`[DEBUG] No articleId provided in request, using default OG tags`);
    }

    const metaTags = `
  <title>${ogTitle}</title>
  <meta name="description" content="${ogDescription}" />
  <link rel="canonical" href="${ogUrl}" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDescription}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:secure_url" content="${ogImage}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${ogTitle}" />
  <meta property="og:url" content="${ogUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="SaaS Sentinel" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDescription}" />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="twitter:url" content="${ogUrl}" />
  <link rel="image_src" href="${ogImage}" />
  <meta itemprop="name" content="${ogTitle}">
  <meta itemprop="description" content="${ogDescription}">
  <meta itemprop="image" content="${ogImage}">
`;

    // Aggressive removal of existing tags (handles both property and name)
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
    html = html.replace(/<meta[^>]+(?:property|name)=["']og:[^"']+["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]+(?:property|name)=["']twitter:[^"']+["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]+name=["']description["'][^>]*>/gi, '');
    html = html.replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]+name=["']keywords["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]+name=["']author["'][^>]*>/gi, '');

    // Inject meta tags
    const debugComment = isBot ? `\n  <!-- Bot Detection: ${userAgent.substring(0, 100)} | Article: ${articleId} | CookieCheck: ${isCookieCheck} -->\n` : '';
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/(<head[^>]*>)/i, `$1${debugComment}${metaTags}`);
    } else if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/(<html[^>]*>)/i, `$1<head>${debugComment}${metaTags}</head>`);
    } else {
      html = `<head>${debugComment}${metaTags}</head>${html}`;
    }
    
    if (!html.includes('prefix="og:')) {
      html = html.replace(/<html([^>]*)>/i, '<html$1 prefix="og: http://ogp.me/ns#">');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (isBot) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
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
