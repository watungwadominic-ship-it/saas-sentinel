import os
import requests
from google import genai

# 1. SETUP KEYS (GitHub Actions will provide these from 'Secrets')
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    # 2. FETCH RAW NEWS
    # We target B2B SaaS and US-India corridor news specifically
    news_url = f"https://newsapi.org{NEWS_API_KEY}"
    raw_data = requests.get(news_url).json()
    
    if not raw_data.get('articles'):
        print("No new news found today.")
        return

    # Take the top story from the last 12 hours
    latest_story = raw_data['articles'][0]
    
    # 3. ASK GEMINI TO ANALYZE
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
    
    # 4. SAVE TO SUPABASE
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "title": latest_story['title'],
        "content": response.text,
        "category": "Market Intelligence",
        "source_url": latest_story['url']
    }
    
    r = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
    print(f"Status Code: {r.status_code} - News Successfully Published.")

if __name__ == "__main__":
    run_news_bot()
