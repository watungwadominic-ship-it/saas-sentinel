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

import { fetchTopSaaSNews, parseNewsIntoStories, generateArticle } from "./src/services/gemini";
import { supabase } from "./src/services/supabase";
import { saveNewsArticle } from "./src/services/news_articles";

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  app.post("/api/test-linkedin", async (req, res) => {
    const token = process.env.LINKEDIN_ACCESS_TOKEN;
    if (!token) return res.status(400).json({ error: "LinkedIn token missing." });
    try {
      const meRes = await fetch("https://api.linkedin.com/v2/me", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const meData = await meRes.json();
      if (meData.id) {
        const urn = `urn:li:person:${meData.id}`;
        return res.json({ success: true, needsUrn: true, urn, message: `Found URN: ${urn}` });
      }
      res.status(400).json({ error: "Could not find URN." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/run-python-bot", (req, res) => {
    exec("python3 main.py", (error, stdout, stderr) => {
      if (error) return res.status(500).json({ success: false, error: stderr });
      res.json({ success: true, output: stdout });
    });
  });

  if (process.env.NODE_ENV !== "production") {
    // Dynamic import to prevent crash on Vercel
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return app;
}

const appPromise = startServer();

export default async (req: any, res: any) => {
  const app = await appPromise;
  app(req, res);
};
