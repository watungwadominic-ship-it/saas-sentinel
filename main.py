import os
import json
import requests
from groq import Groq
from datetime import datetime, timedelta

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 SaaS Sentinel: Syncing Radar and Deep Analysis...")
    
    now = datetime.now()
    start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')
    params = {"q": 'B2B SaaS OR "Enterprise AI"', "from": start_date, "language": "en", "apiKey": NEWS_API_KEY}
    
    try:
        articles = requests.get("https://newsapi.org/v2/everything", params=params).json().get('articles', [])
    except: return

    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}

    for latest in articles[:3]:
        title = latest['title']
        check = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}", headers=headers)
        if check.status_code == 200 and check.json(): continue

        try:
            client = Groq(api_key=GROQ_API_KEY)
            prompt = (
                f"Analyze: {title}. Context: {latest['description']}. "
                "Respond ONLY in this JSON structure: "
                "{"
                "  \"feed_summary\": \"One short, punchy sentence for the radar.\","
                "  \"deep_analysis\": \"Two full paragraphs of strategic market impact.\","
                "  \"points\": [\"Insight 1\", \"Insight 2\", \"Insight 3\"]"
                "}"
            )
            
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            
            ai_data = json.loads(completion.choices[0].message.content)
            
            payload = {
                "title": title,
                "summary": ai_data.get('feed_summary'), # For the Feed Tab
                "content": ai_data.get('deep_analysis'), # For the Analysis Tab
                "breakdown": ai_data.get('points'),
                "image_url": latest.get('urlToImage'),
                "source_url": latest.get('url'),
                "category": "Intelligence"
            }
            
            requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
            print(f"✅ Synced: {title[:30]}")
        except Exception as e: print(f"❌ Error: {e}")

if __name__ == "__main__":
    run_news_bot()
