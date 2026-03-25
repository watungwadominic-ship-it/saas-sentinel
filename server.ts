import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { exec } from "child_process";

dotenv.config();

// Social Media Clients
async function postToLinkedIn(text: string, title: string, url: string) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  if (!token || !personUrn) return;

  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0"
  };

  const postData = {
    "author": personUrn,
    "commentary": text,
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
    const resultText = await response.text();
    if (response.ok) {
      console.log("💼 LinkedIn Post Successful");
    } else {
      console.error("❌ LinkedIn Error:", resultText);
      throw new Error(`LinkedIn API Error: ${resultText}`);
    }
  } catch (e: any) {
    console.error("❌ LinkedIn Error:", e);
    throw e;
  }
}

import { fetchTopSaaSNews, parseNewsIntoStories, generateArticle } from "./src/services/gemini.js";
import { supabase } from "./src/services/supabase.js";
import { saveNewsArticle } from "./src/services/news_articles.js";

console.log("SERVER STARTING...");

async function startServer() {
  console.log("Initializing Express...");
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // API Route for LinkedIn Connection Test
  app.post("/api/test-linkedin", async (req, res) => {
    const token = process.env.LINKEDIN_ACCESS_TOKEN;
    let personUrn = process.env.LINKEDIN_PERSON_URN;

    if (!token) {
      return res.status(400).json({ error: "LinkedIn Access Token missing. Add LINKEDIN_ACCESS_TOKEN to Secrets." });
    }

    // If URN is missing, try to fetch it automatically
    if (!personUrn) {
      try {
        console.log("Attempting to fetch LinkedIn Person URN...");
        
        // Try OpenID UserInfo first
        let response = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        let data = await response.json();
        
        if (data.sub) {
          personUrn = `urn:li:person:${data.sub}`;
        } else {
          // Fallback to /v2/me (requires r_liteprofile or profile scope)
          console.log("UserInfo failed, trying /v2/me...");
          response = await fetch("https://api.linkedin.com/v2/me", {
            headers: { "Authorization": `Bearer ${token}` }
          });
          data = await response.json();
          if (data.id) {
            personUrn = `urn:li:person:${data.id}`;
          }
        }

        if (personUrn) {
          console.log(`✅ Found LinkedIn URN: ${personUrn}`);
          return res.json({ 
            success: false, 
            needsUrn: true, 
            urn: personUrn,
            message: `Found your LinkedIn ID! Please add a new secret named LINKEDIN_PERSON_URN with this value: ${personUrn}`
          });
        } else {
          console.error("LinkedIn ID discovery failed. Data received:", data);
          return res.status(400).json({ error: "Could not find your LinkedIn ID. Please ensure you selected 'openid' and 'profile' scopes in the Token Generator." });
        }
      } catch (e: any) {
        console.error("Failed to fetch LinkedIn ID:", e);
        return res.status(500).json({ error: "Failed to fetch LinkedIn ID. Check your internet connection or token." });
      }
    }

    try {
      await postToLinkedIn("📡 SaaS Sentinel Test: LinkedIn Intelligence Bot Online. #SaaS #B2B #MarketIntel", "Bot Connection Test", "https://ais-dev-k2zyhx7iw4f2x55hvxwlzg-10310046101.europe-west2.run.app");
      res.json({ success: true });
    } catch (e: any) {
      console.error("LinkedIn Test Failed:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Vercel Cron Job Route
  app.get("/api/cron", async (req, res) => {
    // Verify Cron Secret (optional but recommended)
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log("Cron Job Triggered: Running Intelligence Scan...");
    
    // 1. Run Python Bot (Social Posts)
    exec("python3 main.py", async (error, stdout, stderr) => {
      if (error) {
        console.error(`Cron Python Bot Error: ${error}`);
      } else {
        console.log("Cron Python Bot Success");
        // Parse social posts from stdout if needed
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (line.startsWith('SOCIAL_POST:')) {
            try {
              const postData = JSON.parse(line.replace('SOCIAL_POST:', '').trim());
              if (postData.socialText) {
                await postToTwitter(postData.socialText);
                await postToLinkedIn(postData.socialText, postData.title, "https://ais-dev-k2zyhx7iw4f2x55hvxwlzg-10310046101.europe-west2.run.app");
              }
            } catch (e) {
              console.error("Error parsing cron social post:", e);
            }
          }
        }
      }
    });

    // 2. Run News Sync (Supabase)
    try {
      const news = await fetchTopSaaSNews();
      const stories = parseNewsIntoStories(news);
      for (const story of stories) {
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('title', story.title)
          .maybeSingle();

        if (existing) continue;

        const result = await generateArticle(story.title, story.snippet);
        await saveNewsArticle({
          title: result.title || story.title,
          content: result.content || "Analysis pending.",
          category: result.category || story.category || 'Intelligence Feed',
          summary: story.snippet,
          source: 'SaaS Sentinel AI',
          breakdown: result.breakdown,
          sentinel_take: result.sentinel_take,
          verdict: result.verdict
        });
      }
      console.log("Cron News Sync Success");
    } catch (e) {
      console.error("Cron News Sync Error:", e);
    }

    res.json({ success: true, message: "Cron job executed" });
  });

  // API Route for Python Bot Manual Trigger
  app.post("/api/run-python-bot", (req, res) => {
    console.log("Triggering Python News Bot...");
    exec("python3 main.py", async (error, stdout, stderr) => {
      if (error) {
        console.error(`Python Bot Error: ${error}`);
        return res.status(500).json({ error: error.message, stderr });
      }
      
      console.log(`Python Bot Output: ${stdout}`);
      
      // Parse social posts from stdout
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (line.startsWith("SOCIAL_POST: ")) {
          try {
            const data = JSON.parse(line.replace("SOCIAL_POST: ", ""));
            const socialText = `🚀 NEW INTEL: ${data.title}\n\n${data.summary.substring(0, 200)}...\n\nRead more: ${data.url}\n\n#SaaS #EnterpriseAI #MarketIntel`;
            
            // Post to Twitter
            await postToTwitter(socialText.substring(0, 280));
            
            // Post to LinkedIn
            await postToLinkedIn(socialText, data.title, data.url);
          } catch (e) {
            console.error("Failed to parse social post data", e);
          }
        }
      }
      
      res.json({ success: true, output: stdout });
    });
  });

  // API Route for Manual Sync
  app.post("/api/sync-news", async (req, res) => {
    try {
      console.log("Starting News Sync Workflow...");
      
      // 0. Fetch top 3 articles for context
      const { data: topArticles } = await supabase
        .from('news_articles')
        .select('title, summary')
        .order('created_at', { ascending: false })
        .limit(3);
      
      const context = topArticles?.map(a => `${a.title}: ${a.summary}`).join('\n');

      // 1. Fetch news using Search Grounding
      const rawNews = await fetchTopSaaSNews(context);
      
      // 2. Parse into structured stories
      const stories = await parseNewsIntoStories(rawNews);
      
      const processedArticles = [];
      const topStories = stories.slice(0, 2); // Reduced from 5 to avoid quota issues

      // 3. Generate deep dives and save to Supabase
      for (const story of topStories) {
        // Add a 30-second delay between articles to respect free tier rate limits (2 RPM for Pro)
        if (topStories.indexOf(story) > 0) {
          console.log("Waiting 30s before next generation to avoid rate limits...");
          await sleep(30000);
        }

        console.log(`Generating deep dive for: ${story.title}`);
        
        // Check if article with same title already exists
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('title', story.title)
          .maybeSingle();

        if (existing) {
          console.log(`Article with title "${story.title}" already exists. Skipping.`);
          continue;
        }

        const result = await generateArticle(story.title, story.snippet);
        
        const data = await saveNewsArticle({
          title: result.title || story.title,
          content: result.content || "Analysis pending.",
          category: result.category || story.category || 'Intelligence Feed',
          summary: story.snippet,
          source: 'SaaS Sentinel AI',
          breakdown: result.breakdown,
          sentinel_take: result.sentinel_take,
          verdict: result.verdict
        });

        if (data) {
          processedArticles.push(data[0]);
        }
      }

      res.json({ success: true, articles: processedArticles });
    } catch (error) {
      console.error("Sync Workflow Failed:", error);
      res.status(500).json({ error: "Sync failed" });
    }
  });

  // Background Workflow
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Scheduled Python Bot Run
  setInterval(() => {
    console.log("Running scheduled Python News Bot...");
    exec("python3 main.py", async (error, stdout, stderr) => {
      if (error) {
        console.error(`Scheduled Python Bot Error: ${error}`);
      } else {
        console.log(`Scheduled Python Bot Output: ${stdout}`);
        
        // Parse social posts from stdout
        const lines = stdout.split("\n");
        for (const line of lines) {
          if (line.startsWith("SOCIAL_POST: ")) {
            try {
              const data = JSON.parse(line.replace("SOCIAL_POST: ", ""));
              const socialText = `🚀 NEW INTEL: ${data.title}\n\n${data.summary.substring(0, 200)}...\n\nRead more: ${data.url}\n\n#SaaS #EnterpriseAI #MarketIntel`;
              
              // Post to Twitter
              await postToTwitter(socialText.substring(0, 280));
              
              // Post to LinkedIn
              await postToLinkedIn(socialText, data.title, data.url);
            } catch (e) {
              console.error("Failed to parse social post data", e);
            }
          }
        }
      }
    });
  }, TWELVE_HOURS);

  setInterval(async () => {
    console.log("Running scheduled background sync...");
    try {
      // Fetch top 3 articles for context
      const { data: topArticles } = await supabase
        .from('news_articles')
        .select('title, summary')
        .order('created_at', { ascending: false })
        .limit(3);
      
      const context = topArticles?.map(a => `${a.title}: ${a.summary}`).join('\n');

      const rawNews = await fetchTopSaaSNews(context);
      const stories = await parseNewsIntoStories(rawNews);
      const topStories = stories.slice(0, 2); // Reduced from 5 to avoid quota issues

      for (const story of topStories) {
        // Add a 30-second delay between articles to respect free tier rate limits (2 RPM for Pro)
        if (topStories.indexOf(story) > 0) {
          console.log("Waiting 30s before next generation to avoid rate limits...");
          await sleep(30000);
        }

        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('title', story.title)
          .maybeSingle();

        if (existing) continue;

        const result = await generateArticle(story.title, story.snippet);
        await saveNewsArticle({ 
          title: result.title || story.title, 
          content: result.content || "Analysis pending.", 
          category: result.category || story.category || 'Intelligence Feed',
          summary: story.snippet,
          source: 'SaaS Sentinel AI',
          breakdown: result.breakdown,
          sentinel_take: result.sentinel_take,
          verdict: result.verdict
        });
      }
      console.log("Scheduled sync complete.");
    } catch (e) {
      console.error("Scheduled sync failed", e);
    }
  }, TWELVE_HOURS);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Vite in middleware mode...");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware attached.");
    } catch (e) {
      console.error("Failed to start Vite server:", e);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Serve static files from the dist directory
    app.use(express.static(distPath));
    
    // Fallback for SPA routing
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          res.status(500).send("Production build (dist/index.html) not found. Please run 'npm run build' first.");
        }
      });
    });
  }
  
  return app;
}

// Initialize the app
const appPromise = startServer();

// For Vercel compatibility, we export a function that handles the request
export default async (req: any, res: any) => {
  const app = await appPromise;
  app(req, res);
};
