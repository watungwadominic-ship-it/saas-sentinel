import os
import requests
from datetime import datetime, timedelta

# Supabase configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def send_weekly_newsletter():
    print("🚀 SaaS Sentinel: Generating Premium Digest...")
    
    if not all([SUPABASE_URL, SUPABASE_KEY]):
        print("❌ Error: Supabase credentials missing.")
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

    # Fetch articles from the last 7 days
    now = datetime.now()
    last_week = (now - timedelta(days=7)).strftime('%Y-%m-%d')
    
    try:
        # Use published_at for filtering as it is explicitly saved by the bot
        url = f"{SUPABASE_URL}/rest/v1/news_articles?published_at=gte.{last_week}&order=published_at.desc"
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        articles = response.json()
        print(f"📡 Found {len(articles)} articles for the weekly digest.")
    except Exception as e:
        print(f"❌ Error fetching articles: {e}")
        return

    if not articles:
        print("⏭️ No new articles this week. Skipping newsletter.")
        return

    # Build the newsletter content
    newsletter_html = """
    <div style="font-family: 'Inter', sans-serif; background: #020617; color: #f8fafc; padding: 40px; border-radius: 20px;">
        <h1 style="color: #f08924; text-transform: uppercase; letter-spacing: 0.2em;">SaaS Sentinel: Weekly Intelligence</h1>
        <p style="color: #94a3b8;">High-precision analysis for the elite SaaS ecosystem.</p>
        <hr style="border: 1px solid #1e293b; margin: 30px 0;">
    """

    app_url = os.environ.get('SHARED_APP_URL', 'https://saas-sentinel.vercel.app').rstrip('/')

    for art in articles[:8]: # Increased to 8 articles for a richer weekly digest
        if not art or not isinstance(art, dict):
            continue
            
        title = art.get('title', 'Unknown Intelligence Report')
        content = art.get('content') or art.get('summary') or "Analysis pending."
        content_snippet = str(content)[:300] + "..." if len(str(content)) > 300 else str(content)
        
        # Use the same pathing logic as bot_engine.py
        article_id = art.get('id')
        article_url = f"{app_url}/news/v48/article/{article_id}/index.html" if article_id else app_url
        
        newsletter_html += f"""
        <div style="margin-bottom: 40px; background: rgba(30, 41, 59, 0.5); padding: 25px; border-radius: 15px; border: 1px solid #334155;">
            <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">{title}</h2>
            <p style="color: #94a3b8; line-height: 1.6; font-size: 14px;">{content_snippet}</p>
            <a href="{article_url}" style="color: #f08924; font-weight: bold; text-decoration: none; font-size: 14px;">Read Full Analysis →</a>
        </div>
        """

    newsletter_html += """
        <p style="text-align: center; color: #64748b; font-size: 12px; margin-top: 40px;">
            © 2026 SaaS Sentinel. All rights reserved. <br>
            You are receiving this because you subscribed to our elite market intelligence updates.
        </p>
    </div>
    """

    # In a real scenario, you would use an email API like Resend, SendGrid, etc.
    # For now, we simulate success or provide the HTML for logs.
    print("✅ Weekly Newsletter Generated Successfully.")
    # Here we could call an email provider API
    # requests.post("https://api.resend.com/emails", headers={"Authorization": "Bearer ..."}, json={...})

if __name__ == "__main__":
    send_weekly_newsletter()
