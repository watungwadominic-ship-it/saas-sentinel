import express from "express";
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

import { fetchTopSaaSNews, parseNewsIntoStories, generateArticle } from "./src/services/gemini.js";
import { supabase } from "./src/services/supabase.js";
import { saveNewsArticle } from "./src/services/news_articles.js";

const app = express();
app.use(express.json());

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: "Vercel API" });
});

app.post("/api/test-linkedin", async (req, res) => {
  try {
    await postToLinkedIn("📡 SaaS Sentinel Test: LinkedIn Intelligence Bot Online.", "Bot Test", "https://sentinel.example.com");
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
    for (const story of stories) {
      const { data: existing } = await supabase.from('news_articles').select('id').eq('title', story.title).maybeSingle();
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
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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

// Export for Vercel
export default app;
