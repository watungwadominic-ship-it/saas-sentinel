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
app.use(express.json());

// Immediate Health Check for Vercel
app.get("/api/health-check", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    cwd: process.cwd()
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

// Production Route Registration
if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
  const distPath = path.resolve(__dirname, "dist");
  
  // 1. Handle all non-API paths for OG tag injection
  app.get("*", async (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.includes(".")) {
      return next();
    }

    const articleQuery = req.query.article;
    let articleId = "";
    if (typeof articleQuery === "string") {
      articleId = articleQuery;
    } else if (Array.isArray(articleQuery)) {
      articleId = String(articleQuery[0]);
    } else if (req.path.startsWith("/article/")) {
      articleId = req.path.split("/").pop() || "";
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
        html = fs.readFileSync(indexPath, "utf-8");
      }

      if (!html) {
        html = `<!DOCTYPE html><html><head><title>SaaS Sentinel</title></head><body><div id="root"></div></body></html>`;
      }

      let ogTitle = "SaaS Sentinel | Your Daily SaaS News & Insights";
      let ogDescription = "Stay ahead in the SaaS world with curated news, deep dives, and expert analysis. SaaS Sentinel provides elite B2B market intelligence for founders and investors.";
      let ogImage = "https://images.unsplash.com/photo-1510511459019-5dee997dd1db?q=80&w=1200&h=630&auto=format&fit=crop";
      let ogUrl = "https://saas-sentinel-cyan.vercel.app";

      try {
        const baseUrl = process.env.APP_URL || 'https://saas-sentinel-cyan.vercel.app';
        ogUrl = `${baseUrl.replace(/\/$/, '')}${req.originalUrl}`;
      } catch (e) {}

      if (articleId && articleId !== "undefined" && articleId !== "null") {
        try {
          const { fetchArticleById } = await import("./src/services/news_articles.js");
          const article = await Promise.race([
            fetchArticleById(articleId),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
          ]).catch(() => null);

          if (article && article.title) {
            ogTitle = article.title;
            const summary = article.summary || (article.content ? article.content.substring(0, 200) : "");
            // LinkedIn prefers descriptions > 100 chars
            ogDescription = summary.length > 100 ? summary : (summary + " " + ogDescription).substring(0, 200);
            
            if (article.image_url) {
              ogImage = article.image_url;
              if (ogImage.startsWith('/')) {
                const baseUrl = process.env.APP_URL || 'https://saas-sentinel-cyan.vercel.app';
                ogImage = `${baseUrl.replace(/\/$/, '')}${ogImage}`;
              }
            }
          }
        } catch (e) {
          console.error("[DEBUG] Error fetching article for OG tags:", e);
        }
      }

      // Extremely aggressive removal of existing meta/title/canonical tags
      html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
      html = html.replace(/<meta[^>]+property=["']og:[^"']+["'][^>]*>/gi, '');
      html = html.replace(/<meta[^>]+name=["']twitter:[^"']+["'][^>]*>/gi, '');
      html = html.replace(/<meta[^>]+name=["']description["'][^>]*>/gi, '');
      html = html.replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, '');

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
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="SaaS Sentinel" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDescription}" />
    <meta name="twitter:image" content="${ogImage}" />
`;

      if (html.includes('<head>')) {
        // Inject at the very beginning of <head> for fastest scraper discovery
        html = html.replace('<head>', `<head>${metaTags}`);
      } else {
        html = html.replace('<html', `<html prefix="og: http://ogp.me/ns#"><head>${metaTags}</head>`);
      }
      
      // Ensure the html tag has the OG prefix
      if (!html.includes('prefix="og:')) {
        html = html.replace('<html', '<html prefix="og: http://ogp.me/ns#"');
      }
      
      // Add OG prefix to html tag for better compatibility
      html = html.replace('<html', '<html prefix="og: http://ogp.me/ns#"');

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    } catch (error: any) {
      const minimalHtml = `<!DOCTYPE html><html><head><title>SaaS Sentinel</title></head><body><div id="root"></div></body></html>`;
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(minimalHtml);
    }
  });

  app.use(express.static(distPath));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

// Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("🔥 Global Server Error:", err);
  if (!res.headersSent) {
    res.status(500).send(`Internal Server Error: ${err.message || "Unknown Error"}`);
  }
});

if (process.env.VERCEL !== "1") {
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
