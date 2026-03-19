import os
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# SETUP KEYS
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_PASS = os.environ.get("GMAIL_PASS")
SITE_URL = "https://saas-sentinel-cyan.vercel.app" # <--- YOUR VERCEL URL

def send_weekly_newsletter():
    print("🚀 SaaS Sentinel: Generating Premium Digest...")
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    
    try:
        # 1. Fetch Subscribers
        sub_res = requests.get(f"{SUPABASE_URL}/rest/v1/subscribers?select=email", headers=headers)
        emails = [row['email'] for row in sub_res.json()]
        
        # 2. Fetch News (Limited to 3 for readability)
        news_res = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?select=title,content&limit=3&order=created_at.desc", headers=headers)
        articles = news_res.json()
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return

    if not emails:
        print("📭 No subscribers found.")
        return

    # 3. Build the "Liquid Glass" Email (No broken dots!)
    html_content = f"""
    <div style="font-family: 'Helvetica', sans-serif; background: #0f172a; color: #f1f5f9; padding: 40px; max-width: 600px; margin: auto; border-radius: 12px;">
        <h1 style="color: #38bdf8; text-align: center; margin-bottom: 10px;">SaaS Sentinel</h1>
        <p style="text-align: center; color: #94a3b8;">Your Weekly Intelligence Brief</p>
        <hr style="border: 0.5px solid #1e293b; margin: 30px 0;">
    """
    
    for art in articles:
        html_content += f"""
        <div style="margin-bottom: 40px;">
            <h2 style="color: #f8fafc; font-size: 20px;">{art['title']}</h2>
            <p style="color: #94a3b8; line-height: 1.6;">{art['content'][:280]}...</p>
            <a href="{SITE_URL}" style="display: inline-block; padding: 10px 20px; background: #38bdf8; color: #0f172a; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Read Full Analysis →</a>
        </div>
        """
    
    html_content += f"""
        <hr style="border: 0.5px solid #1e293b; margin: 30px 0;">
        <p style="text-align: center; font-size: 12px; color: #64748b;">
            You are receiving this because you subscribed to SaaS Sentinel Alpha.<br>
            Harare, Zimbabwe | AI-Powered Market Intelligence
        </p>
    </div>
    """

    # 4. Send via SMTP
    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(GMAIL_USER, GMAIL_PASS)
        
        for email in emails:
            msg = MIMEMultipart()
            msg['From'] = f"SaaS Sentinel <{GMAIL_USER}>"
            msg['To'] = email
            msg['Subject'] = "📈 SaaS Sentinel: This Week's Intelligence"
            msg.attach(MIMEText(html_content, 'html'))
            server.send_message(msg)
            print(f"✅ Delivered to: {email}")
            
        server.quit()
        print(f"🎉 SUCCESS: Sent to {len(emails)} subscribers!")
    except Exception as e:
        print(f"❌ GMAIL ERROR: {e}")

if __name__ == "__main__":
    send_weekly_newsletter()
