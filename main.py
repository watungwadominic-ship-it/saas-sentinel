import os
import json
import requests
from groq import Groq
from datetime import datetime, timedelta

# GitHub Secrets
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 Starting SaaS Sentinel Fast Intelligence Cycle...")
    
    # 1. Date Logic
    now = datetime.now()
    is_weekend = now.weekday() >= 5
    days_back = 3 if is_weekend else 1
    start_date = (now - timedelta(days=days_back)).strftime('%Y-%m-%d')
    
    print(f"📅 Mode: {'Weekend' if is_weekend else 'Standard'} ({days_back} days back)")

    # 2. NewsAPI Fetch
    search_query = 'B2B SaaS OR "Enterprise AI" OR "Cloud Computing"'
    news_params = {
        "q": search_query,
        "from": start_date,
        "language": "en",
        "sortBy": "relevancy",
        "apiKey": NEWS_API_KEY
    }
    
    try:
        response = requests.get("https://newsapi.org/v2/everything", params=news_params)
        articles = response.json().get('articles', [])
    except Exception as e:
        print(f"❌ NewsAPI Error: {e}")
        return

    if not articles:
        print("⚠️ No news found. Running Sentiment Fallback...")
        generate_sentiment_post()
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

    # 3. Process Top 3 Articles
    for latest in articles[:3]:
        title = latest['title']
        
        # Duplicate Check
        check_url = f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}&select=id"
        check_res = requests.get(check_url, headers=headers)
        if check_res.status_code == 200 and check_res.json():
            print(f"⏭️ Skipping duplicate: {title[:30]}...")
            continue

        print(f"🧠 Generating Intelligence for: {title}")
        
        try:
            client = Groq(api_key=GROQ_API_KEY)
            
            prompt = (
                f"Analyze this SaaS news: {title}. Context: {latest['description']}. "
                "You are a B2B SaaS Analyst. Respond ONLY in JSON format with: "
                "1. 'analysis': A 2-paragraph professional impact report. "
                "2. 'points': A list of exactly 3 specific, unique strategic takeaways for founders."
            )
            
            # Using the correct model ID for Groq
            completion = client.chat.completions.create(
                model="llama3-8b-8192", 
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"} 
            )
            
            ai_data = json.loads(completion.choices[0].message.content)
            
            payload = {
                "title": title,
                "content": ai_data.get('analysis', "Analysis currently being refined."),
                "breakdown": ai_data.get('points', ["Strategic Pivot", "Market Expansion", "Tech Integration"]),
                "image_url": latest.get('urlToImage'),
                "source_url": latest.get('url'),
                "category": "Market Analysis"
            }
            
            res = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
            if res.status_code > 299:
                print(f"❌ Supabase Error: {res.text}")
            else:
                print(f"✅ Successfully posted: {title[:40]}...")

        except Exception as e:
            print(f"❌ Processing Error: {e}")
            continue

    print("🎉 SaaS Sentinel Intelligence Update Complete.")

def generate_sentiment_post():
    """Fallback for empty news days"""
    try:
        client = Groq(api_key=GROQ_API_KEY)
        prompt = (
            "Generate a Weekly Sentiment Report for the SaaS market. "
            "Respond in JSON with 'analysis' (market mood) and 'points' (3 weekly trends)."
        )
        completion = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        ai_data = json.loads(completion.choices[0].message.content)
        
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
        payload = {
            "title": f"SaaS Sentinel: Weekly Market Sentiment ({datetime.now().strftime('%b %d')})",
            "content": ai_data.get('analysis'),
            "breakdown": ai_data.get('points'),
            "category": "Weekly Sentiment",
            "image_url": "https://images.unsplash.com/photo-1551288049-bebda4e38f71"
        }
        requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
        print("📝 Sentiment Post Created.")
    except Exception as e:
        print(f"❌ Fallback Failed: {e}")

if __name__ == "__main__":
    run_news_bot()
