import os
import requests
from groq import Groq
from datetime import datetime, timedelta

# 1. SETUP KEYS (Must match your GitHub Secrets exactly)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 Starting SaaS Sentinel Visual Bot...")
    
    # 2. FETCH RAW NEWS (Robust URL construction to prevent masking errors)
    week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    news_params = {
        "q": "SaaS B2B startup AI",
        "from": week_ago,
        "language": "en",
        "sortBy": "publishedAt",
        "apiKey": NEWS_API_KEY
    }
    headers_news = {"User-Agent": "SaaSSentinelBot/1.0"}
    
    try:
        response_news = requests.get("https://newsapi.org/v2/everything", params=news_params, headers=headers_news)
        response_news.raise_for_status() 
        raw_data = response_news.json()
    except Exception as e:
        print(f"❌ NEWS FETCH FAILED: {e}")
        return

    articles = raw_data.get('articles', [])
    if not articles:
        print("⚠️ No stories found for these keywords.")
        return

    # Pick the top story
    latest_story = articles[0]
    image_url = latest_story.get('urlToImage')
    print(f"✅ Found: {latest_story['title']}")
    
    # 3. ASK GROQ AI (Using the Llama 3.3 70B high-speed model)
    try:
        client = Groq(api_key=GROQ_API_KEY)
        # Using the standard 2026 Groq versatile model
        prompt = f"Act as a professional B2B SaaS Journalist. Analyze this news: {latest_story['title']}. Content: {latest_story['description']}. Write a deep-dive analysis."
        
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}]
        )
        article_content = completion.choices[0].message.content
    except Exception as e:
        print(f"❌ GROQ AI FAILED: {e}")
        return
    
    # 4. SAVE TO SUPABASE (Including image_url)
    headers_db = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    
    payload = {
        "title": latest_story['title'],
        "content": article_content,
        "category": "Market Analysis",
        "source_url": latest_story['url'],
        "image_url": image_url
    }
    
    try:
        r = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers_db, json=payload)
        if r.status_code in [200, 201]:
            print("🎉 SUCCESS: Article with image saved to Supabase!")
        else:
            print(f"⚠️ DB Error {r.status_code}: {r.text}")
            print("Check if you ran the ALTER TABLE command in Section 7.")
    except Exception as e:
        print(f"❌ DB SAVE FAILED: {e}")

if __name__ == "__main__":
    run_news_bot()
