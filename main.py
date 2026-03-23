import os
import json
import requests
from groq import Groq
from datetime import datetime, timedelta
import random

# Environment Variables
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 SaaS Sentinel: Synchronizing Intelligence Radar...")
    
    now = datetime.now()
    start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')

    # Fetch fresh B2B SaaS News
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
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # Process top 3 fresh articles
    for latest in articles[:3]:
        title = latest['title']
        
        # Check for duplicates using title
        check = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}", headers=headers)
        if check.status_code == 200 and check.json():
            print(f"⏭️ Skipping (Exists): {title[:30]}")
            continue

        print(f"🧠 Generating Deep Analysis: {title}")
        
        try:
            client = Groq(api_key=GROQ_API_KEY)
            
            # The "Market Analyst" Prompt
            prompt = (
                f"Analyze this SaaS news: {title}. Context: {latest['description']}. "
                "Role: Senior B2B Strategic Analyst. "
                "Provide a punchy summary for a news feed AND a deep strategic analysis for executives. "
                "Respond ONLY in this JSON structure: "
                "{"
                "  \"feed_summary\": \"One short, bold sentence for the main feed.\","
                "  \"strategic_analysis\": \"Three substantial paragraphs explaining market impact, founder strategy, and competitive moats.\","
                "  \"impact_rating\": \"High, Medium, or Low\","
                "  \"confidence\": 95"
                "}"
            )
            
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            
            ai_data = json.loads(completion.choices[0].message.content)
            
            # Match the new website column names
            payload = {
                "title": title,
                "summary": ai_data.get('feed_summary'), 
                "analysis_content": ai_data.get('strategic_analysis'), # THE FIX: Analysis Column
                "confidence_score": ai_data.get('confidence', random.randint(94, 98)),
                "strategic_impact": ai_data.get('impact_rating', 'High'),
                "image_url": latest.get('urlToImage'),
                "source_url": latest.get('url'),
                "category": "Analysis" # Sets the tab correctly
            }
            
            res = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
            if res.status_code in [200, 201]:
                print(f"✅ Intelligence Synced: {title[:30]}...")
            else:
                print(f"⚠️ Supabase Error: {res.status_code} - {res.text}")

        except Exception as e:
            print(f"❌ Processing Error: {e}")
            continue

if __name__ == "__main__":
    run_news_bot()
