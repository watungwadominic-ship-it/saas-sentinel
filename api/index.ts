import express from 'express';
import { supabase } from "../src/services/supabase";
import * as gemini from "../src/services/gemini";
import * as newsArticles from "../src/services/news_articles";

const app = express();

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    vercel: true,
    time: new Date().toISOString()
  });
});

app.get(["/robots.txt", "/api/robots.txt"], (req, res) => {
  const host = req.get('host') || 'saas-sentinel-cyan.vercel.app';
  const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  const base = `${protocol}://${host}`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
});

app.get(["/sitemap.xml", "/api/sitemap.xml"], async (req, res) => {
  try {
    const host = req.get('host') || 'saas-sentinel-cyan.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
    const base = `${protocol}://${host}`;
    
    const { data: articles } = await supabase
      .from("news_articles")
      .select("id, updated_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    sitemap += `\n  <url><loc>${base}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`;
    sitemap += `\n  <url><loc>${base}/archive</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`;

    if (articles) {
      articles.forEach((a: any) => {
        const mod = (a.updated_at || a.created_at || new Date().toISOString()).split('T')[0];
        sitemap += `\n  <url><loc>${base}/article/${a.id}</loc><lastmod>${mod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
      });
    }
    sitemap += `\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(sitemap);
  } catch (err) {
    console.error("Sitemap Generation Error:", err);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>/</loc></url>\n</urlset>`);
  }
});

// Proxy image to bypass CORS and prevent direct hotlinking crashes
app.get("/api/proxy-image", async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) return res.status(400).send("No URL");
  try {
    const response = await fetch(imageUrl, { headers: { 'User-Agent': 'SaaS-Sentinel-Bot/1.0' } });
    if (!response.ok) throw new Error();
    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(Buffer.from(buffer));
  } catch (e) {
    return res.redirect(imageUrl);
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("news_articles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
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

export default app;
