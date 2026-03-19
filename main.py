import os
import requests
from groq import Groq
from datetime import datetime, timedelta

# GitHub Secrets
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 Starting SaaS Sentinel Filtered Cycle...")
    
    # 1. Fetch News with "Strict" B2B Filters
    # The minus (-) signs tell the API to EXCLUDE these topics
    search_query = 'B2B SaaS "enterprise AI" -restaurant -food -cooking -recipe'
    
    week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    news_params = {
        "q": search_query,
        "from": week_ago,
        "language": "en",
        "sortBy": "publishedAt",
        "apiKey": NEWS_API_KEY
    }
    
    try:
        response = requests.get("https://newsapi.org/v2/everything", params=news_params)
        articles = response.json().get('articles', [])
    except Exception as e:
        print(f"❌ NewsAPI Error: {e}")
        return

    if not articles:
        print("⚠️ No relevant SaaS news found.")
        return

    # Process the top 3 news items
    for latest in articles[:3]:
        title = latest['title']
        
        # 2. DUPLICATE CHECK: Ask Supabase if this title exists
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }
        
        check_url = f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}&select=id"
        check_res = requests.get(check_url, headers=headers)
        
        if check_res.json():
            print(f"⏭️ Skipping duplicate: {title[:30]}...")
            continue

        print(f"✅ Processing New Story: {title}")
        
        # 3. AI Analysis via Groq (Llama 3.3)
        try:
            client = Groq(api_key=GROQ_API_KEY)
            prompt = (
                f"Act as a B2B SaaS Expert. Analyze this news: {title}. "
                f"Context: {latest['description']}. Write a professional market analysis "
                "focusing on enterprise impact. Do not mention food or restaurants."
            )
            
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}]
            )
            article_analysis = completion.choices[0].message.content
        except Exception as e:
            print(f"❌ Groq AI Error: {e}")
            continue
        
        # 4. Save to Supabase
        payload = {
            "title": title,
            "content": article_analysis,
            "image_url": latest.get('urlToImage'),
            "source_url": latest.get('url'),
            "category": "Market Analysis"
        }
        
        requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)

    print("🎉 Cycle Complete.")

if __name__ == "__main__":
    run_news_bot()
