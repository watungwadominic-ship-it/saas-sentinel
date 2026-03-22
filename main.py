import os
import json
import requests
from groq import Groq
from datetime import datetime, timedelta

# Environment Variables from GitHub Secrets
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 SaaS Sentinel: Syncing Radar and Deep Analysis...")
    
    # Date logic for fresh content
    now = datetime.now()
    start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')

    # Fetch News
    search_query = 'B2B SaaS OR "Enterprise AI" OR "Cloud Computing"'
    params = {
        "q": search_query, 
        "from": start_date, 
        "language": "en", 
        "sortBy": "relevancy", 
        "apiKey": NEWS_API_KEY
    }
    
    try:
        response = requests.get("https://newsapi.org/v2/everything", params=params)
        articles = response.json().get('articles', [])
    except Exception as e:
        print(f"❌ NewsAPI Error: {e}")
        return

    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Content-Type": "application/json"
    }

    for latest in articles[:3]:
        title = latest['title']
        
        # Duplicate check
        check = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}", headers=headers)
        if check.status_code == 200 and check.json():
            print(f"⏭️ Skipping: {title[:30]}")
            continue

        print(f"🧠 Generating Intelligence: {title}")
        
        try:
            client = Groq(api_key=GROQ_API_KEY)
            
            # PROMPT: Differentiating between short summary and deep analysis
            prompt = (
                f"Analyze this SaaS news: {title}. Context: {latest['description']}. "
                "Role: Senior B2B SaaS Strategic Consultant. "
                "Respond ONLY in this JSON structure: "
                "{"
                "  \"radar_summary\": \"One punchy, 15-word maximum sentence for a quick-scan feed.\","
                "  \"deep_analysis\": \"Two substantial paragraphs explaining market impact and founder strategy.\","
                "  \"strategic_points\": [\"Insight 1\", \"Insight 2\", \"Insight 3\"]"
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
                "summary": ai_data.get('radar_summary'), 
                "content": ai_data.get('deep_analysis'),
                "breakdown": ai_data.get('strategic_points'),
                "image_url": latest.get('urlToImage'),
                "source_url": latest.get('url'),
                "category": "Market Intelligence"
            }
            
            res = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
            print(f"✅ Posted: {title[:30]}...")

        except Exception as e:
            print(f"❌ Processing Error: {e}")
            continue

if __name__ == "__main__":
    run_news_bot()
