import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { fetchTopSaaSNews, parseNewsIntoStories, generateArticle } from "./src/services/gemini";
import { supabase } from "./src/services/supabase";
import { saveNewsArticle, fetchArticleById } from "./src/services/news_articles";

dotenv.config();

// Social Media Clients
async function postToLinkedIn(text: string, title: string, url: string, imageUrl?: string) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  if (!token || !personUrn) return;

  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0"
  };

  // Append Read More link to the text
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
  res.json({ status: "ok", mode: "Full-Stack" });
});

app.post("/api/test-linkedin", async (req, res) => {
  try {
    const appUrl = process.env.APP_URL || "https://saas-sentinel-cyan.vercel.app";
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
    
    // Find the first story that hasn't been posted yet
    let storyToProcess = null;
    for (const story of stories) {
      const { data: existing } = await supabase.from('news_articles').select('id').eq('title', story.title).maybeSingle();
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
    });

    // Post to LinkedIn
    if (savedArticle && savedArticle[0]) {
      const appUrl = process.env.APP_URL || "https://saas-sentinel-cyan.vercel.app";
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
    res.status(500).json({ 
      error: e.message,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

app.post("/api/sync-news", async (req, res) => {
  try {
    const rawNews = await fetchTopSaaSNews();
    const stories = await parseNewsIntoStories(rawNews);
    res.json({ success: true, count: stories.length });
  } catch (error) {
    res.status(500).json({ error: "Sync failed" });
  }
});

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const indexPath = path.join(distPath, "index.html");

    // Handle dynamic OG tags for the root path with article query
    app.get("/", async (req, res, next) => {
      const articleId = req.query.article as string;
      
      if (articleId && fs.existsSync(indexPath)) {
        try {
          const article = await fetchArticleById(articleId);
          if (article) {
            let html = fs.readFileSync(indexPath, "utf-8");
            
            const ogTitle = article.title;
            const ogDescription = article.summary;
            const ogImage = article.image_url || "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1000";
            const appUrl = process.env.APP_URL || "https://saas-sentinel-cyan.vercel.app";
            const ogUrl = `${appUrl}/?article=${articleId}`;

            // Replace meta tags with more robust regex (handling optional spaces)
            html = html.replace(/<title>.*?<\/title>/, `<title>${ogTitle} | SaaS Sentinel</title>`);
            html = html.replace(/<meta property="og:title" content=".*?"\s*\/>/g, `<meta property="og:title" content="${ogTitle}" />`);
            html = html.replace(/<meta property="og:description" content=".*?"\s*\/>/g, `<meta property="og:description" content="${ogDescription}" />`);
            html = html.replace(/<meta property="og:image" content=".*?"\s*\/>/g, `<meta property="og:image" content="${ogImage}" />`);
            html = html.replace(/<meta property="og:url" content=".*?"\s*\/>/g, `<meta property="og:url" content="${ogUrl}" />`);
            
            // Twitter tags (using property as in index.html)
            html = html.replace(/<meta property="twitter:title" content=".*?"\s*\/>/g, `<meta property="twitter:title" content="${ogTitle}" />`);
            html = html.replace(/<meta property="twitter:description" content=".*?"\s*\/>/g, `<meta property="twitter:description" content="${ogDescription}" />`);
            html = html.replace(/<meta property="twitter:image" content=".*?"\s*\/>/g, `<meta property="twitter:image" content="${ogImage}" />`);
            html = html.replace(/<meta property="twitter:url" content=".*?"\s*\/>/g, `<meta property="twitter:url" content="${ogUrl}" />`);

            // Canonical
            html = html.replace(/<link rel="canonical" href=".*?"\s*\/>/g, `<link rel="canonical" href="${ogUrl}" />`);
            
            return res.send(html);
          }
        } catch (e) {
          console.error("Error injecting OG tags:", e);
        }
      }
      next();
    });

    app.use(express.static(distPath));
    
    app.get("*", (req, res) => {
      res.sendFile(indexPath);
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only start the server if we're not on Vercel
if (process.env.VERCEL !== "1") {
  startServer();
}

export default app;
