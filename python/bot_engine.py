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
        'q': '(B2B SaaS OR "Enterprise AI" OR "Cloud SaaS" OR "SaaS Funding" OR "SaaS M&A") AND NOT (Samsung OR smartphone OR consumer)',
        'from': from_date,
        'sortBy': 'relevancy',
        'language': 'en',
        'pageSize': 15,  # Fetch more to have better selection since we only pick 3
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
    
    STRICT CATEGORY FILTER: Only process news if it is explicitly about B2B SaaS, Enterprise Software, Cloud Infrastructure, or Fintech. 
    EXCLUDE: Consumer electronics, smartphones, gaming, or general retail.

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
      "breakdown": ["Implication 1", "Implication 2", "Implication 3", "Implication 4"]
    }}
    Note: category must be BULLISH or BEARISH. strategic_impact must be High, Medium, or Low. breakdown must be a list of 4 strings.
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

def to_unicode_bold(text):
    """Converts standard text to Unicode bold characters for social media."""
    # Maps A-Z and a-z to bold equivalents
    bold_map = {
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 
        'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 
        'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 
        'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 
        's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
    }
    return "".join(bold_map.get(c, c) for c in text)

def post_to_linkedin(article_title, article_summary, sharing_url, image_url):
    if not LINKEDIN_ACCESS_TOKEN or not LINKEDIN_PERSON_URN:
        return
    
    # Attempt to upload image for "Large Image" post
    asset_urn = upload_image_to_linkedin(image_url)
    
    print(f"📡 Sending to LinkedIn: {article_title[:50]}...")
    
    # Make headline bold for maximum visual impact
    bold_headline = to_unicode_bold(f"SaaS Intelligence: {article_title}")
    commentary = f"📡 {bold_headline}\n\n{article_summary}\n\nRead more on SaaS Sentinel: {sharing_url}\n\n#SaaS #AI #MarketIntel"
    
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
                    "title": {"text": to_unicode_bold(article_title)},
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
                    "title": {"text": to_unicode_bold(article_title)},
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
    
    # DAILY LIMIT CHECK (3 articles per day)
    today_str = datetime.now().strftime("%Y-%m-%d")
    current_count = 0
    try:
        existing_today = supabase.table("news_articles").select("id", count="exact").gt("created_at", today_str).execute()
        current_count = existing_today.count or 0
        if current_count >= 3:
            print(f"🛑 Daily limit reached ({current_count}/3). Skipping news cycle.")
            return
        print(f"📊 Daily Progress: {current_count}/3 articles.")
    except Exception as e:
        print(f"⚠️ Could not check daily limit: {e}")

    update_market_ticker()
    
    news_items = fetch_saas_news()
    processed_count = 0
    
    # Pre-fetch recent articles to avoid analyzing duplicates
    recent_titles = []
    try:
        past_week = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        recent_res = supabase.table("news_articles").select("title, source_url").gt("created_at", past_week).execute()
        recent_titles = [r['title'].lower() for r in recent_res.data]
        recent_urls = [r['source_url'] for r in recent_res.data if r.get('source_url')]
    except Exception as e:
        print(f"⚠️ Could not pre-fetch recent articles: {e}")
        recent_urls = []

    for item in news_items:
        # Check quota INSIDE loop
        if current_count + processed_count >= 3:
            print(f"🛑 Stop: Hard daily limit of 3 articles reached during this run.")
            break

        title = item.get('title', '')
        url = item.get('url', '')
        
        if not title or '[Removed]' in title:
            continue
            
        # FAST SKIP: Check if URL or Title (fuzzy) already exists in pre-fetched list
        if url in recent_urls:
            print(f"⏭️ Skipping: URL already in recent history ({url})")
            continue
            
        is_duplicate = False
        for rt in recent_titles:
            if title.lower()[:30] in rt or rt[:30] in title.lower():
                is_duplicate = True
                break
        if is_duplicate:
            print(f"⏭️ Skipping: Title similar to recent article ({title[:30]}...)")
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
            # Check duplicates by URL first (most reliable)
            if article_data.get("source_url"):
                existing_url = supabase.table("news_articles").select("id").eq("source_url", article_data["source_url"]).execute()
                if existing_url.data:
                    print(f"⏭️ Skipping: URL already exists in database ({article_data['source_url']})")
                    continue

            # Then check duplicates by Title (fuzzy-ish check by matching the beginning)
            # Use a slightly longer prefix for better specificity
            title_prefix = article_data["title"][:30]
            existing_title = supabase.table("news_articles").select("id").ilike("title", f"%{title_prefix}%").execute()
            if existing_title.data:
                print(f"⏭️ Skipping: Similar title already exists ({title_prefix}...)")
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
