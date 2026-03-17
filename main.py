import os
import requests
from google import genai
from datetime import datetime, timedelta

# 1. SETUP KEYS
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 Starting SaaS Sentinel Super-Robust Run...")
    
    # Check if keys are missing
    if not all([SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY, NEWS_API_KEY]):
        print("❌ ERROR: One or more GitHub Secrets are missing!")
        return

    # 2. FETCH RAW NEWS (Using professional params to avoid URL typos)
    # We look for news from the last 7 days to ensure the table gets filled
    week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    
    news_params = {
        "q": "SaaS B2B startup",
        "from": week_ago,
        "sortBy": "publishedAt",
        "language": "en",
        "apiKey": NEWS_API_KEY
    }
    headers_news = {"User-Agent": "SaaSSentinelBot/1.0"}
    
    try:
        print("Connecting to NewsAPI.org...")
        response_news = requests.get("https://newsapi.org/v2/everything", params=news_params, headers=headers_news)
        response_news.raise_for_status() 
        raw_data = response_news.json()
    except Exception as e:
        print(f"❌ FAILED to reach news source: {e}")
        return

    articles = raw_data.get('articles', [])
    if not articles:
        print("⚠️ No articles found. Try broader keywords like 'AI Tech'.")
        return

    latest_story = articles[0]
    print(f"✅ Found story: {latest_story['title']}")
    
    # 3. ASK GEMINI TO ANALYZE
    try:
        print("Sending to Gemini AI for 2026 market analysis...")
        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = f"""
        Act as a Senior B2B Tech Analyst in March 2026. 
        Analyze this news: {latest_story['title']}
        Context: {latest_story['description']}
        
        Write a 400-word deep-dive. Include 'The News', 'The So What?', and 'Action Plan'.
        """
        
        response = client.models.generate_content(
            model="gemini-2.0-flash", 
            contents=prompt
        )
        article_content = response.text
        print("✅ AI Analysis Complete.")
    except Exception as e:
        print(f"❌ AI Analysis FAILED: {e}")
        return
    
    # 4. SAVE TO SUPABASE
    headers_db = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "title": latest_story['title'],
        "content": article_content,
        "category": "Market Intelligence",
        "source_url": latest_story['url']
    }
    
    try:
        db_url = f"{SUPABASE_URL}/rest/v1/news_articles"
        r = requests.post(db_url, headers=headers_db, json=payload)
        if r.status_code == 201:
            print("🎉 SUCCESS: News published to SaaS Sentinel!")
        else:
            print(f"⚠️ Database Error {r.status_code}: {r.text}")
    except Exception as e:
        print(f"❌ Database Save FAILED: {e}")

if __name__ == "__main__":
    run_news_bot()
