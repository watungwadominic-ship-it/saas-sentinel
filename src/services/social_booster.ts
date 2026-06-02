/**
 * Dynamic Social Media Engagement Booster for SaaS Sentinel
 * Automatically maps entities and companies inside articles to their verified social handles
 * on Twitter/Threads/LinkedIn, and appends high-traffic hashtags and opinionated CTAs.
 */

const SOCIAL_MAPPINGS: Record<string, string> = {
  "microsoft": "@microsoft",
  "salesforce": "@salesforce",
  "openai": "@openai",
  "stripe": "@stripe",
  "google": "@google",
  "meta": "@meta",
  "apple": "@apple",
  "nvidia": "@nvidia",
  "figma": "@figma",
  "adobe": "@adobe",
  "hubspot": "@hubspot",
  "shopify": "@shopify",
  "slack": "@slack",
  "databricks": "@databricks",
  "snowflake": "@snowflake",
  "zoom": "@zoom",
  "canva": "@canva",
  "atlassian": "@atlassian",
  "gitlab": "@gitlab",
  "github": "@github",
  "notion": "@notion",
  "y combinator": "@ycombinator",
  "yc": "@ycombinator",
  "sam altman": "@sama",
  "elon musk": "@elonmusk",
  "zuckerberg": "@zuck",
  "anthropic": "@anthropic_co",
  "klarna": "@klarna",
  "vanta": "@vanta",
  "rippling": "@rippling",
  "clickup": "@clickup",
  "deel": "@deel",
  "gusto": "@gusto"
};

export interface SocialBoostResult {
  mentions: string[];
  tags: string[];
  cta: string;
}

export function getSocialBoost(title: string, summary: string, category?: string): SocialBoostResult {
  const searchText = `${title} ${summary}`.toLowerCase();
  const mentions: string[] = [];

  for (const [key, handle] of Object.entries(SOCIAL_MAPPINGS)) {
    if (searchText.includes(key)) {
      mentions.push(handle);
    }
  }

  // Deduplicate mentions
  const uniqueMentions = Array.from(new Set(mentions));

  // Determine targeted tags based on category
  const tags = ["#SaaS", "#B2B", "#Startups", "#SaaSSentinel"];
  if (category) {
    const cat = category.toLowerCase();
    if (cat.includes("ai") || cat.includes("artificial") || cat.includes("bullish")) {
      tags.push("#AI", "#GenerativeAI", "#Tech", "#LLMs");
    } else if (cat.includes("fund") || cat.includes("venture") || cat.includes("m&a")) {
      tags.push("#Funding", "#VentureCapital", "#VC", "#Investing", "#MAndA");
    } else if (cat.includes("growth") || cat.includes("market") || cat.includes("plg")) {
      tags.push("#PLG", "#GrowthHacking", "#Marketing", "#Sales");
    } else if (cat.includes("strategy") || cat.includes("product") || cat.includes("enterprise")) {
      tags.push("#BusinessStrategy", "#ProductManagement", "#Enterprise", "#Leadership");
    }
  }

  // Deduplicate tags
  const uniqueTags = Array.from(new Set(tags));

  // Engaging CTAs to drive replies and shares
  const ctas = [
    "How does this development align with your Q3 SaaS strategy?",
    "What’s your perspective on this strategic transition?",
    "A remarkable milestone in the B2B tech landscape. Thoughts?",
    "Essential reading for B2B executives and product builders.",
    "Our market analysis has the full breakdown. How are you adapting?"
  ];

  // Select a CTA deterministically
  const ctaIndex = title.length % ctas.length;
  const cta = ctas[ctaIndex];

  return {
    mentions: uniqueMentions,
    tags: uniqueTags,
    cta
  };
}

export function buildThreadsPost(
  title: string,
  summary: string,
  articleIdOrSlug: string,
  category?: string,
  originUrl?: string
): string {
  const MAX_LEN = 485; // safe character boundary for Threads (max 500)
  const shareId = articleIdOrSlug || '';
  const baseDomain = originUrl || 'https://saas-sentinel.com';
  const cleanBase = baseDomain.replace(/\/$/, "");
  
  const header = `📢 INTELLIGENCE BRIEF: ${title}\n\n`;
  const footer = `\n\n🔗 Read more: ${cleanBase}/article/${shareId}`;
  
  const boost = getSocialBoost(title, summary, category);
  let mentions = boost.mentions;
  let tags = boost.tags;
  let cta = boost.cta;
  
  if (mentions.length > 3) mentions = mentions.slice(0, 3);
  if (tags.length > 4) tags = tags.slice(0, 4);
  
  // Progressively build option text helper
  const getOptText = (incCta: boolean, incMentions: boolean, incTags: boolean): string => {
    let opt = "";
    if (incCta && cta) opt += `\n\n💡 ${cta}`;
    if (incMentions && mentions.length > 0) opt += `\n\nCc: ${mentions.join(' ')}`;
    if (incTags && tags.length > 0) opt += `\n\n${tags.join(' ')}`;
    return opt;
  };
  
  // Try with everything
  let optText = getOptText(true, true, true);
  let totalNonSummaryLen = header.length + optText.length + footer.length;
  
  if (totalNonSummaryLen + summary.length <= MAX_LEN) {
    return `${header}${summary}${optText}${footer}`;
  }
  
  // 1. Try with everything and truncate summary (minimum 140 chars for summary readability)
  let availableForSummary = MAX_LEN - totalNonSummaryLen;
  if (availableForSummary >= 140) {
    const truncated = summary.substring(0, availableForSummary - 3).trim() + "...";
    return `${header}${truncated}${optText}${footer}`;
  }
  
  // 2. Drop tags, try again
  optText = getOptText(true, true, false);
  totalNonSummaryLen = header.length + optText.length + footer.length;
  availableForSummary = MAX_LEN - totalNonSummaryLen;
  if (availableForSummary >= 140) {
    const truncated = summary.substring(0, availableForSummary - 3).trim() + "...";
    return `${header}${truncated}${optText}${footer}`;
  }
  
  // 3. Drop mentions, try again
  optText = getOptText(true, false, false);
  totalNonSummaryLen = header.length + optText.length + footer.length;
  availableForSummary = MAX_LEN - totalNonSummaryLen;
  if (availableForSummary >= 140) {
    const truncated = summary.substring(0, availableForSummary - 3).trim() + "...";
    return `${header}${truncated}${optText}${footer}`;
  }
  
  // 4. Drop CTA as well. Max space for header, summary and link
  optText = "";
  totalNonSummaryLen = header.length + footer.length;
  availableForSummary = MAX_LEN - totalNonSummaryLen;
  const truncated = summary.substring(0, Math.max(20, availableForSummary - 3)).trim() + "...";
  return `${header}${truncated}${footer}`;
}

