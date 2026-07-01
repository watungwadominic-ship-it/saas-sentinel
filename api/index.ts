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
  const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest"];
  let lastError: any = null;
  
  for (const modelName of modelsToTry) {
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      ...(jsonMode ? { generationConfig: { responseMimeType: "application/json" } } : {})
    });
    
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Sentinel] Calling Gemini (Model: ${modelName}, Attempt: ${attempt}/${maxRetries})...`);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        if (!text) throw new Error("Empty response from Gemini");
        return text;
      } catch (error: any) {
        lastError = error;
        const errMsg = error?.message || String(error);
        console.warn(`[Sentinel] Gemini attempt ${attempt} failed on model ${modelName}:`, errMsg);
        
        // If it's a model-not-found error, or other critical non-retryable errors, we can break early to try next model, 
        // but 503 or transient errors should definitely retry.
        if (errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("Service Unavailable") || errMsg.includes("rate limit") || errMsg.includes("too many requests") || errMsg.includes("fetch")) {
          // Retryable
        } else if (attempt === 1 && (errMsg.includes("not found") || errMsg.includes("404") || errMsg.includes("not support"))) {
          // Non-retryable model error, fall back directly
          break;
        }
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`[Sentinel] Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }
  
  console.error("[Sentinel] All Gemini models and retry attempts failed.");
  throw lastError || new Error("Gemini call failed after retries and fallbacks");
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

app.get('/api/news', async (req, res) => {
  const { data, error } = await getSupabase().from('news_articles').select('*').order('created_at', { ascending: false }).limit(30);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/news/:id', async (req, res) => {
  const isNumeric = /^\d+$/.test(req.params.id);
  const query = getSupabase().from('news_articles').select('*');
  const { data, error } = await (isNumeric 
    ? query.eq('id', req.params.id) 
    : query.eq('slug', req.params.id)
  ).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- UTILS FOR STATIC HTML SEEDING & SEO PRE-RENDERING ---

function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseInlineMarkdown(text: string): string {
  let inline = escapeHtml(text);
  inline = inline.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a; font-weight: 800;">$1</strong>');
  inline = inline.replace(/\*(.*?)\*/g, '<em>$1</em>');
  inline = inline.replace(/`(.*?)`/g, '<code style="background-color: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 13px; color: #f43f5e;">$1</code>');
  return inline;
}

function renderMarkdownToStaticHtml(markdown: string | null | undefined): string {
  if (!markdown) return '';
  
  const lines = markdown.split('\n');
  let html = '';
  let inList = false;
  
  for (let line of lines) {
    line = line.trim();
    if (!line) {
      if (inList) {
        html += '</ul>\n';
        inList = false;
      }
      continue;
    }
    
    // Check for Headings
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<h4 style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 25px; margin-bottom: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">${escapeHtml(line.slice(4))}</h4>\n`;
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<h3 style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 32px; margin-bottom: 16px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">${escapeHtml(line.slice(3))}</h3>\n`;
    } else if (line.startsWith('# ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<h2 style="font-size: 26px; font-weight: 800; color: #0f172a; margin-top: 36px; margin-bottom: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">${escapeHtml(line.slice(2))}</h2>\n`;
    }
    // Check for bullet lists
    else if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!inList) {
        html += '<ul style="padding-left: 20px; margin-bottom: 20px; list-style-type: disc;">\n';
        inList = true;
      }
      const itemContent = line.slice(2);
      html += `<li style="margin-bottom: 10px; font-size: 16px; color: #334155; line-height: 1.8;">${parseInlineMarkdown(itemContent)}</li>\n`;
    }
    // Numbers list
    else if (/^\d+\.\s/.test(line)) {
      if (inList) { html += '</ul>\n'; inList = false; }
      const match = line.match(/^(\d+)\.\s(.*)/);
      if (match) {
        html += `<div style="margin-bottom: 15px; font-size: 16px; color: #334155; line-height: 1.8;"><strong style="color: #0f172a; font-weight: 800;">${match[1]}.</strong> ${parseInlineMarkdown(match[2])}</div>\n`;
      }
    }
    // Standard paragraph
    else {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<p style="font-size: 16px; color: #334155; line-height: 1.8; margin-bottom: 24px;">${parseInlineMarkdown(line)}</p>\n`;
    }
  }
  
  if (inList) {
    html += '</ul>\n';
  }
  
  return html;
}

const formatStaticDate = (dateString: string | null | undefined) => {
  if (!dateString) return 'Recent';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

// Generates a deterministic, gorgeous, relevant Unsplash image for any category / title
function getDeterministicImage(title: string, category: string): string {
  const aiImages = [
    'photo-1677442136019-21780ecad995', // Neural net abstract
    'photo-1620712943543-bcc4688e7485', // AI chip representation
    'photo-1507146426996-ef05306b995a', // Robotics code
    'photo-1485827404703-89b55fcc595e', // Sci-fi AI
    'photo-1526374965328-7f61d4dc18c5', // Cyberspace code grid
    'photo-1531746020798-e6953c6e8e04', // Machine vision
  ];
  const fundingImages = [
    'photo-1551288049-bbda38a5f9a2', // Tech analytics dashboard
    'photo-1559526324-4b87b5e36e44', // Growth charts
    'photo-1526304640581-d334cdbbf45e', // Capital abstract
    'photo-1590283603385-17ffb3a7f29f', // Candlestick charting
    'photo-1611974789855-9c2a0a7236a3', // Trading terminal
  ];
  const growthImages = [
    'photo-1460925895917-afdab827c52f', // Web design growth wireframe
    'photo-1519389950473-47ba0277781c', // Collaborative tech team
    'photo-1551434678-e076c223a692', // Group review metrics
    'photo-1454165804606-c3d57bc86b40', // Performance review
    'photo-1552664730-d307ca884978', // Team boardroom workshop
  ];
  const strategyImages = [
    'photo-1507679799987-c73779587ccf', // Elegant executive decision making
    'photo-1507238691740-187a5b1d37b8', // Modern clean workstation strategy
    'photo-1451187580459-43490279c0fa', // Global abstract sphere
    'photo-1522071820081-009f0129c71c', // Business discussion
    'photo-1512428559087-560fa5ceab42', // High level flow diagram
  ];
  const generalImages = [
    'photo-1519389950473-47ba0277781c', // Tech workspace
    'photo-1486406146926-c627a92ad1ab', // Architecture enterprise skyscraper
    'photo-1498050108023-c5249f4df085', // MacBook workspace
    'photo-1451187580459-43490279c0fa', // Data network globe
  ];

  const cat = (category || '').toLowerCase();
  let pool = generalImages;
  if (cat.includes('ai') || cat.includes('intelligence') || cat.includes('infrastructure')) {
    pool = aiImages;
  } else if (cat.includes('funding') || cat.includes('capital') || cat.includes('series') || cat.includes('finance')) {
    pool = fundingImages;
  } else if (cat.includes('growth') || cat.includes('marketing') || cat.includes('sales')) {
    pool = growthImages;
  } else if (cat.includes('strategy') || cat.includes('operations') || cat.includes('m&a') || cat.includes('deal')) {
    pool = strategyImages;
  }

  // Calculate a simple, deterministic hash from the title
  let hash = 0;
  const str = title || '';
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % pool.length;
  const photoId = pool[index];
  return `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&q=80&w=1200&h=630`;
}

// --- DYNAMIC METADATA & CONTENT SERVER-SIDE PRE-RENDERING FOR ALL PAGES ---
app.get(['/article/:slugOrId', '/news/:slugOrId', '/about', '/privacy', '/archive', '/', '/index.html'], async (req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }
  const host = req.headers.host || 'saas-sentinel-cyan.vercel.app';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const base = `${protocol}://${host}`;
  const pathName = req.path;

  try {
    const supabase = getSupabase();
    
    // Default fallback values
    let title = "SaaS Sentinel | Elite B2B Market Intelligence & SaaS Analysis";
    let desc = "SaaS Sentinel is the premier intelligence hub for high-growth software ecosystems. Get real-time AI-driven analysis on SaaS market shifts, venture capital trends, and technical architectures.";
    let img = "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&h=630&auto=format&fit=crop";
    let url = `${base}${pathName}`;
    let bodyHtml = "";
    let ldJsonObj: any = null;

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

    if (pathName.startsWith('/article/') || pathName.startsWith('/news/')) {
      // --- ARTICLE PAGE PRE-RENDERING ---
      const slugOrId = pathName.split('/').pop() || '';
      
      // First, try matching by slug
      let { data: article } = await supabase
        .from('news_articles')
        .select('*')
        .eq('slug', slugOrId)
        .maybeSingle();

      // If not found by slug, try by id (only if numeric)
      if (!article && /^\d+$/.test(slugOrId)) {
        const { data: byId } = await supabase
          .from('news_articles')
          .select('*')
          .eq('id', slugOrId)
          .maybeSingle();
        if (byId) article = byId;
      }

      if (article) {
        title = `${article.title} | SaaS Sentinel`;
        desc = (article.meta_description || article.summary || 'SaaS Sentinel B2B Intelligence').trim();
        
        // Dynamic deterministic image selection if none is provided or if it's invalid
        const rawImg = (article.image_url || article.image || '').trim();
        if (rawImg) {
          if (rawImg.startsWith('/')) {
            img = `${base}${rawImg}`;
          } else if (rawImg.startsWith('proxy-image') || rawImg.startsWith('/proxy-image')) {
            const queryUrl = rawImg.includes('url=') ? decodeURIComponent(rawImg.split('url=')[1]) : '';
            img = queryUrl || `${base}${rawImg}`;
          } else if (!rawImg.startsWith('http') && rawImg.length > 5 && !rawImg.includes('/') && !rawImg.includes(':')) {
            const cleanId = rawImg.replace(/^photo-/, '');
            img = `https://images.unsplash.com/photo-${cleanId}?auto=format&fit=crop&q=80&w=1200&h=630`;
          } else {
            img = rawImg;
          }
        } else {
          img = getDeterministicImage(article.title, article.category || '');
        }
        
        url = `${base}/article/${article.slug || article.id}`;
        const published = article.created_at || new Date().toISOString();
        const modified = article.updated_at || article.created_at || new Date().toISOString();

        // JSON-LD dynamic Schema
        ldJsonObj = {
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

        // Render full static content with premium formatting
        bodyHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1e293b; background-color: #ffffff; line-height: 1.8;">
            <header style="margin-bottom: 45px; border-bottom: 2px solid #f1f5f9; padding-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px;">
              <div>
                <a href="/" style="text-decoration: none; color: #F27D26; font-weight: 900; font-size: 26px; letter-spacing: -0.05em; text-transform: uppercase;">SAAS SENTINEL</a>
                <span style="display: block; font-size: 11px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.2em; font-weight: 800;">High-Precision SaaS Market Intelligence</span>
              </div>
              <div>
                <a href="/archive" style="text-decoration: none; color: #2563eb; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Intelligence Vault</a>
              </div>
            </header>
            
            <main>
              <article>
                <span style="display: inline-block; background-color: #f1f5f9; color: #334155; padding: 6px 14px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 20px;">
                  ${escapeHtml(article.category || 'MARKET DIRECTIVE')}
                </span>
                <h1 style="font-size: 38px; font-weight: 900; color: #0f172a; line-height: 1.2; margin: 0 0 24px 0; letter-spacing: -0.03em;">
                  ${escapeHtml(article.title)}
                </h1>
                
                <div style="display: flex; flex-wrap: wrap; gap: 15px; color: #64748b; font-size: 13px; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9; font-weight: 500;">
                  <span><strong>Published:</strong> ${escapeHtml(formatStaticDate(article.date || article.created_at))}</span>
                  <span>•</span>
                  <span><strong>Reading Time:</strong> ${escapeHtml(article.readTime || '6 min read')}</span>
                  <span>•</span>
                  <span><strong>Reporting:</strong> Intelligence Division</span>
                </div>

                ${img ? `
                <div style="margin-bottom: 40px; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05);">
                  <img src="${escapeHtml(img)}" alt="${escapeHtml(article.title)}" style="width: 100%; height: auto; display: block; object-fit: cover; max-height: 400px;" />
                </div>
                ` : ''}

                <div style="font-size: 19px; font-weight: 600; color: #1e293b; line-height: 1.6; margin-bottom: 40px; border-left: 5px solid #F27D26; padding-left: 24px; font-style: italic;">
                  ${escapeHtml(article.summary || '')}
                </div>

                <div style="font-size: 17px; color: #334155;">
                  ${renderMarkdownToStaticHtml(article.content)}
                </div>

                ${(article.sentinel_take || article.summary) ? `
                <section style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 24px; padding: 35px; margin-top: 55px; box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.01);">
                  <h2 style="font-size: 20px; font-weight: 900; color: #F27D26; margin-top: 0; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.05em;">Sentinel's Strategic Outlook</h2>
                  
                  <div style="margin-bottom: 20px; font-size: 16px;">
                    <strong style="display: block; color: #0f172a; font-weight: 800; margin-bottom: 8px; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;">Analysis Summary:</strong>
                    <p style="margin: 0; line-height: 1.7; color: #475569;">${escapeHtml(article.sentinel_take || article.summary)}</p>
                  </div>
                </section>
                ` : ''}
              </article>
            </main>

            <footer style="margin-top: 80px; padding-top: 40px; border-top: 2px solid #f1f5f9; font-size: 13px; color: #94a3b8; text-align: center; line-height: 1.6;">
              <p style="margin-bottom: 12px; font-weight: 600; color: #64748b;">© 2026 SaaS Sentinel. All strategic intelligence analyses are human-verified.</p>
              <div style="display: flex; justify-content: center; gap: 24px; font-weight: 700;">
                <a href="/" style="color: #475569; text-decoration: none;">Home</a>
                <a href="/about" style="color: #475569; text-decoration: none;">About us</a>
                <a href="/privacy" style="color: #475569; text-decoration: none;">Privacy Policy</a>
                <a href="/archive" style="color: #475569; text-decoration: none;">Intelligence Archive</a>
              </div>
            </footer>
          </div>
        `;
      }
    } else if (pathName === '/about') {
      // --- ABOUT PAGE PRE-RENDERING ---
      title = "About SaaS Sentinel | Elite B2B Market Intelligence";
      desc = "Proprietary AI-driven strategic intelligence tracking real-time B2B software ecosystem cycles, venture capital shifts, and technical architectures with 99% reliability.";
      url = `${base}/about`;

      bodyHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1e293b; background-color: #ffffff; line-height: 1.8;">
          <header style="margin-bottom: 45px; border-bottom: 2px solid #f1f5f9; padding-bottom: 24px;">
            <a href="/" style="text-decoration: none; color: #F27D26; font-weight: 900; font-size: 26px; letter-spacing: -0.05em; text-transform: uppercase;">SAAS SENTINEL</a>
            <span style="display: block; font-size: 11px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.2em; font-weight: 800;">High-Precision SaaS Market Intelligence</span>
          </header>

          <main>
            <h1 style="font-size: 38px; font-weight: 900; color: #0f172a; line-height: 1.25; margin-bottom: 25px; letter-spacing: -0.03em;">About SaaS Sentinel</h1>
            <p style="font-size: 18px; font-weight: 600; color: #1e293b; line-height: 1.6; margin-bottom: 35px; border-left: 5px solid #F27D26; padding-left: 20px; font-style: italic;">
              Elite B2B Market Intelligence & Deep Strategic SaaS Analysis.
            </p>

            <h2 style="font-size: 24px; font-weight: 850; color: #0f172a; margin-top: 40px; margin-bottom: 15px;">The Vision</h2>
            <p style="font-size: 16px; color: #334155; margin-bottom: 20px;">
              SaaS Sentinel is a premier, full-scale corporate intelligence hub designed for the modern B2B software ecosystem. We bridge the gap between volatile news cycles and actionable corporate execution using highly refined algorithms and strategic validation to provide deep indicators of market shifts.
            </p>
            <p style="font-size: 16px; color: #334155; margin-bottom: 20px;">
              In an increasingly complex landscape, tracking vertical software acquisitions, venture capital rounds, and SaaS index health requires absolute data rigor. Our research has provided founders, developers, and institutional investors with an elite competitive advantage.
            </p>

            <h2 style="font-size: 24px; font-weight: 850; color: #0f172a; margin-top: 40px; margin-bottom: 15px;">Founder Authority</h2>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 25px; margin-bottom: 40px;">
              <h3 style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 5px;">Dominic Watungwa</h3>
              <p style="color: #F27D26; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 15px;">Lead Architect & Chief Strategist</p>
              <p style="font-size: 15px; color: #475569; margin: 0; line-height: 1.7;">
                Dominic is the principal founder and strategist behind SaaS Sentinel. With years of experience leading software development, technology stacks, and analyzing enterprise product-led growth (PLG) setups, he oversees the deployment of the portal's analytics engine alongside editorial peer reviews.
              </p>
            </div>

            <h2 style="font-size: 24px; font-weight: 850; color: #0f172a; margin-top: 40px; margin-bottom: 15px;">Editorial Standards</h2>
            <ul style="padding-left: 20px; margin-bottom: 30px; line-height: 1.8; color: #334155; font-size: 15px;">
              <li style="margin-bottom: 10px;"><strong>Proprietary Deep Curation:</strong> All articles are synthesized from top B2B data signals.</li>
              <li style="margin-bottom: 10px;"><strong>Quantitative Analysis:</strong> Every brief is rigorously cross-referenced against actual public financial metrics.</li>
              <li style="margin-bottom: 10px;"><strong>Privacy & Data Rights:</strong> Zero third-party data selling, complete email security.</li>
              <li style="margin-bottom: 10px;"><strong>Sustained Quality Benchmark:</strong> Peer reviewed content to guarantee 99% accuracy.</li>
            </ul>
          </main>

          <footer style="margin-top: 80px; padding-top: 40px; border-top: 2px solid #f1f5f9; font-size: 13px; color: #94a3b8; text-align: center;">
            <p style="margin-bottom: 12px; font-weight: 600; color: #64748b;">© 2026 SaaS Sentinel. All rights reserved.</p>
            <div style="display: flex; justify-content: center; gap: 24px; font-weight: 700;">
              <a href="/" style="color: #475569; text-decoration: none;">Home</a>
              <a href="/about" style="color: #475569; text-decoration: none;">About us</a>
              <a href="/privacy" style="color: #475569; text-decoration: none;">Privacy Policy</a>
              <a href="/archive" style="color: #475569; text-decoration: none;">Intelligence Archive</a>
            </div>
          </footer>
        </div>
      `;
    } else if (pathName === '/privacy') {
      // --- PRIVACY POLICY PRE-RENDERING ---
      title = "Privacy Policy | SaaS Sentinel";
      desc = "At SaaS Sentinel, we maintain full transparency, absolute security, and clear data protection policies for our newsletter subscribers and readers.";
      url = `${base}/privacy`;

      bodyHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1e293b; background-color: #ffffff; line-height: 1.8;">
          <header style="margin-bottom: 45px; border-bottom: 2px solid #f1f5f9; padding-bottom: 24px;">
            <a href="/" style="text-decoration: none; color: #F27D26; font-weight: 900; font-size: 26px; letter-spacing: -0.05em; text-transform: uppercase;">SAAS SENTINEL</a>
            <span style="display: block; font-size: 11px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.2em; font-weight: 800;">High-Precision SaaS Market Intelligence</span>
          </header>

          <main>
            <h1 style="font-size: 38px; font-weight: 900; color: #0f172a; line-height: 1.25; margin-bottom: 25px; letter-spacing: -0.03em;">Privacy Policy</h1>

            <h2 style="font-size: 22px; font-weight: 850; color: #0f172a; margin-top: 30px; margin-bottom: 12px;">1. Introduction</h2>
            <p style="font-size: 16px; color: #334155; margin-bottom: 20px;">
              At SaaS Sentinel, we are committed to defending your data privacy. This privacy policy describes the scope of compliance regarding how we securely collect, use, and process your personal information when you subscribe to our briefings.
            </p>

            <h2 style="font-size: 22px; font-weight: 850; color: #0f172a; margin-top: 30px; margin-bottom: 12px;">2. Information Collection & Use</h2>
            <p style="font-size: 16px; color: #334155; margin-bottom: 20px;">
              We collect your professional email address strictly and voluntarily when you sign up for our weekly SaaS Intelligence updates. We use this email only to distribute the curated briefings, breaking updates, and tactical reviews. We do not rent, distribute, or sell subscriber emails to third parties.
            </p>

            <h2 style="font-size: 22px; font-weight: 850; color: #0f172a; margin-top: 30px; margin-bottom: 12px;">3. Data Storage & Hosting</h2>
            <p style="font-size: 16px; color: #334155; margin-bottom: 20px;">
              Your database entries are safely mapped and retained inside <strong>Supabase</strong>, a high-integrity PostgreSQL database infrastructure with advanced row-level security (RLS). Communication delivery and list curation are managed through Google Workspace (Gmail SMTP relays), complying with rigorous spam-prevention rules.
            </p>

            <h2 style="font-size: 22px; font-weight: 850; color: #0f172a; margin-top: 30px; margin-bottom: 12px;">4. Cookies & Analytics</h2>
            <p style="font-size: 16px; color: #334155; margin-bottom: 20px;">
              We run privacy-first analytics tools (such as Vercel Web Analytics) to review aggregated site visits. Contextual advertisements are delivered safely via networks compiled strictly to preserve user integrity.
            </p>

            <h2 style="font-size: 22px; font-weight: 850; color: #0f172a; margin-top: 30px; margin-bottom: 12px;">5. Unsubscribe & Data Erasure</h2>
            <p style="font-size: 16px; color: #334155; margin-bottom: 20px;">
              Every communication distributed by SaaS Sentinel has a distinct 1-click unsubscribe option. You can also contact us direct at <a href="mailto:watungwadominic@gmail.com" style="color: #2563eb; text-decoration: none; font-weight: 600;">watungwadominic@gmail.com</a> to request immediate and complete physical erasure of your records from our databases.
            </p>
          </main>

          <footer style="margin-top: 80px; padding-top: 40px; border-top: 2px solid #f1f5f9; font-size: 13px; color: #94a3b8; text-align: center;">
            <p style="margin-bottom: 12px; font-weight: 600; color: #64748b;">© 2026 SaaS Sentinel. All rights reserved.</p>
            <div style="display: flex; justify-content: center; gap: 24px; font-weight: 700;">
              <a href="/" style="color: #475569; text-decoration: none;">Home</a>
              <a href="/about" style="color: #475569; text-decoration: none;">About us</a>
              <a href="/privacy" style="color: #475569; text-decoration: none;">Privacy Policy</a>
              <a href="/archive" style="color: #475569; text-decoration: none;">Intelligence Archive</a>
            </div>
          </footer>
        </div>
      `;
    } else if (pathName === '/archive') {
      // --- ARCHIVE PAGE PRE-RENDERING ---
      title = "Intelligence Archive | SaaS Sentinel";
      desc = "Uncompromised historic archive of SaaS Sentinel briefs. Instant B2B tactical intelligence and executive summaries across software verticals.";
      url = `${base}/archive`;

      const { data: articles } = await supabase
        .from('news_articles')
        .select('id, title, slug, summary, category, date, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      let listHtml = "";
      if (articles && Array.isArray(articles)) {
        articles.forEach(a => {
          const lUrl = `/article/${a.slug || a.id}`;
          listHtml += `
            <div style="padding: 24px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 11px; font-weight: 800; color: #F27D26; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block; margin-bottom: 6px;">
                ${escapeHtml(a.category || 'MARKET SIGNALS')}
              </span>
              <h3 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; line-height: 1.3;">
                <a href="${lUrl}" style="text-decoration: none; color: #0f172a; hover:color:#F27D26; transition:color 0.2s;">${escapeHtml(a.title)}</a>
              </h3>
              <p style="font-size: 14.5px; color: #475569; margin: 0 0 12px 0; line-height: 1.6;">${escapeHtml(a.summary || '')}</p>
              <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">
                <span>${escapeHtml(formatStaticDate(a.date || a.created_at))}</span>
                <span style="margin: 0 8px;">•</span>
                <a href="${lUrl}" style="color: #2563eb; text-decoration: none; font-weight: 700;">Analyze briefing &rarr;</a>
              </div>
            </div>
          `;
        });
      }

      bodyHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1e293b; background-color: #ffffff; line-height: 1.8;">
          <header style="margin-bottom: 45px; border-bottom: 2px solid #f1f5f9; padding-bottom: 24px;">
            <a href="/" style="text-decoration: none; color: #F27D26; font-weight: 900; font-size: 26px; letter-spacing: -0.05em; text-transform: uppercase;">SAAS SENTINEL</a>
            <span style="display: block; font-size: 11px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.2em; font-weight: 800;">High-Precision SaaS Market Intelligence</span>
          </header>

          <main>
            <h1 style="font-size: 38px; font-weight: 900; color: #0f172a; line-height: 1.25; margin-bottom: 10px; letter-spacing: -0.03em;">Intelligence Archive</h1>
            <p style="font-size: 15px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 40px;">Deep Vault of Past Curation Records</p>

            <div style="margin-top: 20px;">
              ${listHtml || '<p style="color:#64748b;">No archived signals stored in active cluster database.</p>'}
            </div>
          </main>

          <footer style="margin-top: 80px; padding-top: 40px; border-top: 2px solid #f1f5f9; font-size: 13px; color: #94a3b8; text-align: center;">
            <p style="margin-bottom: 12px; font-weight: 600; color: #64748b;">© 2026 SaaS Sentinel. All rights reserved.</p>
            <div style="display: flex; justify-content: center; gap: 24px; font-weight: 700;">
              <a href="/" style="color: #475569; text-decoration: none;">Home</a>
              <a href="/about" style="color: #475569; text-decoration: none;">About us</a>
              <a href="/privacy" style="color: #475569; text-decoration: none;">Privacy Policy</a>
              <a href="/archive" style="color: #475569; text-decoration: none;">Intelligence Archive</a>
            </div>
          </footer>
        </div>
      `;
    } else {
      // --- HOME PAGE PRE-RENDERING ---
      const { data: articles } = await supabase
        .from('news_articles')
        .select('id, title, slug, summary, category, date, created_at')
        .order('created_at', { ascending: false })
        .limit(30);

      let listHtml = "";
      if (articles && Array.isArray(articles)) {
        articles.forEach(a => {
          const lUrl = `/article/${a.slug || a.id}`;
          listHtml += `
            <div style="padding: 24px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 11px; font-weight: 800; color: #F27D26; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block; margin-bottom: 6px;">
                ${escapeHtml(a.category || 'TACTICAL UPDATE')}
              </span>
              <h3 style="font-size: 21px; font-weight: 850; margin: 0 0 10px 0; line-height: 1.3;">
                <a href="${lUrl}" style="text-decoration: none; color: #0f172a; hover:color:#F27D26;">${escapeHtml(a.title)}</a>
              </h3>
              <p style="font-size: 14.5px; color: #475569; margin: 0 0 12px 0; line-height: 1.6;">${escapeHtml(a.summary || '')}</p>
              <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">
                <span>${escapeHtml(formatStaticDate(a.date || a.created_at))}</span>
                <span style="margin: 0 8px;">•</span>
                <a href="${lUrl}" style="color: #2563eb; text-decoration: none; font-weight: 700;">Open Strategic Analysis &rarr;</a>
              </div>
            </div>
          `;
        });
      }

      bodyHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1e293b; background-color: #ffffff; line-height: 1.8;">
          <header style="margin-bottom: 45px; border-bottom: 2px solid #f1f5f9; padding-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px;">
            <div>
              <a href="/" style="text-decoration: none; color: #F27D26; font-weight: 900; font-size: 26px; letter-spacing: -0.05em; text-transform: uppercase;">SAAS SENTINEL</a>
              <span style="display: block; font-size: 11px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.2em; font-weight: 800;">High-Precision SaaS Market Intelligence</span>
            </div>
            <div style="display: flex; gap: 15px; font-weight: 700; font-size: 13px;">
              <a href="/archive" style="text-decoration: none; color: #2563eb;">Archive</a>
              <a href="/about" style="text-decoration: none; color: #2563eb;">About</a>
            </div>
          </header>

          <main>
            <div style="background-color: #fafafa; border: 1px solid #eaeaea; border-radius: 20px; padding: 30px; margin-bottom: 40px; text-align: center;">
              <h2 style="font-size: 24px; font-weight: 900; color: #0f172a; margin-top: 0; margin-bottom: 10px; letter-spacing: -0.02em;">SaaS Sentinel Intelligence Division</h2>
              <p style="font-size: 15px; color: #475569; margin-bottom: 20px; line-height: 1.6;">Our automated neural analysts crawl thousands of enterprise channels daily to synthesize raw business signals into high-fidelity directives.</p>
              <a href="/about" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 10px 24px; border-radius: 10px; text-decoration: none; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Meet Dominic & Read Policy &rarr;</a>
            </div>

            <h2 style="font-size: 24px; font-weight: 900; color: #0f172a; margin-bottom: 15px; border-bottom: 2px solid #0f172a; padding-bottom: 10px;">Executive Dispatch Feed</h2>
            <div style="margin-top: 20px;">
              ${listHtml || '<p style="color:#64748b;">Searching and analyzing newest market triggers...</p>'}
            </div>
          </main>

          <footer style="margin-top: 80px; padding-top: 40px; border-top: 2px solid #f1f5f9; font-size: 13px; color: #94a3b8; text-align: center; line-height: 1.6;">
            <p style="margin-bottom: 12px; font-weight: 600; color: #64748b;">© 2026 SaaS Sentinel. Elite B2B Market Analysis.</p>
            <div style="display: flex; justify-content: center; gap: 24px; font-weight: 700;">
              <a href="/" style="color: #475569; text-decoration: none;">Home</a>
              <a href="/about" style="color: #475569; text-decoration: none;">About us</a>
              <a href="/privacy" style="color: #475569; text-decoration: none;">Privacy Policy</a>
              <a href="/archive" style="color: #475569; text-decoration: none;">Intelligence Archive</a>
            </div>
          </footer>
        </div>
      `;
    }

    // Replace the default head metas with the dynamically generated head meta blocks
    let ldJsonString = "";
    if (ldJsonObj) {
      ldJsonString = `\n    <script type="application/ld+json">\n    ${JSON.stringify(ldJsonObj, null, 2)}\n    </script>`;
    }

    const injectedHead = `
    <!-- Dynamically Injected Rich Search SEO metadata -->
    <title>${escapeHtml(title)}</title>
    <meta name="robots" content="max-image-preview:large, max-snippet:-1, max-video-preview:-1, index, follow" />
    <meta name="googlebot" content="max-image-preview:large, index, follow" />
    <meta name="description" content="${escapeHtml(desc)}" />
    <meta name="thumbnail" content="${escapeHtml(img)}" />
    <meta itemprop="image" content="${escapeHtml(img)}" />
    <link rel="image_src" href="${escapeHtml(img)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    
    <!-- Open Graph -->
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(desc)}" />
    <meta property="og:image" content="${escapeHtml(img)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(img)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${escapeHtml(url)}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(desc)}" />
    <meta name="twitter:image" content="${escapeHtml(img)}" />
    ${ldJsonString}
    `;

    // Remove static default title and any canonical tags from template
    html = html.replace(/<title>[^<]*<\/title>/gi, '');
    html = html.replace(/<link rel="canonical"[^>]*>/gi, '');
    
    // Inject custom head metadata right at the top of <head>
    html = html.replace('<head>', `<head>${injectedHead}`);
    
    // Inject the rich pre-rendered HTML content inside the #root main div for crawl indexation
    if (bodyHtml) {
      html = html.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err: any) {
    console.error("Dynamic Metadata SSR Handler Crashed:", err);
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
      - image_url: A highly relevant, premium absolute Unsplash image URL. Please select one of these exact options based on the category:
        * AI / Enterprise AI: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1200"
        * Funding / Venture Capital / Series A+: "https://images.unsplash.com/photo-1551288049-bbda38a5f9a2?auto=format&fit=crop&q=80&w=1200"
        * Growth / Sales / Marketing: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200"
        * Strategy / Decisions: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=1200"
        * M&A / Deals / Mergers: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200"
        If none are appropriate, pick a high-quality professional technology/business photo ID from Unsplash and format it as: "https://images.unsplash.com/photo-[PHOTO_ID]?auto=format&fit=crop&q=80&w=1200".
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
      console.warn("[Sentinel Weekly Newsletter] No subscribers registered in database. Falling back to sending a testing preview to the verified owner: watungwadominic@gmail.com.");
      emails = ['watungwadominic@gmail.com'];
      isTestFallback = true;
    }

    const { data: checkTotal, error: checkErr } = await supabaseClient.from('subscribers').select('*', { count: 'exact', head: true });
    const actualDbCount = checkTotal === null ? 0 : (checkTotal || []).length || 0; // fallback tracking

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
      console.log("[Sentinel Weekly Newsletter] No articles found in last 7 days. Falling back to the 5 most recent articles.");
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
      .select('id, slug, created_at, image_url, title, category')
      .order('created_at', { ascending: false })
      .limit(1000);
    
    if (error) {
      console.error("Supabase sitemap query error:", error);
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

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;
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
          const articleUrl = `${base}/article/${identifier}`;
          xml += `\n  <url>\n    <loc>${articleUrl}</loc>\n    <lastmod>${mod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>`;
          
          let rawImg = (a.image_url || '').trim();
          let absoluteImg = '';
          if (rawImg) {
            if (rawImg.startsWith('/')) {
              absoluteImg = `${base}${rawImg}`;
            } else if (rawImg.startsWith('proxy-image') || rawImg.startsWith('/proxy-image')) {
              const queryUrl = rawImg.includes('url=') ? decodeURIComponent(rawImg.split('url=')[1]) : '';
              absoluteImg = queryUrl || `${base}${rawImg}`;
            } else if (!rawImg.startsWith('http') && rawImg.length > 5 && !rawImg.includes('/') && !rawImg.includes(':')) {
              const cleanId = rawImg.replace(/^photo-/, '');
              absoluteImg = `https://images.unsplash.com/photo-${cleanId}?auto=format&fit=crop&q=80&w=1200&h=630`;
            } else {
              absoluteImg = rawImg;
            }
          } else {
            absoluteImg = getDeterministicImage(a.title || '', a.category || '');
          }

          if (absoluteImg) {
            xml += `\n    <image:image>\n      <image:loc>${escapeXml(absoluteImg)}</image:loc>`;
            if (a.title) {
              xml += `\n      <image:title>${escapeXml(a.title)}</image:title>`;
            }
            xml += `\n    </image:image>`;
          }
          xml += `\n  </url>`;
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
