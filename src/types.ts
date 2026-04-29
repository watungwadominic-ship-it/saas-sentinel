export interface Article {
  id?: string;
  title: string;
  content: string;
  summary: string;
  category: string;
  date: string;
  readTime: string;
  source: string;
  image_url?: string;
  image?: string;
  // Analysis specific fields
  breakdown?: string[];
  sentinel_take?: string;
  verdict?: string;
}

export interface Subscriber {
  email: string;
  createdAt: string;
}
