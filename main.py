import os
import requests
from groq import Groq
from datetime import datetime, timedelta

# 1. SETUP KEYS
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 Starting SaaS Sentinel Zero-Card Bot...")
    
    # 2. FETCH RAW NEWS
    week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    news_params = {
        "q": "SaaS B2B startup",
        "from": week_ago,
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
        print("⚠️ No stories found. Check your NewsAPI key.")
        return

    latest_story = articles[0]
    print(f"✅ Analyzing with Groq: {latest_story['title']}")
    
    # 3. ASK GROQ AI (No card required!)
    try:
        client = Groq(api_key=GROQ_API_KEY)
        prompt = f"Act as a B2B SaaS Analyst in March 2026. Deep-dive into this news: {latest_story['title']}. Content: {latest_story['description']}. Write a 400-word analysis with 'The News', 'The Context', and 'Market Impact'."
        
        # Using Llama 3.3 70B (Fast & Free on Groq)
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}]
        )
        article_content = completion.choices[0].message.content
        print("✅ Groq analysis successful.")
    except Exception as e:
        print(f"❌ GROQ AI FAILED: {e}")
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
        r = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers_db, json=payload)
        if r.status_code == 201:
            print("🎉 SUCCESS: Article published via Groq!")
        else:
            print(f"⚠️ DB Error {r.status_code}: {r.text}")
    except Exception as e:
        print(f"❌ DB SAVE FAILED: {e}")

if __name__ == "__main__":
    run_news_bot()
