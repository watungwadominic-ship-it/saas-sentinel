import os
import requests
from groq import Groq
from datetime import datetime, timedelta

# GitHub Secrets (Ensure these are set in your GitHub Repo Settings)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 Starting SaaS Sentinel Filtered Cycle...")
    
    # 1. Weekend Logic: Expand search if it's Saturday (5) or Sunday (6)
    now = datetime.now()
    is_weekend = now.weekday() >= 5
    days_to_look_back = 3 if is_weekend else 1
    
    if is_weekend:
        print(f"📅 Weekend Mode Active: Looking back {days_to_look_back} days.")
    else:
        print(f"📅 Standard Mode: Looking back {days_to_look_back} day.")
    
    start_date = (now - timedelta(days=days_to_look_back)).strftime('%Y-%m-%d')
    
    # 2. Refined Search Query for NewsAPI
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

    # 3. Fallback Logic: If no news is found, generate a Weekly Sentiment Analysis
    if not articles:
        print("⚠️ No fresh news found. Triggering Weekly Sentiment Fallback...")
        generate_sentiment_post()
        return

    # 4. Process the top 3 news items
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    for latest in articles[:3]:
        title = latest['title']
        
        # Duplicate Check: Ask Supabase if this title exists
        check_url = f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}&select=id"
        check_res = requests.get(check_url, headers=headers)
        
        if check_res.status_code == 200 and check_res.json():
            print(f"⏭️ Skipping duplicate: {title[:30]}...")
            continue

        print(f"✅ Processing New Story: {title}")
        
        # 5. AI Analysis via Groq (Llama 3.3)
        try:
            client = Groq(api_key=GROQ_API_KEY)
            # Instructing the AI to provide a clear summary and 3 bullet points
            prompt = (
                f"Act as a B2B SaaS Expert. Analyze this news: {title}. "
                f"Context: {latest['description']}. "
                "1. Write a professional market analysis focusing on enterprise impact. "
                "2. Provide exactly 3 short bullet points summarizing why this matters for founders."
            )
            
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}]
            )
            analysis_text = completion.choices[0].message.content
            
            # 6. Save to Supabase (Fixed for Array Column)
            payload = {
                "title": title,
                "content": analysis_text,
                # Sending as a list [] to satisfy the malformed array literal error
                "breakdown": [
                    "Strategic Impact Analysis", 
                    "Market Shift Detection", 
                    "Founder Action Item"
                ],
                "image_url": latest.get('urlToImage'),
                "source_url": latest.get('url'),
                "category": "Market Analysis"
            }
            
            res = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
            if res.status_code > 299:
                print(f"❌ Supabase Save Error: {res.text}")

        except Exception as e:
            print(f"❌ Error during AI Analysis: {e}")
            continue

    print("🎉 Cycle Complete.")

def generate_sentiment_post():
    """Fallback function to keep the feed fresh when NewsAPI is empty"""
    try:
        client = Groq(api_key=GROQ_API_KEY)
        prompt = (
            "Write a high-level Weekly Sentiment report on the state of SaaS and Enterprise AI. "
            "Summarize the general market mood, focus on B2B trends, "
            "and provide 3 short bullet points on the week's overall direction."
        )
        
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}]
        )
        sentiment_text = completion.choices[0].message.content
        
        headers = {
            "apikey": SUPABASE_KEY, 
            "Authorization": f"Bearer {SUPABASE_KEY}", 
            "Content-Type": "application/json"
        }
        
        payload = {
            "title": f"SaaS Sentinel: Weekly Market Sentiment ({datetime.now().strftime('%b %d')})",
            "content": sentiment_text,
            "breakdown": ["Market mood summary", "B2B Trend Tracking", "Weekly Outlook"],
            "category": "Weekly Sentiment",
            "image_url": "https://images.unsplash.com/photo-1551288049-bebda4e38f71"
        }
        requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
        print("📝 Sentiment Fallback Post Created.")
    except Exception as e:
        print(f"❌ Sentiment Fallback Failed: {e}")

if __name__ == "__main__":
    run_news_bot()
