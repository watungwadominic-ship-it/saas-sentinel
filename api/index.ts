import express, { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// --- SOCIAL MEDIA ENGAGEMENT BOOSTER (INLINED TO AVOID VERCEL NATIVE ESM IMPORT ISSUES) ---

const SOCIAL_MAPPINGS: Record<string, string> = {
  "microsoft": "@microsoft",
  "salesforce": "@salesforce",
  "openai": "@openai",
  "stripe": "@stripe",
  "google": "@google",
  "meta": "@meta",
  "apple": "@apple",
  "nvidia": "@nvidia",
  "figma": "@figma",
  "adobe": "@adobe",
  "hubspot": "@hubspot",
  "shopify": "@shopify",
  "slack": "@slack",
  "databricks": "@databricks",
  "snowflake": "@snowflake",
  "zoom": "@zoom",
  "canva": "@canva",
  "atlassian": "@atlassian",
  "gitlab": "@gitlab",
  "github": "@github",
  "notion": "@notion",
  "y combinator": "@ycombinator",
  "yc": "@ycombinator",
  "sam altman": "@sama",
  "elon musk": "@elonmusk",
  "zuckerberg": "@zuck",
  "anthropic": "@anthropic_co",
  "klarna": "@klarna",
  "vanta": "@vanta",
  "rippling": "@rippling",
  "clickup": "@clickup",
  "deel": "@deel",
  "gusto": "@gusto"
};

interface SocialBoostResult {
  mentions: string[];
  tags: string[];
  cta: string;
}

function getSocialBoost(title: string, summary: string, category?: string): SocialBoostResult {
  const searchText = `${title} ${summary}`.toLowerCase();
  const mentions: string[] = [];

  for (const [key, handle] of Object.entries(SOCIAL_MAPPINGS)) {
    if (searchText.includes(key)) {
      mentions.push(handle);
    }
  }

  // Deduplicate mentions
  const uniqueMentions = Array.from(new Set(mentions));

  // Determine targeted tags based on category
  const tags = ["#SaaS", "#B2B", "#Startups", "#SaaSSentinel"];
  if (category) {
    const cat = category.toLowerCase();
    if (cat.includes("ai") || cat.includes("artificial") || cat.includes("bullish")) {
      tags.push("#AI", "#GenerativeAI", "#Tech", "#LLMs");
    } else if (cat.includes("fund") || cat.includes("venture") || cat.includes("m&a")) {
      tags.push("#Funding", "#VentureCapital", "#VC", "#Investing", "#MAndA");
    } else if (cat.includes("growth") || cat.includes("market") || cat.includes("plg")) {
      tags.push("#PLG", "#GrowthHacking", "#Marketing", "#Sales");
    } else if (cat.includes("strategy") || cat.includes("product") || cat.includes("enterprise")) {
      tags.push("#BusinessStrategy", "#ProductManagement", "#Enterprise", "#Leadership");
    }
  }

  // Deduplicate tags
  const uniqueTags = Array.from(new Set(tags));

  // Engaging CTAs to drive replies and shares
  const ctas = [
    "How does this development align with your Q3 SaaS strategy?",
    "What’s your perspective on this strategic transition?",
    "A remarkable milestone in the B2B tech landscape. Thoughts?",
    "Essential reading for B2B executives and product builders.",
    "Our market analysis has the full breakdown. How are you adapting?"
  ];

  // Select a CTA deterministically
  const ctaIndex = title.length % ctas.length;
  const cta = ctas[ctaIndex];

  return {
    mentions: uniqueMentions,
    tags: uniqueTags,
    cta
  };
}

function buildThreadsPost(
  title: string,
  summary: string,
  articleIdOrSlug: string,
  category?: string,
  originUrl?: string
): string {
  const MAX_LEN = 485; // safe character boundary for Threads (max 500)
  const shareId = articleIdOrSlug || '';
  const baseDomain = originUrl || 'https://saas-sentinel.com';
  const cleanBase = baseDomain.replace(/\/$/, "");
  
  const header = `📢 INTELLIGENCE BRIEF: ${title}\n\n`;
  const footer = `\n\n🔗 Read more: ${cleanBase}/article/${shareId}`;
  
  const boost = getSocialBoost(title, summary, category);
  let mentions = boost.mentions;
  let tags = boost.tags;
  let cta = boost.cta;
  
  if (mentions.length > 3) mentions = mentions.slice(0, 3);
  if (tags.length > 4) tags = tags.slice(0, 4);
  
  // Progressively build option text helper
  const getOptText = (incCta: boolean, incMentions: boolean, incTags: boolean): string => {
    let opt = "";
    if (incCta && cta) opt += `\n\n💡 ${cta}`;
    if (incMentions && mentions.length > 0) opt += `\n\nCc: ${mentions.join(' ')}`;
    if (incTags && tags.length > 0) opt += `\n\n${tags.join(' ')}`;
    return opt;
  };
  
  // Try with everything
  let optText = getOptText(true, true, true);
  let totalNonSummaryLen = header.length + optText.length + footer.length;
  
  if (totalNonSummaryLen + summary.length <= MAX_LEN) {
    return `${header}${summary}${optText}${footer}`;
  }
  
  // 1. Try with everything and truncate summary (minimum 140 chars for summary readability)
  let availableForSummary = MAX_LEN - totalNonSummaryLen;
  if (availableForSummary >= 140) {
    const truncated = summary.substring(0, availableForSummary - 3).trim() + "...";
    return `${header}${truncated}${optText}${footer}`;
  }
  
  // 2. Drop tags, try again
  optText = getOptText(true, true, false);
  totalNonSummaryLen = header.length + optText.length + footer.length;
  availableForSummary = MAX_LEN - totalNonSummaryLen;
  if (availableForSummary >= 140) {
    const truncated = summary.substring(0, availableForSummary - 3).trim() + "...";
    return `${header}${truncated}${optText}${footer}`;
  }
  
  // 3. Drop mentions, try again
  optText = getOptText(true, false, false);
  totalNonSummaryLen = header.length + optText.length + footer.length;
  availableForSummary = MAX_LEN - totalNonSummaryLen;
  if (availableForSummary >= 140) {
    const truncated = summary.substring(0, availableForSummary - 3).trim() + "...";
    return `${header}${truncated}${optText}${footer}`;
  }
  
  // 4. Drop CTA as well. Max space for header, summary and link
  optText = "";
  totalNonSummaryLen = header.length + footer.length;
  availableForSummary = MAX_LEN - totalNonSummaryLen;
  const truncated = summary.substring(0, Math.max(20, availableForSummary - 3)).trim() + "...";
  return `${header}${truncated}${footer}`;
}

// --- CONFIG & INITS ---

const app = express();
app.use(express.json());

// Debug log to see incoming requests on deployed environment
app.use((req, res, next) => {
  console.log(`[Sentinel API] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

const getSupabase = () => {
  const url = process.env.SUPABASE_URL || 'https://dpwkojtfeoxlpyevutfc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE';
  return createClient(url, key);
};

const getGeminiKey = () => process.env.VITE_USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

// --- HELPERS ---

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
    console.error("[Sentinel] Gemini Call Failed:", error);
    throw error;
  }
}

// --- API ROUTES ---

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'production',
    region: process.env.VERCEL_REGION || 'local'
  });
});

app.get(['/api/news', '/news'], async (req, res) => {
  const { data, error } = await getSupabase().from('news_articles').select('*').order('created_at', { ascending: false }).limit(30);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get(['/api/news/:id', '/news/:id'], async (req, res) => {
  const { data, error } = await getSupabase().from('news_articles').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- DYNAMIC METADATA SERVER-SIDE INJECTION FOR ARTICLES ---
app.get(['/article/:slugOrId', '/news/:slugOrId'], async (req, res) => {
  const { slugOrId } = req.params;
  const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const base = `${protocol}://${host}`;

  try {
    const supabase = getSupabase();
    
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
    console.error("Dynamic Metadata Handler Crashed:", err);
    // Serve index.html as a fallback safely
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

// --- CRON ROUTES ---

// Using a more flexible route pattern to ensure Vercel and direct calls both reach the handler
app.all(['/api/cron/fetch-news', '/cron/fetch-news', '/api/cron/fetch-news/'], async (req, res) => {
  try {
    const supabase = getSupabase();
    
    // DAILY LIMIT CHECK: Don't produce more than 3 articles per day total
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('news_articles')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', todayStart.toISOString());

    if (count !== null && count >= 3) {
      console.log(`[Sentinel] Daily limit reached (${count}/3). Skipping news generation.`);
      return res.json({ success: false, reason: "Daily limit of 3 articles reached" });
    }

    console.log(`[Sentinel] Starting fetch-news cron (Current day count: ${count || 0})...`);
    
    const searchPrompt = `Search for the top 3 most significant B2B SaaS, Enterprise AI, and Cloud Infrastructure news stories from the last 24 hours. 
    Strict Focus: Only include B2B Tech, Enterprise Software, SaaS Funding (Series A+), M&A, and AI infrastructure. 
    Exclude: Consumer gadget news, smartphones, gaming, or general retail. 
    Provide summaries.`;
    const rawNews = await callGemini(searchPrompt);

    const parsePrompt = `Extract news stories from this text: "${rawNews}". Return an array of objects: [{ "title": "...", "snippet": "..." }]. Ensure the titles are professional and specific.`;
    const storiesRaw = await callGemini(parsePrompt, true);
    const stories = JSON.parse(storiesRaw);

    if (stories && stories.length > 0) {
      // Process first high-quality story
      const story = stories[0];
      
      // EXPLICIT DUPLICATE CHECK
      const { data: existing } = await supabase
        .from('news_articles')
        .select('id')
        .ilike('title', `%${story.title.substring(0, 20)}%`)
        .limit(1);

      if (existing && existing.length > 0) {
        return res.json({ success: false, reason: "Similar article already exists in database", title: story.title });
      }

      const genPrompt = `Act as an Elite SaaS Analyst for Bloomberg. Write a detailed, institutional-grade intelligence report on: "${story.title}". 
      Context: "${story.snippet}". 
      Required JSON fields: 
      - title: professional headline
      - summary: 2-sentence summary
      - content: 150-200 words of analysis
      - category: One of (Funding, AI, Growth, M&A, or Strategy)
      - sentinel_take: Your unique strategic take
      - verdict: A 1-sentence strategic Outlook
      - breakdown: An array of exactly 4 strings, each being a specific revenue implication or strategic takeaway for a B2B audience.
      Tone: Sharp, professional, and strategic.`;
      
      const articleDataRaw = await callGemini(genPrompt, true);
      const articleData = JSON.parse(articleDataRaw);

      // Save to Supabase
      const { data: saved, error: saveError } = await supabase.from('news_articles').insert([{
        ...articleData,
        created_at: new Date().toISOString(),
        source: "SaaS Sentinel Intelligence",
        read_time: "4 min read"
      }]).select();

      if (saveError) {
        if (saveError.code === '23505') return res.json({ success: false, reason: "Article already exists" });
        throw saveError;
      }

      // Optimize and enrich the post text for engagement and views
      const boostResult = saved?.[0] ? getSocialBoost(saved[0].title, saved[0].summary, saved[0].category) : null;

      // Optional: Post to Threads
      if (process.env.THREADS_USER_ID && process.env.THREADS_ACCESS_TOKEN && saved?.[0]) {
        try {
          const article = saved[0];
          const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
          const protocol = req.headers['x-forwarded-proto'] || 'https';
          const base = `${protocol}://${host}`;
          
          const postText = buildThreadsPost(article.title, article.summary, article.id || '', article.category, base);

          await fetch(`https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads?media_type=TEXT&text=${encodeURIComponent(postText)}&access_token=${process.env.THREADS_ACCESS_TOKEN}`, { method: 'POST' });
        } catch (postErr) {
          console.error("Threads post error:", postErr);
        }
      }

      // Optional: Post to LinkedIn
      if (saved?.[0] && boostResult) {
        const liToken = process.env.LINKEDIN_ACCESS_TOKEN;
        const liUrn = process.env.LINKEDIN_PERSON_URN;
        
        if (liToken && liUrn) {
          try {
            const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const base = `${protocol}://${host}`;
            const article = saved[0];
            const sharingUrl = article.slug ? `${base}/article/${article.slug}` : `${base}/article/${article.id}`;
            
            let commentary = `📡 SaaS Sentiment Intelligence: ${article.title}\n\n${article.summary}\n\n💡 ${boostResult.cta}\n\nRead the full strategic analysis: ${sharingUrl}`;
            
            if (boostResult.mentions.length > 0) {
              commentary += `\n\nCc: ${boostResult.mentions.join(' ')}`;
            }
            if (boostResult.tags.length > 0) {
              commentary += `\n\n${boostResult.tags.join(' ')}`;
            }
            
            // Clean author URN
            let authorUrn = liUrn.trim();
            if (!authorUrn.startsWith("urn:li:")) {
              authorUrn = `urn:li:person:${authorUrn}`;
            }

            const requestBody = {
              author: authorUrn,
              lifecycleState: "PUBLISHED",
              specificContent: {
                "com.linkedin.ugc.ShareContent": {
                  shareCommentary: { text: commentary },
                  shareMediaCategory: "ARTICLE",
                  media: [{
                    status: "READY",
                    originalUrl: sharingUrl,
                    title: { text: article.title },
                    description: { text: (article.summary || "").substring(0, 200) }
                  }]
                }
              },
              visibility: {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
              }
            };

            const liRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${liToken}`,
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0"
              },
              body: JSON.stringify(requestBody)
            });

            if (liRes.ok) {
              console.log("💼 LinkedIn Post Successful");
            } else {
              const resText = await liRes.text();
              console.error("❌ LinkedIn error response:", resText);
            }
          } catch (liErr) {
            console.error("❌ LinkedIn posting exception:", liErr);
          }
        } else {
          console.log("ℹ️ LinkedIn config missing (LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_URN not set in environment). Skipping LinkedIn dispatch.");
        }
      }

      return res.json({ success: true, article: saved?.[0]?.title });
    }
    res.json({ success: false, reason: "No stories found" });
  } catch (err: any) {
    console.error("Fetch News Error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.all(['/api/cron/weekly-newsletter', '/cron/weekly-newsletter', '/api/cron/weekly-newsletter/'], async (req, res) => {
  try {
    const headerUrl = req.headers['x-supabase-url'] as string;
    const headerKey = (req.headers['x-supabase-service-role-key'] as string) || (req.headers['x-supabase-key'] as string);
    
    const dbUrl = headerUrl || process.env.SUPABASE_URL || 'https://dpwkojtfeoxlpyevutfc.supabase.co';
    const dbKey = headerKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE';
    
    const supabaseClient = createClient(dbUrl, dbKey);
    const { data: subscribers, error: subError } = await supabaseClient.from('subscribers').select('email');
    
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
      console.warn("[Sentinel Weekly Newsletter] No subscribers retrieved or query got blocked. Falling back to sending a testing preview to the verified owner: watungwadominic@gmail.com.");
      emails = ['watungwadominic@gmail.com'];
      isTestFallback = true;
    }

    const { data: checkTotal, error: checkErr } = await supabaseClient.from('subscribers').select('*', { count: 'exact', head: true });
    const actualDbCount = checkTotal === null ? 0 : (checkTotal || []).length || 0; // fallback tracking

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    let { data: articles } = await supabaseClient
      .from('news_articles')
      .select('title, summary')
      .gt('created_at', sevenDaysAgo.toISOString())
      .limit(5);
    
    if (!articles || articles.length === 0) {
      console.log("[Sentinel Weekly Newsletter] No articles found in last 7 days. Falling back to the 5 most recent articles.");
      const { data: recentArticles } = await supabaseClient
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

    const headerGeminiKey = req.headers['x-gemini-api-key'] as string;
    const prompt = `Create a high-end HTML newsletter for 'SaaS Sentinel'. Summarize these:\n${articles.map(a => `- ${a.title}: ${a.summary}`).join('\n')}`;
    const htmlRaw = await callGemini(prompt, false, headerGeminiKey);
    const html = htmlRaw.replace(/```html|```/g, '').trim();

    const headerSmtpUser = req.headers['x-gmail-user'] as string || req.headers['x-smtp-user'] as string;
    const headerSmtpPass = req.headers['x-gmail-pass'] as string || req.headers['x-smtp-pass'] as string;

    const smtpUser = headerSmtpUser || process.env.SMTP_USER || process.env.GMAIL_USER;
    const smtpPass = headerSmtpPass || process.env.SMTP_PASS || process.env.GMAIL_PASS;
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    
    let smtpCheck = "ok";
    const errors: string[] = [];
    
    if (!smtpUser || !smtpPass) {
      smtpCheck = "missing_credentials";
      errors.push(`SMTP environment variables are not configured in your hosting dashboard or passed in headers. Please set SMTP_USER and SMTP_PASS under environment variables or pass as headers.`);
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

app.get(['/api/proxy-image', '/proxy-image'], async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) return res.status(400).send("No URL");
  try {
    const response = await fetch(imageUrl, { headers: { 'User-Agent': 'SaaS-Sentinel/1.0' } });
    if (!response.ok) throw new Error();
    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(Buffer.from(buffer));
  } catch (e) {
    return res.redirect(imageUrl);
  }
});

// --- UTILS ---

app.get(['/sitemap.xml', '/api/sitemap.xml'], async (req, res) => {
  try {
    const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const base = `${protocol}://${host}`;
    
    const { data: articles, error } = await getSupabase()
      .from('news_articles')
      .select('id, slug, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    
    if (error) {
      console.error("Supabase sitemap query error:", error);
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    xml += `\n  <url><loc>${base}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`;
    xml += `\n  <url><loc>${base}/archive</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`;
    xml += `\n  <url><loc>${base}/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
    xml += `\n  <url><loc>${base}/privacy</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`;
    
    if (articles && Array.isArray(articles)) {
      articles.forEach(a => {
        const identifier = a.slug || a.id;
        if (identifier) {
          let mod = new Date().toISOString().split('T')[0];
          if (a.created_at && typeof a.created_at === 'string') {
            mod = a.created_at.split('T')[0];
          }
          xml += `\n  <url><loc>${base}/article/${identifier}</loc><lastmod>${mod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
        }
      });
    }
    
    xml += `\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml');
    return res.send(xml);
  } catch (err) {
    console.error("Global Sitemap Error:", err);
    res.setHeader('Content-Type', 'application/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>/</loc></url>\n</urlset>`);
  }
});

app.get(['/robots.txt', '/api/robots.txt'], (req, res) => {
  const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: https://${host}/sitemap.xml\n`);
});

// Catch-all for API to debug routing
app.use('/api', (req, res) => {
  res.status(404).json({
    error: "Sentinel Route Not Found",
    method: req.method,
    path: req.path,
    url: req.url,
    originalUrl: req.originalUrl
  });
});

export default app;
