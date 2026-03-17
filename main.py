import os
import requests
from google import genai

# 1. SETUP KEYS (GitHub Actions will provide these from 'Secrets')
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 Starting SaaS Sentinel Automated Run...")
    
    # 2. FETCH RAW NEWS
    # Added 'User-Agent' header to prevent 403 errors in 2026
    news_url = f"https://newsapi.org{NEWS_API_KEY}"
    headers_news = {"User-Agent": "SaaSSentinelBot/1.0"}
    
    try:
        print("Checking NewsAPI.org for tech updates...")
        response_news = requests.get(news_url, headers=headers_news)
        response_news.raise_for_status() 
        raw_data = response_news.json()
    except Exception as e:
        print(f"❌ FAILED to fetch news: {e}")
        return

    if not raw_data.get('articles'):
        print("No new news found today. Check your API key or search terms.")
        return

    latest_story = raw_data['articles'][0]
    print(f"✅ Found news: {latest_story['title']}")
    
    # 3. ASK GEMINI TO ANALYZE
    try:
        print("Sending to Gemini AI for professional analysis...")
        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = f"""
        Act as a Senior B2B Tech Analyst. Analyze this news headline and snippet:
        Headline: {latest_story['title']}
        Snippet: {latest_story['description']}
        
        Write a 400-word deep-dive analysis for SaaS founders. 
        Include 'The News', 'The So What?', 'Market Context', and an 'Action Plan'.
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
    print("Connecting to Supabase to publish...")
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
        print(f"Database Response Code: {r.status_code}")
        
        if r.status_code == 201:
            print("🎉 SUCCESS: Article published to SaaS Sentinel!")
        else:
            print(f"⚠️ Warning: Database returned error code {r.status_code}")
            print(f"Details: {r.text}")
    except Exception as e:
        print(f"❌ Database Save FAILED: {e}")

if __name__ == "__main__":
    run_news_bot()
