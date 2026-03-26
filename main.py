import os
import json
import requests
from groq import Groq
from datetime import datetime, timedelta
import random
import time

# 1. Configuration
# Ensure these are set in your environment or .env file
# GROQ_API_KEY: Get yours at https://console.groq.com/keys
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

# Social Media Credentials
LINKEDIN_ACCESS_TOKEN = os.environ.get("LINKEDIN_ACCESS_TOKEN")
LINKEDIN_PERSON_URN = os.environ.get("LINKEDIN_PERSON_URN")

def post_to_linkedin(text, title, url, image_url=None):
    if not all([LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_URN]):
        print("⏭️ Skipping LinkedIn: Credentials missing.")
        return
    try:
        # Clean token to remove any accidental whitespace/newlines
        clean_token = str(LINKEDIN_ACCESS_TOKEN).strip()
        headers = {
            "Authorization": f"Bearer {clean_token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0"
        }
        
        article_content = {
            "source": url,
            "title": title,
            "description": text[:200]
        }
        
        if image_url:
            article_content["thumbnail"] = image_url

        post_data = {
            "author": LINKEDIN_PERSON_URN,
            "commentary": text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": []
            },
            "content": {
                "article": article_content
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False
        }
        response = requests.post("https://api.linkedin.com/v2/posts", headers=headers, json=post_data)
        if response.status_code in [200, 201]:
            print("💼 LinkedIn Post Successful")
        else:
            print(f"❌ LinkedIn Error: {response.text}")
    except Exception as e:
        print(f"❌ LinkedIn Error: {e}")

def run_news_bot():
    print("🚀 SaaS Sentinel: Initiating Elite Market Intelligence Scan...")
    
    # Initialize Groq Client once
    if not GROQ_API_KEY:
        print("❌ Error: GROQ_API_KEY is not set.")
        return
    client = Groq(api_key=GROQ_API_KEY)

    now = datetime.now()
    # Fetch news from the last 2 days
    start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')

    # 2. Fetch News
    # Broad query for SaaS and Enterprise AI
    search_query = 'B2B SaaS OR "Enterprise AI" OR "SaaS Architecture" OR "Cloud Infrastructure"'
    params = {
        "q": search_query, 
        "from": start_date, 
        "language": "en", 
        "sortBy": "relevancy", 
        "apiKey": NEWS_API_KEY
    }
    
    try:
        response = requests.get("https://newsapi.org/v2/everything", params=params)
        response.raise_for_status()
        articles = response.json().get('articles', [])
        print(f"📡 Found {len(articles)} potential intelligence sources.")
    except Exception as e:
        print(f"❌ NewsAPI Error: {e}")
        return

    # Process top 5 articles to find the most relevant ones
    processed_count = 0
    for latest in articles[:10]:
        if processed_count >= 3: # Limit to 3 fresh insights per run
            break

        title = latest['title']
        if not title or "[Removed]" in title:
            continue
            
        # Duplicate Check
        headers = {
            "apikey": SUPABASE_KEY, 
            "Authorization": f"Bearer {SUPABASE_KEY}", 
            "Content-Type": "application/json"
        }
        
        try:
            check = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{requests.utils.quote(title)}", headers=headers)
            if check.status_code == 200 and check.json():
                print(f"⏭️ Skipping (Already Analyzed): {title[:40]}...")
                continue
        except Exception as e:
            print(f"⚠️ Duplicate check failed for: {title[:20]}")

        print(f"\n🧠 Deep Analyzing: {title}")
        
        ai_data = None
        # Retry logic for AI generation
        for attempt in range(3):
            try:
                completion = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    temperature=0.8, # High temperature for creative strategic insight
                    messages=[
                        {
                            "role": "system", 
                            "content": (
                                "You are a Senior SaaS Strategy Consultant and Market Analyst. "
                                "Your goal is to provide deep, contrarian, and technical insights that go beyond the surface-level news. "
                                "Focus on architectural shifts, competitive moats, and long-term market implications."
                            )
                        },
                        {
                            "role": "user", 
                            "content": (
                                f"News Item: {title}\n"
                                f"Description: {latest.get('description', 'No description available.')}\n\n"
                                "TASK:\n"
                                "1. feed_summary: A high-density, 100-word 'Executive Briefing'. Provide technical specifics and business implications.\n"
                                "2. strategic_analysis: 3 Detailed Paragraphs (separated by \\n\\n).\n"
                                "   - Paragraph 1: THE ARCHITECTURAL IMPACT. Technical stack and engineering nuances.\n"
                                "   - Paragraph 2: THE COMPETITIVE CHESSBOARD. Rivals and disruption.\n"
                                "   - Paragraph 3: THE 12-MONTH PROJECTION. Data-backed prediction.\n"
                                "3. impact: 'High', 'Medium', or 'Low'.\n"
                                "4. sentiment: 'BULLISH', 'BEARISH', or 'NEUTRAL'.\n\n"
                                "CRITICAL RULES:\n"
                                "- DO NOT repeat the news description.\n"
                                "- BE CONCISE but deep. Avoid fluff to prevent token limits.\n\n"
                                "JSON Structure:\n"
                                "{\n"
                                "  \"feed_summary\": \"...\",\n"
                                "  \"strategic_analysis\": \"...\",\n"
                                "  \"impact\": \"...\",\n"
                                "  \"sentiment\": \"...\"\n"
                                "}"
                            )
                        }
                    ],
                    response_format={"type": "json_object"}
                )
                
                ai_data = json.loads(completion.choices[0].message.content)
                break 
                
            except Exception as e:
                print(f"⚠️ AI Attempt {attempt+1} failed: {e}")
                time.sleep(2)
        
        if not ai_data:
            print(f"❌ Failed to generate AI analysis for: {title}")
            continue

        # Clean and format the analysis content
        raw_analysis = ai_data.get('strategic_analysis', "")
        if isinstance(raw_analysis, dict):
            # If the AI returns a dict instead of a string, join the values
            clean_analysis = "\n\n".join([str(v) for v in raw_analysis.values()])
        else:
            clean_analysis = str(raw_analysis)

        # 4. Save to Supabase
        # Mapping the AI fields to the database schema
        summary_text = str(ai_data.get('feed_summary', ""))
        image_url = latest.get('urlToImage') or "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1000"
        payload = {
            "title": title,
            "summary": summary_text,
            "analysis_content": clean_analysis.strip(), 
            "confidence_score": random.randint(95, 99),
            "strategic_impact": ai_data.get('impact', 'High'),
            "category": ai_data.get('sentiment', 'BULLISH'), 
            "image_url": image_url,
            "source_url": latest.get('url'),
            "published_at": latest.get('publishedAt') or datetime.now().isoformat()
        }
        
        try:
            # Change Prefer header to return representation so we get the ID
            save_headers = headers.copy()
            save_headers["Prefer"] = "return=representation"
            save_response = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=save_headers, json=payload)
            save_response.raise_for_status()
            saved_data = save_response.json()
            article_id = saved_data[0]['id'] if saved_data else None
            
            print(f"✅ Intelligence Logged: {title[:50]}...")
            
            # 5. Social Media Output
            # Construct the deep link to your site
            app_url = os.getenv("APP_URL", "https://saas-sentinel-cyan.vercel.app")
            article_url = f"{app_url}/?article={article_id}" if article_id else f"{app_url}/"
            
            display_summary = summary_text[:200] if summary_text else ""
            social_text = f"📡 SaaS Intelligence: {title}\n\n{display_summary}...\n\nRead more on SaaS Sentinel: {article_url}\n\n#SaaS #AI #MarketIntel"
            
            post_to_linkedin(social_text, title, article_url, image_url)

            processed_count += 1
        except Exception as e:
            print(f"❌ Supabase Save Error: {e}")

    print(f"\n✨ Scan Complete. {processed_count} new intelligence reports generated.")

if __name__ == "__main__":
    run_news_bot()
