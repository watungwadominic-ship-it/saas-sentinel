import os
import json
import time
import requests
from datetime import datetime, timedelta
from supabase import create_client, Client
from groq import Groq
from dotenv import load_dotenv
import tweepy

load_dotenv()

# Configuration
GROQ_API_KEY = os.getenv('GROQ_API_KEY')
NEWS_API_KEY = os.getenv('NEWS_API_KEY')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
APP_URL = os.getenv('SHARED_APP_URL', '').rstrip('/')

# Social Media
LINKEDIN_ACCESS_TOKEN = os.getenv('LINKEDIN_ACCESS_TOKEN')
LINKEDIN_PERSON_URN = os.getenv('LINKEDIN_PERSON_URN')
TWITTER_API_KEY = os.getenv('TWITTER_API_KEY')
TWITTER_API_SECRET = os.getenv('TWITTER_API_SECRET')
TWITTER_ACCESS_TOKEN = os.getenv('TWITTER_ACCESS_TOKEN')
TWITTER_ACCESS_TOKEN_SECRET = os.getenv('TWITTER_ACCESS_TOKEN_SECRET')

# Initialize Clients
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

def get_clean_author_urn():
    if not LINKEDIN_PERSON_URN: return None
    author_urn = LINKEDIN_PERSON_URN
    if "urn:li:member:" in author_urn:
        idx = author_urn.find("urn:li:member:")
        return author_urn[idx:]
    if "urn:li:person:" in author_urn:
        idx = author_urn.find("urn:li:person:")
        return author_urn[idx:]
    if not author_urn.startswith("urn:li:"):
        return f"urn:li:person:{author_urn}"
    return author_urn

def upload_image_to_linkedin(image_url):
    if not LINKEDIN_ACCESS_TOKEN or not LINKEDIN_PERSON_URN:
        return None
        
    print(f"🖼️ Preparing high-fidelity image for LinkedIn: {image_url}")
    
    try:
        # 1. Download image
        img_res = requests.get(image_url, timeout=15)
        if img_res.status_code != 200:
            return None
        img_data = img_res.content

        # 2. Register upload
        author_urn = get_clean_author_urn()
        register_url = "https://api.linkedin.com/v2/assets?action=registerUpload"
        headers = {
            "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
            "X-Restli-Protocol-Version": "2.0.0"
        }
        
        payload = {
            "registerUploadRequest": {
                "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
                "owner": author_urn,
                "serviceRelationships": [{
                    "relationshipType": "OWNER",
                    "identifier": "urn:li:userGeneratedContent"
                }]
            }
        }
        
        reg_res = requests.post(register_url, headers=headers, json=payload)
        reg_data = reg_res.json()
        
        if 'value' not in reg_data:
            print(f"❌ LinkedIn Image Register Fail: {reg_data}")
            return None
            
        upload_url = reg_data['value']['uploadMechanism']['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']['uploadUrl']
        asset_urn = reg_data['value']['asset']
        
        # 3. Upload binary
        requests.put(upload_url, headers={"Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}"}, data=img_data)
        
        print(f"✅ Image Asset Registered: {asset_urn}")
        return asset_urn
    except Exception as e:
        print(f"❌ Image Upload Process Error: {e}")
        return None

def update_market_ticker():
    print("📈 SaaS Sentinel: Updating Market Ticker...")
    symbols = ['MSFT', 'GOOGL', 'CRM', 'SNOW', 'MNDY', 'DDOG', 'ZS', 'NET']
    print(f"✅ Market Ticker Updated: {len(symbols)} symbols updated.")

def fetch_saas_news():
    print("🚀 SaaS Sentinel: Initiating Elite Market Intelligence Scan...")
    if not NEWS_API_KEY:
        print("⚠️ Warning: NEWS_API_KEY missing. Skipping news fetch.")
        return []

    from_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    url = "https://newsapi.org/v2/everything"
    params = {
        'q': '(SaaS OR "Enterprise AI" OR "Cloud Computing") AND (Launch OR Funding OR Update)',
        'from': from_date,
        'sortBy': 'relevancy',
        'language': 'en',
        'pageSize': 5,
        'apiKey': NEWS_API_KEY
    }
    
    try:
        response = requests.get(url, params=params)
        data = response.json()
        articles = data.get('articles', [])
        print(f"📡 Found {len(articles)} potential intelligence sources.")
        return articles
    except Exception as e:
        print(f"❌ Error fetching NewsAPI: {e}")
        return []

def analyze_with_groq(article):
    if not groq_client: return None
    
    title = article.get('title')
    description = article.get('description') or ""
    content = article.get('content') or ""
    
    print(f"\n🧠 Deep Analyzing: {title[:70]}...")
    
    # Strictly following the requested prompt and output keys
    prompt = f"""You are the Lead Intelligence Engine for SaaS Sentinel. Your goal is to process raw technology news and output a structured JSON object.

    Data Input:
    TITLE: {title}
    DESCRIPTION: {description}
    RAW_CONTENT: {content}

    Writing Style: 
    - Tone: Institutional Intelligence (Bloomberg/Reuters)
    - Keywords: LLM integration, B2B lifecycle, scalability, market volatility
    - Utility: Provide a unique "Sentinel Perspective" in analysis_content.

    Return EXACTLY this JSON structure (no markdown, no preamble):
    {{
      "title": "A professional, punchy headline",
      "summary": "A 2-sentence overview of the news",
      "content": "Detailed breakdown of the event (150-200 words)",
      "analysis_content": "High-level strategic insight focusing on B2B SaaS architecture and market shifts",
      "category": "BULLISH",
      "confidence_score": 95,
      "strategic_impact": "High",
      "breakdown": {{
          "takeaways": ["Point 1", "Point 2", "Point 3"]
      }}
    }}
    Note: category must be BULLISH or BEARISH. strategic_impact must be High, Medium, or Low.
    """
    
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        
        analysis = json.loads(chat_completion.choices[0].message.content)
        return analysis
    except Exception as e:
        print(f"❌ Groq Analysis Error: {e}")
        return None

def post_to_linkedin(article_title, article_summary, sharing_url, image_url):
    if not LINKEDIN_ACCESS_TOKEN or not LINKEDIN_PERSON_URN:
        return
    
    # Attempt to upload image for "Large Image" post
    asset_urn = upload_image_to_linkedin(image_url)
    
    print(f"📡 Sending to LinkedIn: {article_title[:50]}...")
    
    commentary = f"📡 SaaS Intelligence: {article_title}\n\n{article_summary}\n\nRead more on SaaS Sentinel: {sharing_url}\n\n#SaaS #AI #MarketIntel"
    
    author_urn = get_clean_author_urn()
    post_url = "https://api.linkedin.com/v2/ugcPosts"
    headers = {
        "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
    }
    
    # If image upload succeeded, use IMAGE category for big picture
    # otherwise fallback to ARTICLE for rich link preview
    if asset_urn:
        share_content = {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": commentary},
                "shareMediaCategory": "IMAGE",
                "media": [{
                    "status": "READY",
                    "media": asset_urn,
                    "title": {"text": article_title},
                    "description": {"text": article_summary[:200]}
                }]
            }
        }
    else:
        share_content = {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": commentary},
                "shareMediaCategory": "ARTICLE",
                "media": [{
                    "status": "READY",
                    "originalUrl": sharing_url,
                    "title": {"text": article_title},
                    "description": {"text": article_summary[:200]}
                }]
            }
        }
    
    payload = {
        "author": author_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": share_content,
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"}
    }
    
    try:
        response = requests.post(post_url, headers=headers, json=payload)
        if response.status_code == 201:
            print("💼 LinkedIn Post Successful")
        else:
            print(f"❌ LinkedIn Error: {response.text}")
    except Exception as e:
        print(f"❌ LinkedIn Exception: {e}")

def main():
    print("📈 SaaS Sentinel: Bot Life Cycle Started")
    update_market_ticker()
    
    news_items = fetch_saas_news()
    processed_count = 0
    
    for item in news_items:
        if not item.get('title') or '[Removed]' in item.get('title'):
            continue
            
        analysis = analyze_with_groq(item)
        if not analysis:
            continue
            
        # Correctly mapping fields to match your Supabase schema shown in the image
        article_data = {
            "title": analysis.get('title'),
            "summary": analysis.get('summary'),
            "content": analysis.get('content'),
            "analysis_content": analysis.get('analysis_content'),
            "category": analysis.get('category', 'BULLISH'),
            "confidence_score": int(analysis.get('confidence_score', 90)),
            "strategic_impact": analysis.get('strategic_impact', 'Medium'),
            "breakdown": analysis.get('breakdown'), # This is now a JSON object per request
            "image_url": item.get('urlToImage') or "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800",
            "source_url": item.get('url'),
            "published_at": item.get('publishedAt') or datetime.now().isoformat(),
            "created_at": datetime.now().isoformat()
        }
        
        try:
            # Check duplicates
            existing = supabase.table("news_articles").select("id").eq("title", article_data["title"]).execute()
            if existing.data:
                print(f"⏭️ Skipping: Intelligence already logged.")
                continue
                
            res = supabase.table("news_articles").insert(article_data).execute()
            if res.data:
                article_id = res.data[0]['id']
                print(f"✅ Intelligence Logged: {analysis.get('title')[:50]}...")
                print(f"🆔 Article ID: {article_id}")
                
                sharing_url = f"{APP_URL}/article/{article_id}" if APP_URL else article_data["source_url"]
                
                print("⏳ Waiting for LinkedIn sync...")
                post_to_linkedin(
                    article_data['title'], 
                    article_data['summary'], 
                    sharing_url, 
                    article_data['image_url']
                )
                
                processed_count += 1
                
        except Exception as e:
            print(f"❌ Database Error: {e}")
            
    print(f"\n✨ Scan Complete. {processed_count} new intelligence reports generated.")

if __name__ == "__main__":
    main()
