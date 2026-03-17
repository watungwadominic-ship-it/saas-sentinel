import os
import requests
from google import genai

# 1. SETUP KEYS
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("Starting SaaS Sentinel Bot...")
    
    # 2. FETCH NEWS (Adding User-Agent to prevent 403 blocks in 2026)
    news_url = f"https://newsapi.org{NEWS_API_KEY}"
    headers_news = {"User-Agent": "SaaSSentinelBot/1.0"}
    
    try:
        print("Connecting to NewsAPI.org...")
        response_news = requests.get(news_url, headers=headers_news)
        response_news.raise_for_status() 
        raw_data = response_news.json()
    except Exception as e:
        print(f"FAILED to fetch news. Error: {e}")
        return

    if not raw_data.get('articles'):
        print("No articles found today for those search terms.")
        return

    latest_story = raw_data['articles'][0]
    print(f"Analyzing story: {latest_story['title']}")
    
    # 3. ASK GEMINI TO ANALYZE
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = f"Act as a Senior B2B Tech Analyst. Analyze this headline: {latest_story['title']}. Content: {latest_story['description']}. Write a 400-word deep-dive."
        
        response_ai = client.models.generate_content(
            model="gemini-2.0-flash", 
            contents=prompt
        )
        content_text = response_ai.text
    except Exception as e:
        print(f"AI Analysis FAILED. Error: {e}")
        return
    
    # 4. SAVE TO SUPABASE
    headers_db = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "title": latest_story['title'],
        "content": content_text,
        "category": "Market intelligence",
        "source_url": latest_story['url']
    }
    
    try:
        r = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers_db, json=payload)
        print(f"Database Response Status: {r.status_code}")
        if r.status_code != 201:
            print(f"Database Error Details: {r.text}")
        else:
            print("SUCCESS: News article published to SaaS Sentinel!")
    except Exception as e:
        print(f"Database Save FAILED. Error: {e}")

if __name__ == "__main__":
    run_news_bot()

    
    r = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
    print(f"Status Code: {r.status_code} - News Successfully Published.")

if __name__ == "__main__":
    run_news_bot()
