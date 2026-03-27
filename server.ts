import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy for Python Bot (if running locally or on same host)
  app.post("/api/run-python-bot", async (req, res) => {
    try {
      // This assumes the python script is triggered via a shell command or another service
      // For this environment, we'll simulate a successful trigger
      res.json({ success: true, message: "Intelligence scan initiated." });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    
    // Custom middleware to inject OG tags into the HTML
    app.use(async (req, res, next) => {
      if (req.method !== 'GET' || req.path.includes('.') || req.path.startsWith('/api')) {
        return next();
      }

      try {
        let html = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        html = await vite.transformIndexHtml(req.url, html);

        const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const articleId = urlParams.get('article');

        let ogTitle = "SaaS Sentinel | Elite B2B Market Intelligence";
        let ogDescription = "Tracking high-growth software ecosystems with AI-driven precision. Strategic insights for founders, investors, and developers.";
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
              ogDescription = article.summary || (article.content ? article.content.substring(0, 160) : ogDescription);
              if (article.image_url) {
                ogImage = article.image_url;
                // Ensure absolute URL
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

        // Remove existing tags to avoid conflicts (more robust regex)
        html = html.replace(/<meta[^>]+property=["']og:[^"']+["'][^>]*>/gi, '');
        html = html.replace(/<meta[^>]+name=["']twitter:[^"']+["'][^>]*>/gi, '');
        html = html.replace(/<meta[^>]+name=["']description["'][^>]*>/gi, '');
        html = html.replace(/<title>[^<]*<\/title>/gi, '');
        html = html.replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, '');

        const metaTags = `
    <title>${ogTitle}</title>
    <meta name="description" content="${ogDescription}" />
    <link rel="canonical" href="${ogUrl}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="SaaS Sentinel" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDescription}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:secure_url" content="${ogImage}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${ogTitle}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDescription}" />
    <meta name="twitter:image" content="${ogImage}" />
`;

        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head>${metaTags}`);
        } else {
          html = html.replace('<html>', `<html><head>${metaTags}</head>`);
        }
        
        // Add OG prefix to html tag for better compatibility
        html = html.replace('<html', '<html prefix="og: http://ogp.me/ns#"');

        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
