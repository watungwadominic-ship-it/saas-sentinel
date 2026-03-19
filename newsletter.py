import os
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# SETUP KEYS (Matching your GitHub Secrets exactly)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_PASSWORD = os.environ.get("GMAIL_PASS")

def send_weekly_newsletter():
    print("🚀 Fetching subscribers...")
    # 1. Fetch Subscribers from Supabase
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        sub_response = requests.get(f"{SUPABASE_URL}/rest/v1/subscribers?select=email", headers=headers)
        emails = [row['email'] for row in sub_response.json()]
    except Exception as e:
        print(f"❌ Database Error: {e}")
        return
    
    if not emails:
        print("📭 No subscribers found in database.")
        return

    # 2. Fetch Latest Stories
    print("📰 Gathering latest SaaS news...")
    news_response = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?select=title,content&limit=3&order=created_at.desc", headers=headers)
    articles = news_response.json()
    
    # 3. Build Email Body (Liquid Glass Style)
    html_content = """
    <div style="font-family: sans-serif; background: #0f172a; color: white; padding: 20px; border-radius: 10px;">
        <h1 style="color: #38bdf8;">SaaS Sentinel Weekly Digest</h1>
        <p>Here is your intelligence brief for the week:</p>
        <hr style="border: 0.5px solid #334155;">
    """
    for art in articles:
        html_content += f"<h3 style='color: #f1f5f9;'>{art['title']}</h3><p style='color: #94a3b8;'>{art['content'][:250]}...</p><br>"
    
    html_content += "</div>"
    
    # 4. Send via Gmail SMTP
    try:
        print("📧 Connecting to Gmail SMTP...")
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(GMAIL_USER, GMAIL_PASSWORD)
        
        for email in emails:
            msg = MIMEMultipart()
            msg['From'] = f"SaaS Sentinel <{GMAIL_USER}>"
            msg['To'] = email
            msg['Subject'] = "Your Weekly SaaS Sentinel Update"
            msg.attach(MIMEText(html_content, 'html'))
            server.send_message(msg)
            print(f"✅ Email sent to: {email}")
            
        server.quit()
        print(f"🎉 SUCCESS: {len(emails)} updates delivered!")
    except Exception as e:
        print(f"❌ GMAIL FAILED: {e}")

if __name__ == "__main__":
    send_weekly_newsletter()
