import express from "express";
import path from "path";
import fs from "fs";

// SaaS Sentinel - Vercel Optimized Entry Point
console.log("🚀 SaaS Sentinel initializing...");

const app = express();
app.set('trust proxy', true);
app.use(express.json());

// Import services statically for Vercel bundling
// We use lazy initialization in the routes to ensure startup is fast
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://dpwkojtfeoxlpyevutfc.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE';
const supabase = createClient(supabaseUrl, supabaseKey);

import * as gemini from "./src/services/gemini";
import * as newsArticles from "./src/services/news_articles";
import { postToThreads } from "./src/services/threads";

// 2. CORE SYSTEM ROUTES (FASTEST)
app.get("/api/health", (req, res) => {
  console.log("Health check pulse...");
  res.json({ 
    status: "ok", 
    vercel: !!process.env.VERCEL, 
    time: new Date().toISOString(),
    node: process.version,
    env: process.env.NODE_ENV
  });
});

app.get(["/robots.txt", "/api/robots.txt"], (req, res) => {
  const host = req.get('host') || 'saas-sentinel-cyan.vercel.app';
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  const base = (process.env.SHARED_APP_URL || `${protocol}://${host}`).replace(/\/$/, '');
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
});

// 3. INTELLIGENCE ROUTES
app.get(["/sitemap.xml", "/api/sitemap.xml"], async (req, res) => {
  try {
    const host = req.get('host') || 'saas-sentinel-cyan.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
    const base = (process.env.SHARED_APP_URL || `${protocol}://${host}`).replace(/\/$/, '');
    
    const { data: articles, error } = await supabase
      .from("news_articles")
      .select("id, slug, updated_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    
    if (error) {
      console.error("Supabase sitemap query error in server.ts:", error);
    }
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    sitemap += `\n  <url><loc>${base}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`;
    sitemap += `\n  <url><loc>${base}/archive</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`;
    sitemap += `\n  <url><loc>${base}/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
    sitemap += `\n  <url><loc>${base}/privacy</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`;

    if (articles && Array.isArray(articles)) {
      articles.forEach((a: any) => {
        const identifier = a.slug || a.id;
        if (identifier) {
          const rawMod = a.updated_at || a.created_at;
          let mod = new Date().toISOString().split('T')[0];
          if (rawMod && typeof rawMod === 'string') {
            mod = rawMod.split('T')[0];
          }
          sitemap += `\n  <url><loc>${base}/article/${identifier}</loc><lastmod>${mod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
        }
      });
    }
    sitemap += `\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(sitemap);
  } catch (err) {
    console.error("Sitemap Error:", err);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>/</loc></url>\n</urlset>`);
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const { data, error } = await supabase
      .from("news_articles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/news/:id", async (req, res) => {
  try {
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

// --- DYNAMIC METADATA SERVER-SIDE INJECTION FOR ARTICLES ---
app.get(['/article/:slugOrId', '/news/:slugOrId'], async (req, res) => {
  const { slugOrId } = req.params;
  const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
  const protocol = (req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https');
  const base = `${protocol}://${host}`;

  try {
    // First, try matching by slug
    let { data: article } = await supabase
      .from('news_articles')
      .select('*')
      .eq('slug', slugOrId)
      .maybeSingle();

    // If not found by slug, try by id (UUID lookup)
    if (!article) {
      const { data: byId } = await supabase
        .from('news_articles')
        .select('*')
        .eq('id', slugOrId)
        .maybeSingle();
      if (byId) article = byId;
    }

    // Load static index.html template to inject metadata into
    let htmlPath = path.join(process.cwd(), 'dist', 'index.html');
    if (!fs.existsSync(htmlPath)) {
      htmlPath = path.join(process.cwd(), 'index.html');
    }

    let html = '';
    if (fs.existsSync(htmlPath)) {
      html = fs.readFileSync(htmlPath, 'utf8');
    } else {
      html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>SaaS Sentinel</title></head><body><div id="root"></div></body></html>`;
    }

    if (article) {
      const title = `${article.title} | SaaS Sentinel`;
      const desc = (article.meta_description || article.summary || 'SaaS Sentinel B2B Intelligence').trim();
      let img = article.image_url || article.image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&h=630&auto=format&fit=crop';
      
      // Ensure the image URL is absolute for crawler parsers
      if (img.startsWith('/')) {
        img = `${base}${img}`;
      } else if (img.startsWith('proxy-image') || img.startsWith('/proxy-image')) {
        const queryUrl = img.includes('url=') ? decodeURIComponent(img.split('url=')[1]) : '';
        img = queryUrl || `${base}${img}`;
      }

      const url = `${base}/article/${article.slug || article.id}`;
      const published = article.created_at || new Date().toISOString();
      const modified = article.updated_at || article.created_at || new Date().toISOString();

      // JSON-LD structured data Schema
      const ldJsonObj = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": article.title,
        "description": desc,
        "image": [img],
        "datePublished": published,
        "dateModified": modified,
        "author": [{
          "@type": "Person",
          "name": "SaaS Sentinel Intelligence",
          "url": base
        }],
        "publisher": {
          "@type": "Organization",
          "name": "SaaS Sentinel",
          "logo": {
            "@type": "ImageObject",
            "url": `${base}/logo.png`
          }
        },
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": url
        }
      };
      
      const ldJsonString = JSON.stringify(ldJsonObj, null, 2);

      const injectedHead = `
    <!-- Dynamically Injected Rich Search SEO metadata -->
    <title>${title}</title>
    <meta name="robots" content="max-image-preview:large, max-snippet:-1, max-video-preview:-1, index, follow" />
    <meta name="googlebot" content="max-image-preview:large, index, follow" />
    <meta name="description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta name="thumbnail" content="${img}" />
    <link rel="canonical" href="${url}" />
    
    <!-- Open Graph -->
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:secure_url" content="${img}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${url}" />
    <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta name="twitter:image" content="${img}" />
    
    <!-- Rich Structured Schema (JSON-LD) -->
    <script type="application/ld+json">
    ${ldJsonString}
    </script>
      `;

      // Remove the static default title and any canonical tags from the template
      html = html.replace(/<title>[^<]*<\/title>/gi, '');
      html = html.replace(/<link rel="canonical"[^>]*>/gi, '');
      
      // Inject right at the top of head elements
      html = html.replace('<head>', `<head>${injectedHead}`);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err: any) {
    console.error("Dynamic Metadata Handler Crashed in server.ts:", err);
    // Serve index.html safely
    let htmlPath = path.join(process.cwd(), 'dist', 'index.html');
    if (!fs.existsSync(htmlPath)) {
      htmlPath = path.join(process.cwd(), 'index.html');
    }
    if (fs.existsSync(htmlPath)) {
      return res.sendFile(htmlPath);
    }
    return res.status(500).send("Server Error");
  }
});

app.all("/api/cron/fetch-news", async (req, res) => {
  try {
    console.log("Cron job triggered...");
    const rawNews = await gemini.fetchTopSaaSNews();
    const stories = await gemini.parseNewsIntoStories(rawNews);
    if (stories?.[0]) {
      const articleData = await gemini.generateArticle(stories[0].title, stories[0].snippet);
      const saved = await newsArticles.saveNewsArticle({ ...articleData, source: "SaaS Sentinel", readTime: "4 min read" });
      
      // Automated post to Threads if configured
      if (saved && saved[0]) {
        console.log(`[BOT] News saved: ${saved[0].title}. Attempting Threads post...`);
        try {
          await postToThreads(saved[0]);
        } catch (postError) {
          console.error("[BOT] Threads post failed:", postError);
        }
      }
      
      res.json({ success: true, title: stories[0].title });
    } else res.json({ success: false, reason: "No stories found" });
  } catch (e: any) { 
    console.error("Cron Error:", e);
    res.status(500).json({ error: e.message }); 
  }
});

const getGeminiKey = () => process.env.VITE_USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

async function callGemini(prompt: string, jsonMode = false) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const key = getGeminiKey();
  if (!key) {
    console.error("[Sentinel] GEMINI_API_KEY IS MISSING");
    throw new Error("GEMINI_API_KEY is missing");
  }
  
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.5-flash",
    ...(jsonMode ? { generationConfig: { responseMimeType: "application/json" } } : {})
  });
  
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    if (!text) throw new Error("Empty response from Gemini");
    return text;
  } catch (error: any) {
    console.error("[Sentinel] Gemini Call Failed in server.ts:", error);
    throw error;
  }
}

app.all(['/api/cron/weekly-newsletter', '/cron/weekly-newsletter', '/api/cron/weekly-newsletter/'], async (req, res) => {
  try {
    const { data: subscribers, error: subError } = await supabase.from('subscribers').select('email');
    
    let dbStatus = "ok";
    let dbMessage = "";
    if (subError) {
      dbStatus = "error";
      dbMessage = subError.message;
      console.error("[Sentinel Weekly Newsletter] Supabase subscribers fetch error:", subError);
    }
    
    let emails = (subscribers || []).map(s => s.email).filter(Boolean);
    let isTestFallback = false;
    
    if (emails.length === 0) {
      console.warn("[Sentinel Weekly Newsletter] No subscribers registered in the database. Falling back to sending a testing preview to the verified owner: watungwadominic@gmail.com.");
      emails = ['watungwadominic@gmail.com'];
      isTestFallback = true;
    }

    const { data: checkTotal, error: checkErr } = await supabase.from('subscribers').select('*', { count: 'exact', head: true });
    const actualDbCount = checkTotal === null ? 0 : (checkTotal || []).length || 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    let { data: articles } = await supabase
      .from('news_articles')
      .select('title, summary')
      .gt('created_at', sevenDaysAgo.toISOString())
      .limit(5);
    
    if (!articles || articles.length === 0) {
      console.log("[Sentinel Weekly Newsletter] No articles found in last 7 days. Falling back to the 5 most recent articles in the system.");
      const { data: recentArticles } = await supabase
        .from('news_articles')
        .select('title, summary')
        .order('created_at', { ascending: false })
        .limit(5);
      articles = recentArticles;
    }
    
    if (!articles?.length) {
      return res.json({ 
        success: true, 
        sent: 0, 
        message: "No fresh content available to build newsletter",
        dbStatus,
        dbMessage
      });
    }

    const prompt = `Create a high-end HTML newsletter for 'SaaS Sentinel'. Summarize these:\n${articles.map(a => `- ${a.title}: ${a.summary}`).join('\n')}`;
    const htmlRaw = await callGemini(prompt);
    const html = htmlRaw.replace(/```html|```/g, '').trim();

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    
    let smtpCheck = "ok";
    const errors: string[] = [];
    
    if (!smtpUser || !smtpPass) {
      smtpCheck = "missing_credentials";
      errors.push(`SMTP environment variables are not configured in your hosting dashboard. Please set SMTP_USER and SMTP_PASS under environment variables.`);
    }

    let sent = 0;
    if (smtpCheck === "ok") {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: { user: smtpUser, pass: smtpPass }
      });

      for (const email of emails) {
        try {
          await transporter.sendMail({
            from: `"SaaS Sentinel" <${smtpUser}>`,
            to: email,
            subject: (isTestFallback ? `[PREVIEW] ` : '') + `Weekly Intelligence: ${articles[0].title.substring(0, 40)}...`,
            html: isTestFallback 
              ? `<div style="background-color:#fff3cd; color:#856404; padding:12px; font-family:sans-serif; border-radius:6px; margin-bottom:15px; border:1px solid #ffeeba;"><strong>Admin Preview Notice:</strong> This email was dispatched to you (watungwadominic@gmail.com) as a live delivery preview because the 'subscribers' table in your Supabase database returned 0 registered emails. If you have sign-ups but see this notice, please ensure 'SUPABASE_SERVICE_ROLE_KEY' is set in your environment variables to bypass Row Level Security (RLS) on your table.</div>` + html 
              : html
          });
          sent++;
        } catch (e: any) { 
          console.error("Email fail for", email, e); 
          errors.push(`${email}: ${e.message}`);
        }
      }
    }

    res.json({ 
      success: true, 
      sent, 
      fallback: isTestFallback, 
      dbStatus, 
      dbMessage, 
      errors: errors.length > 0 ? errors : undefined,
      diagnostics: {
        smtpHost,
        smtpConfigured: smtpCheck === "ok",
        subscribersQueryLength: subscribers ? subscribers.length : null,
        actualDbCount
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/proxy-image", async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) return res.status(400).send("No URL");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SaaS-Sentinel-Bot/1.0' }
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error("Upstream error");
    
    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    return res.send(Buffer.from(buffer));
  } catch (e) {
    clearTimeout(timeoutId);
    return res.redirect(imageUrl);
  }
});

// 5. VITE MIDDLEWARE & STATIC SERVING
async function startServer() {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    try {
      console.log("🛠️ Setting up Vite middleware...");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Vite failed to initialize:", e);
    }
  } 
  
  if (!process.env.VERCEL) {
    const dist = path.resolve(process.cwd(), "dist");
    app.use(express.static(dist, { index: false }));
    
    app.get("*", (req: any, res: any, next: any) => {
      if (req.path.startsWith("/api")) return next();
      const indexPath = path.join(dist, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        if (process.env.NODE_ENV !== "production") return next();
        res.status(404).send("Frontend assets not built.");
      }
    });

    const PORT = parseInt(process.env.PORT || "3000", 10);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`📡 Sentinel active at http://0.0.0.0:${PORT}`);
    });
  }
}

// Only call startServer if NOT on Vercel
if (!process.env.VERCEL) {
  startServer().catch(err => console.error("StartServer failure:", err));
}

export default app;
