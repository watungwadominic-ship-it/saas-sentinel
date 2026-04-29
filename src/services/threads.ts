
import { Article } from '../types';

export async function postToThreads(article: Article) {
  const userId = process.env.THREADS_USER_ID;
  const accessToken = process.env.THREADS_ACCESS_TOKEN;

  if (!userId || !accessToken) {
    console.warn('[THREADS] Credentials missing, skipping automated post.');
    return { success: false, error: 'Credentials missing' };
  }

  const text = `📢 INTELLIGENCE BRIEF: ${article.title}\n\n${article.summary}\n\nRead more: https://saas-sentinel.com/article/${article.id}\n\n#SaaS #AI #Intelligence`;

  try {
    // 1. Create a container
    const containerResponse = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads?media_type=TEXT&text=${encodeURIComponent(text)}&access_token=${accessToken}`,
      { method: 'POST' }
    );
    
    const containerData = await containerResponse.json();
    
    if (containerData.error) {
      throw new Error(containerData.error.message);
    }
    
    const creationId = containerData.id;

    // 2. Publish the container
    const publishResponse = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${creationId}&access_token=${accessToken}`,
      { method: 'POST' }
    );
    
    const publishData = await publishResponse.json();
    
    if (publishData.error) {
      throw new Error(publishData.error.message);
    }

    console.log('[THREADS] Successfully posted:', publishData.id);
    return { success: true, id: publishData.id };
  } catch (error: any) {
    console.error('[THREADS] Post failed:', error.message);
    return { success: false, error: error.message };
  }
}
