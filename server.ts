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
      .select("id, slug, updated_at, created_at, image_url, title")
      .order("created_at", { ascending: false })
      .limit(100);
    
    if (error) {
      console.error("Supabase sitemap query error in server.ts:", error);
    }
    
    const escapeXml = (unsafe: string): string => {
      if (!unsafe) return '';
      return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '\'': return '&apos;';
          case '"': return '&quot;';
          default: return c;
        }
      });
    };

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;
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
          const articleUrl = `${base}/article/${identifier}`;
          sitemap += `\n  <url>\n    <loc>${articleUrl}</loc>\n    <lastmod>${mod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>`;
          
          const img = a.image_url;
          if (img) {
            let absoluteImg = img;
            if (img.startsWith('/')) {
              absoluteImg = `${base}${img}`;
            }
            sitemap += `\n    <image:image>\n      <image:loc>${escapeXml(absoluteImg)}</image:loc>`;
            if (a.title) {
              sitemap += `\n      <image:title>${escapeXml(a.title)}</image:title>`;
            }
            sitemap += `\n    </image:image>`;
          }
          sitemap += `\n  </url>`;
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
    <meta itemprop="image" content="${img}" />
    <link rel="image_src" href="${img}" />
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

async function callGemini(prompt: string, jsonMode = false, apiKeyOverride?: string) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const key = apiKeyOverride || getGeminiKey();
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
    const headerUrl = req.headers['x-supabase-url'] as string;
    const headerKey = (req.headers['x-supabase-service-role-key'] as string) || (req.headers['x-supabase-key'] as string);
    
    const dbUrl = headerUrl || process.env.SUPABASE_URL || 'https://dpwkojtfeoxlpyevutfc.supabase.co';
    const dbKey = headerKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE';
    
    const supabaseClient = createClient(dbUrl, dbKey);
    const { data: subscribers, error: subError } = await supabaseClient.from('subscribers').select('email');
    
    if (subError) {
      console.error("[Sentinel Weekly Newsletter] Supabase subscribers fetch error:", subError);
      return res.status(500).json({
        success: false,
        error: "Subscribers fetch failed: " + subError.message,
        dbStatus: "error",
        dbMessage: subError.message
      });
    }
    
    let emails = (subscribers || []).map(s => s.email).filter(Boolean);
    let isTestFallback = false;
    
    if (emails.length === 0) {
      console.warn("[Sentinel Weekly Newsletter] No subscribers registered in the database. Falling back to sending a testing preview to the verified owner: watungwadominic@gmail.com.");
      emails = ['watungwadominic@gmail.com'];
      isTestFallback = true;
    }

    const { data: checkTotal, error: checkErr } = await supabaseClient.from('subscribers').select('*', { count: 'exact', head: true });
    const actualDbCount = checkTotal === null ? 0 : (checkTotal || []).length || 0;

    const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${protocol}://${host}`;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    let { data: articles, error: articlesErr } = await supabaseClient
      .from('news_articles')
      .select('title, summary, slug, id, created_at, image_url')
      .gt('created_at', sevenDaysAgo.toISOString())
      .limit(5);
    
    if (articlesErr) {
      console.error("[Sentinel Weekly Newsletter] Supabase articles query failed:", articlesErr);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch news articles: " + articlesErr.message,
        dbStatus: "error"
      });
    }

    if (!articles || articles.length === 0) {
      console.log("[Sentinel Weekly Newsletter] No articles found in last 7 days. Falling back to the 5 most recent articles in the system.");
      const { data: recentArticles, error: recentErr } = await supabaseClient
        .from('news_articles')
        .select('title, summary, slug, id, created_at, image_url')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentErr) {
        console.error("[Sentinel Weekly Newsletter] Supabase recent articles query failed:", recentErr);
        return res.status(500).json({
          success: false,
          error: "Failed to fetch recent fallback articles: " + recentErr.message,
          dbStatus: "error"
        });
      }
      articles = recentArticles;
    }
    
    if (!articles?.length) {
      return res.json({ 
        success: true, 
        sent: 0, 
        message: "No fresh content available to build newsletter",
        dbStatus: "ok"
      });
    }

    const headerGeminiKey = req.headers['x-gemini-api-key'] as string;
    
    const prompt = `You are the lead newsletter writer for 'SaaS Sentinel', a premier technology intelligence publication.
Generate an exceptionally clean, responsive, and high-end HTML newsletter summarizing the past week's stories. 

Core requirements:
1. OUTPUT ONLY THE PURE, VALID HTML. Do NOT wrap it in any Markdown code fences or blocks (like \`\`\`html or \`\`\`), and do NOT include any conversational preamble or postscript message outside the HTML. Start directly with <!DOCTYPE html> or <html lang="en">.
2. Styling must use clean inline styles (CSS in style elements is also fine if supported, but prefer inline CSS for maximum email client compatibility).
3. Do not include any warning, diagnostic, or debug notices. The content must be absolute professional brand quality ready for final consumers.
4. Colors & Theme: Use SaaS Sentinel's custom high-end tech aesthetic:
   - Deep rich charcoal backgrounds (#0f172a or #1e293b) for structural elements layout
   - White background for the main email wrapper body (#ffffff)
   - Accent colors in luxury teals/cyans (#06b6d4, #0891b2) and steel slate (#64748b)
   - Dark modern readable typography (System sans-serif, Inter, Helvetica, Arial)
5. Layout Sections:
   - Header: A beautifully styled, centered header reading "SaaS Sentinel • Weekly Intelligence". Modern, high-contrast, premium styling with a cyan accent border or element.
   - Subline: "Technical depth, financial realities, and strategic insights from the SaaS ecosystem."
   - Date Banner: Presenting today's date in an elegant text style.
   - Featured Articles: For each of the follow articles, create a modern, luxurious card element with generous padding (e.g., padding: 25px; border-radius: 12px; margin-bottom: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; text-align: left; overflow: hidden;). include:
     * Card Banner Image: If a non-empty image URL is provided in the '- Image:' field for that article, you MUST include a beautifully styled card top banner: <img src="[Image URL]" referrerPolicy="no-referrer" style="width: 100%; max-height: 240px; object-fit: cover; border-radius: 8px; display: block; margin-bottom: 16px;" alt="Article illustration" /> at the top of the card. If the Image field is empty, do not place any img element.
     * A small cyan category badge (e.g. "SaaS Intelligence Briefing" or "Tech Deep-Dive")
     * The Title of the article in heavy charcoal (#0f172a)
     * The summary beautifully formatted into clean, highly readable paragraphs or short bullet highlights
     * A beautiful action button styled with: background-color: #0891b2; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block; letter-spacing: 0.5px; margin-top: 12px; displaying "Read Full Intelligence Briefing →".
     * Provide EXACT link pointing to the article: Use the exact URL given in the corresponding '- Link:' field for that article as the 'href' attribute value. Do NOT change, shorten, or truncate this URL.
   - Weekly Conclusion: A brief professional sign-off summarizing market trends.
   - Footer: Centered, small slate-gray typography (#64748b) containing:
     * "You are receiving this intelligence report because you subscribed to SaaS Sentinel. We appreciate you being part of our subscriber-first community."
     * Unsubscribe Action link: "If you wish to change your delivery options or unsubscribe, you may do so at any time by visiting ${baseUrl}?action=unsubscribe."
     * Brand block: "© 2026 SaaS Sentinel, Inc. • London, UK • Technical intelligence for the modern enterprise."

Here are the articles to summarize and generate exact card actions for:
${articles.map((a, i) => `ARTICLE ${i+1}:
- Title: ${a.title}
- Summary: ${a.summary}
- Link: ${baseUrl}/news/${a.slug || a.id || ''}
- Image: ${a.image_url || ''}
`).join('\n')}`;

    const htmlRaw = await callGemini(prompt, false, headerGeminiKey);
    
    // Extract HTML using our robust clean-up routine to prevent any conversational leakages
    const cleanHtmlOutput = (raw: string): string => {
      const match = raw.match(/```html([\s\S]*?)```/i);
      if (match && match[1]) {
        return match[1].trim();
      }
      const matchGeneric = raw.match(/```([\s\S]*?)```/);
      if (matchGeneric && matchGeneric[1]) {
        return matchGeneric[1].trim();
      }
      const firstAngle = raw.indexOf('<');
      const lastAngle = raw.lastIndexOf('>');
      if (firstAngle !== -1 && lastAngle !== -1 && lastAngle > firstAngle) {
        return raw.substring(firstAngle, lastAngle + 1).trim();
      }
      return raw.trim();
    };

    const html = cleanHtmlOutput(htmlRaw);

    const headerSmtpUser = req.headers['x-gmail-user'] as string || req.headers['x-smtp-user'] as string;
    const headerSmtpPass = req.headers['x-gmail-pass'] as string || req.headers['x-smtp-pass'] as string;

    const smtpUser = headerSmtpUser || process.env.SMTP_USER || process.env.GMAIL_USER;
    const smtpPass = headerSmtpPass || process.env.SMTP_PASS || process.env.GMAIL_PASS;
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    
    let smtpCheck = "ok";
    const errors: string[] = [];
    
    if (!smtpUser || !smtpPass) {
      smtpCheck = "missing_credentials";
      errors.push(`SMTP environment variables are not configured in your hosting dashboard.`);
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
            subject: (isTestFallback ? `[PREVIEW] ` : '') + `SaaS Sentinel Weekly Intelligence: ${articles[0].title.substring(0, 50)}...`,
            html: html // Ensure pristine, error-free HTML is sent to the address without system/debug warning banners
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
      dbStatus: "ok", 
      dbMessage: "", 
      errors: errors.length > 0 ? errors : undefined,
      diagnostics: {
        smtpHost,
        smtpConfigured: smtpCheck === "ok",
        subscribersQueryLength: subscribers ? subscribers.length : null,
        actualDbCount,
        envKeys: {
          supabaseUrl: dbUrl ? `${dbUrl.substring(0, 15)}...` : "not set",
          supabaseKey: dbKey ? `${dbKey.substring(0, 8)}...${dbKey.substring(dbKey.length - 4)}` : "not set",
          supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? `${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 8)}...${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(process.env.SUPABASE_SERVICE_ROLE_KEY.length - 4)}` : "not set",
          smtpUser: smtpUser ? `${smtpUser.substring(0, 4)}...` : "not set",
          smtpPass: smtpPass ? "set" : "not set"
        }
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
