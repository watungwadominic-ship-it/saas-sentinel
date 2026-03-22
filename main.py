import os
import json
import requests
from groq import Groq
from datetime import datetime, timedelta

# Environment Variables
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 SaaS Sentinel: Initiating Intelligence Cycle...")
    
    # Date logic for fresh news
    now = datetime.now()
    start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')

    # Fetching raw news
    search_query = 'B2B SaaS OR "Enterprise AI" OR "Cloud Computing"'
    params = {"q": search_query, "from": start_date, "language": "en", "sortBy": "relevancy", "apiKey": NEWS_API_KEY}
    
    try:
        articles = requests.get("https://newsapi.org/v2/everything", params=params).json().get('articles', [])
    except: return

    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}

    for latest in articles[:3]:
        title = latest['title']
        
        # Duplicate check
        check = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}", headers=headers)
        if check.status_code == 200 and check.json(): continue

        print(f"🧠 Analyzing: {title}")
        
        try:
            client = Groq(api_key=GROQ_API_KEY)
            # STRICT PROMPT to prevent JSON formatting errors in the UI
            prompt = (
                f"Analyze this SaaS news: {title}. Context: {latest['description']}. "
                "Respond ONLY in JSON format with two keys: "
                "1. 'analysis': A 2-paragraph professional impact report (plain text). "
                "2. 'points': A simple list of exactly 3 concise strategic takeaways."
            )
            
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            
            ai_data = json.loads(completion.choices[0].message.content)
            
            payload = {
                "title": title,
                "content": ai_data.get('analysis'),
                "breakdown": ai_data.get('points'), # Clean array of strings
                "image_url": latest.get('urlToImage'),
                "source_url": latest.get('url'),
                "category": "Market Intelligence"
            }
            
            requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
            print(f"✅ Posted: {title[:30]}")
        except Exception as e: print(f"❌ Error: {e}")

if __name__ == "__main__":
    run_news_bot()
