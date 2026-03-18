import os
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# SETUP KEYS
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_PASSWORD = os.environ.get("GMAIL_PASSWORD")

def send_weekly_newsletter():
    # 1. Fetch Subscribers from Supabase
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    sub_response = requests.get(f"{SUPABASE_URL}/rest/v1/subscribers?select=email", headers=headers)
    emails = [row['email'] for row in sub_response.json()]
    
    if not emails:
        print("📭 No subscribers to mail.")
        return

    # 2. Fetch Latest Stories
    news_response = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?select=title,content&limit=3&order=created_at.desc", headers=headers)
    articles = news_response.json()
    
    # 3. Build Email Body
    html_content = "<h1>SaaS Sentinel Weekly Digest</h1>"
    for art in articles:
        html_content += f"<h3>{art['title']}</h3><p>{art['content'][:200]}...</p><hr>"
    
    # 4. Send via Gmail SMTP
    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(GMAIL_USER, GMAIL_PASSWORD)
        
        for email in emails:
            msg = MIMEMultipart()
            msg['From'] = f"SaaS Sentinel <{GMAIL_USER}>"
            msg['To'] = email
            msg['Subject'] = "Your Weekly SaaS Sentinel Update"
            msg.attach(MIMEText(html_content, 'html'))
            server.send_message(msg)
            
        server.quit()
        print(f"🎉 Sent to {len(emails)} subscribers via Gmail!")
    except Exception as e:
        print(f"❌ GMAIL FAILED: {e}")

if __name__ == "__main__":
    send_weekly_newsletter()
