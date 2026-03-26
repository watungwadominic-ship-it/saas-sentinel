import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fetchTopSaaSNews, parseNewsIntoStories, generateArticle } from "./src/services/gemini";
import { supabase } from "./src/services/supabase";
import { saveNewsArticle, fetchArticleById } from "./src/services/news_articles";
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("🚀 Server starting...");
console.log("📍 Current Directory (cwd):", process.cwd());
console.log("📍 __dirname:", __dirname);
console.log("📍 NODE_ENV:", process.env.NODE_ENV);
console.log("📍 VERCEL:", process.env.VERCEL);

// Catch initialization errors
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Social Media Clients
async function postToLinkedIn(text: string, title: string, url: string, imageUrl?: string) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  if (!token || !personUrn) {
    console.warn("⚠️ LinkedIn credentials missing, skipping post.");
    return;
  }

  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0"
  };

  const commentary = `${text}\n\nRead more on SaaS Sentinel: ${url}`;

  const postData = {
    "author": personUrn,
    "commentary": commentary,
    "visibility": "PUBLIC",
    "distribution": {
      "feedDistribution": "MAIN_FEED",
      "targetEntities": [],
      "thirdPartyDistributionChannels": []
    },
    "content": {
      "article": {
        "source": url,
        "title": title,
        "description": text.substring(0, 200)
      }
    },
    "lifecycleState": "PUBLISHED",
    "isReshareDisabledByAuthor": false
  };

  try {
    const response = await fetch("https://api.linkedin.com/v2/posts", {
      method: "POST",
      headers,
      body: JSON.stringify(postData)
    });
    if (!response.ok) {
      const resultText = await response.text();
      throw new Error(`LinkedIn API Error: ${resultText}`);
    }
    console.log("💼 LinkedIn Post Successful");
  } catch (e: any) {
    console.error("❌ LinkedIn Error:", e);
    throw e;
  }
}

const app = express();
app.use(express.json());

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    mode: "Full-Stack", 
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      PWD: process.cwd(),
      __dirname: __dirname
    }
  });
});

app.get("/api/debug-files", (req, res) => {
  const listFiles = (dir: string): string[] => {
    try {
      if (!fs.existsSync(dir)) return [`Directory not found: ${dir}`];
      const files = fs.readdirSync(dir);
      let results: string[] = [];
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          results.push(`[DIR] ${file}`);
          // results = results.concat(listFiles(fullPath).map(f => `${file}/${f}`));
        } else {
          results.push(file);
        }
      });
      return results;
    } catch (e: any) {
      return [`Error listing ${dir}: ${e.message}`];
    }
  };

  res.json({
    cwd: listFiles(process.cwd()),
    dist: listFiles(path.join(process.cwd(), "dist")),
    dirname: listFiles(__dirname),
    dirname_dist: listFiles(path.join(__dirname, "dist"))
  });
});

app.post("/api/test-linkedin", async (req, res) => {
  try {
    const host = req.get('host') || "saas-sentinel-cyan.vercel.app";
    const appUrl = `https://${host}`;
    await postToLinkedIn(
      "📡 SaaS Sentinel Test: LinkedIn Intelligence Bot Online.", 
      "Bot Test", 
      appUrl,
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2426"
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/cron", async (req, res) => {
  console.log("Cron Job Triggered...");
  try {
    const news = await fetchTopSaaSNews();
    const stories = await parseNewsIntoStories(news);
    
    let storyToProcess = null;
    for (const story of stories) {
      const { data: existing } = await (supabase.from('news_articles') as any).select('id').eq('title', story.title).maybeSingle();
      if (!existing) {
        storyToProcess = story;
        break;
      }
    }

    if (!storyToProcess) {
      return res.json({ success: true, message: "No new stories to process." });
    }

    console.log(`Processing story: ${storyToProcess.title}`);
    const result = await generateArticle(storyToProcess.title, storyToProcess.snippet);
    const savedArticle = await saveNewsArticle({
      title: result.title || storyToProcess.title,
      content: result.content || "Analysis pending.",
      category: result.category || storyToProcess.category || 'Intelligence Feed',
      summary: storyToProcess.snippet,
      source: 'SaaS Sentinel AI',
      breakdown: result.breakdown,
      sentinel_take: result.sentinel_take,
      verdict: result.verdict
    }) as any;

    if (savedArticle && savedArticle[0]) {
      const host = req.get('host') || "saas-sentinel-cyan.vercel.app";
      const appUrl = `https://${host}`;
      const articleUrl = `${appUrl}/?article=${savedArticle[0].id}`;
      await postToLinkedIn(
        result.sentinel_take || result.title || savedArticle[0].title, 
        savedArticle[0].title, 
        articleUrl,
        savedArticle[0].image_url
      );
      res.json({ success: true, article: savedArticle[0].title });
    } else {
      res.json({ success: false, error: "Failed to save article" });
    }
  } catch (e: any) {
    console.error("Cron Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Production Route Registration
if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
  const distPath = path.resolve(process.cwd(), "dist");
  console.log(`[DEBUG] distPath: ${distPath} (exists: ${fs.existsSync(distPath)})`);
  
  // 1. Handle the root path for OG tag injection
  app.get("/", async (req, res, next) => {
    const articleId = req.query.article as string;
    console.log(`[DEBUG] GET / - articleId: ${articleId}`);

    if (!articleId) {
      console.log(`[DEBUG] No articleId, falling through to static files`);
      return next();
    }

    try {
      // Find index.html
      const possiblePaths = [
        path.join(distPath, "index.html"),
        path.join(process.cwd(), "dist", "index.html"),
        path.join(process.cwd(), "index.html"),
        path.join(__dirname, "dist", "index.html"),
        path.join(__dirname, "index.html"),
        "/var/task/dist/index.html",
        "/var/task/index.html",
      ];

      let indexPath = "";
      for (const p of possiblePaths) {
        console.log(`[DEBUG] Checking path: ${p}`);
        if (fs.existsSync(p)) {
          indexPath = p;
          console.log(`[DEBUG] Found index.html at: ${p}`);
          break;
        }
      }

      let html = "";
      if (indexPath) {
        html = fs.readFileSync(indexPath, "utf-8");
      } else {
        console.warn("[DEBUG] ⚠️ index.html not found in any expected location. Using minimal fallback.");
        html = `<!DOCTYPE html><html><head><title>SaaS Sentinel</title></head><body><div id="root"></div></body></html>`;
      }

      console.log(`[DEBUG] Fetching article ${articleId}...`);
      const article = await Promise.race([
        fetchArticleById(articleId),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
      ]).catch(err => {
        console.error(`[DEBUG] ❌ Error fetching article:`, err);
        return null;
      });

      if (!article) {
        console.warn(`[DEBUG] ⚠️ Article ${articleId} not found or timeout`);
        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
      }

      console.log(`[DEBUG] ✅ Article found: ${article.title}. Injecting tags...`);
      
      const ogTitle = article.title;
      const ogDescription = article.summary || (article.content ? article.content.substring(0, 160) : "");
      const ogImage = article.image_url || "https://images.unsplash.com/photo-1510511459019-5dee997dd1db?q=80&w=1200&h=630&auto=format&fit=crop";
      const ogUrl = `${process.env.APP_URL || 'https://saas-sentinel-cyan.vercel.app'}/?article=${articleId}`;

      // Remove existing OG and Twitter tags to avoid conflicts
      html = html.replace(/<meta\s+property=["']og:.*?["']\s+content=["'].*?["']\s*\/?>/gi, '');
      html = html.replace(/<meta\s+name=["']twitter:.*?["']\s+content=["'].*?["']\s*\/?>/gi, '');
      html = html.replace(/<title>.*?<\/title>/gi, '');

      const metaTags = `
    <title>${ogTitle} | SaaS Sentinel</title>
    <meta name="description" content="${ogDescription}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDescription}" />
    <meta property="og:image" content="${ogImage}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${ogUrl}" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDescription}" />
    <meta name="twitter:image" content="${ogImage}" />
`;

      if (html.includes('</head>')) {
        html = html.replace('</head>', `${metaTags}\n  </head>`);
      } else if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${metaTags}`);
      } else {
        html = metaTags + html;
      }

      console.log(`[DEBUG] 🚀 Sending injected HTML (${html.length} bytes)`);
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (error) {
      console.error("[DEBUG] ❌ Critical error in root handler:", error);
      return next();
    }
  });

  // 2. Serve static files
  app.use(express.static(distPath));
  
  // 3. Fallback for SPA routing
  app.get("*", (req, res) => {
    console.log(`[DEBUG] GET * - path: ${req.path}`);
    const possiblePaths = [
      path.join(distPath, "index.html"),
      path.join(process.cwd(), "dist", "index.html"),
      "/var/task/dist/index.html",
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return res.sendFile(p);
      }
    }
    
    res.status(404).send("Not Found");
  });
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
  res.status(500).send("Internal Server Error");
});

if (process.env.VERCEL !== "1") {
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
