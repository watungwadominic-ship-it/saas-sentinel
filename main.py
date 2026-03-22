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
    print("🚀 SaaS Sentinel: Initiating Intelligence Cycle...")
    
    # 1. Date logic (Look back 2 days to ensure we find content)
    now = datetime.now()
    start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')

    # 2. NewsAPI Fetching
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
        print(f"❌ API Connection Error: {e}")
        return

    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Content-Type": "application/json"
    }

    # 3. Process Top 3 Articles
    for latest in articles[:3]:
        title = latest['title']
        
        # Duplicate check to avoid spamming the database
        check = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}", headers=headers)
        if check.status_code == 200 and check.json():
            print(f"⏭️ Skipping duplicate: {title[:30]}")
            continue

        print(f"🧠 Generating Intelligence for: {title}")
        
        try:
            client = Groq(api_key=GROQ_API_KEY)
            
            # THE FIX: Explicit JSON template in the prompt to prevent 400 errors
            prompt = (
                f"Analyze this SaaS news: {title}. Context: {latest['description']}. "
                "You are a Senior B2B SaaS Analyst. Respond ONLY in this exact JSON structure: "
                "{"
                "  \"analysis\": \"Insert a single professional paragraph here.\","
                "  \"points\": [\"Strategic takeaway 1\", \"Strategic takeaway 2\", \"Strategic takeaway 3\"]"
                "}"
                "Keep the analysis under 400 characters and make sure the 'points' are a simple list of strings."
            )
            
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            
            ai_data = json.loads(completion.choices[0].message.content)
            
            # Map the AI response to your Supabase Columns
            payload = {
                "title": title,
                "content": ai_data.get('analysis', "Analysis currently being refined."),
                "breakdown": ai_data.get('points', ["Market Shift", "Founder Opportunity", "Tech Integration"]),
                "image_url": latest.get('urlToImage'),
                "source_url": latest.get('url'),
                "category": "Market Intelligence"
            }
            
            res = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
            
            if res.status_code < 300:
                print(f"✅ Successfully posted: {title[:40]}...")
            else:
                print(f"❌ Supabase Save Error: {res.text}")

        except Exception as e:
            print(f"❌ Processing Error: {e}")
            continue

    print("🎉 SaaS Sentinel Update Complete.")

if __name__ == "__main__":
    run_news_bot()
