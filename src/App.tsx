/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from './services/supabase';
import { Article } from './types';
import { generateArticle, fetchTopSaaSNews, parseNewsIntoStories } from './services/gemini';
import { fetchNewsArticles, saveNewsArticle, fetchArticleById } from './services/news_articles';
import { addSubscriber } from './services/subscribers';
import ReactMarkdown from 'react-markdown';
import { 
  Newspaper, 
  TrendingUp, 
  ChevronRight, 
  Loader2, 
  Plus, 
  LogOut, 
  User as UserIcon,
  AlertCircle,
  Flame,
  Activity,
  Home,
  Search,
  Shield,
  ShieldCheck,
  MapPin,
  Settings,
  Sun,
  Moon,
  Target,
  Users,
  Zap,
  Mail,
  Radio,
  Brain,
  Gem,
  Archive,
  Clock,
  ArrowUp,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const formatDate = (dateString: string | undefined) => {
  if (!dateString) return 'Recent';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString();
};

function MarketTicker() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStocks() {
      try {
        const { data, error } = await supabase
          .from('market_stocks')
          .select('*')
          .order('symbol', { ascending: true });
        
        if (error) throw error;
        
        if (Array.isArray(data) && data.length > 0) {
          // Deduplicate signals if the database has repeats due to failed clear-writes
          const uniqueData: any[] = [];
          const seen = new Set();
          data.forEach(item => {
            if (!seen.has(item.symbol)) {
              uniqueData.push(item);
              seen.add(item.symbol);
            }
          });
          
          setStocks(uniqueData);
          // Set last updated from the latest record
          const latest = uniqueData.reduce((prev, curr) => {
            if (!prev || !prev.last_updated) return curr;
            if (!curr || !curr.last_updated) return prev;
            return new Date(curr.last_updated) > new Date(prev.last_updated) ? curr : prev;
          }, data[0]);
          
          if (latest && latest.last_updated) {
            setLastUpdated(latest.last_updated);
          }
        } else {
          throw new Error("No ticker data found");
        }
      } catch (error) {
        console.error('Error fetching stocks:', error);
        // Fallback to requested sample data
        setStocks([
          { symbol: 'ADBE', price: 512.40, change: 1.2 },
          { symbol: 'CRM', price: 285.15, change: -0.4 },
          { symbol: 'MSFT', price: 415.10, change: 0.8 },
          { symbol: 'PLTR', price: 24.50, change: 2.1 },
          { symbol: 'NOW', price: 760.30, change: 0.5 },
        ]);
      }
    }
    fetchStocks();
  }, []);

  if (!Array.isArray(stocks) || stocks.length === 0) return null;

  return (
    <div className="relative w-full overflow-hidden group py-1" style={{ minHeight: '30px' }}>
      {/* Edge Fades */}
      <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[var(--color-ticker-bg)]/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[var(--color-ticker-bg)]/80 to-transparent z-10 pointer-events-none" />
      
      <div 
        className="flex animate-marquee-slower items-center py-1 hover:[animation-play-state:paused] active:[animation-play-state:paused] cursor-pointer whitespace-nowrap overflow-hidden"
      >
        {(Array.isArray(stocks) && stocks.length > 0 ? [...stocks, ...stocks, ...stocks, ...stocks] : []).slice(0, 100).map((stock, i) => {
          if (!stock || !stock.symbol) return null;
          const price = typeof stock.price === 'number' ? `$${stock.price.toFixed(2)}` : stock.price;
          const changeValue = typeof stock.change === 'number' ? stock.change : parseFloat(String(stock.change));
          const changeStr = typeof stock.change === 'number' ? `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(1)}%` : stock.change;
          const isPositive = typeof changeValue === 'number' ? changeValue >= 0 : String(changeStr).startsWith('+');

          return (
            <div 
              key={`${stock.symbol}-${i}`} 
              className="flex items-center gap-3 text-[10px] font-bold shrink-0 mx-8 transition-opacity hover:opacity-100 opacity-80 group-hover:opacity-70"
            >
              <span className="text-text font-black tracking-tight">{stock.symbol}</span>
              <span className="text-text/40 font-mono text-[9px]">{price}</span>
              <span className={isPositive ? 'text-accent' : 'text-rose-500'} style={{ color: isPositive ? undefined : '#f43f5e' }}>
                {changeStr}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LiquidGlassSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-32 w-full col-span-full">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-2 border-accent/10 rounded-full" />
        <motion.div 
          className="absolute inset-0 border-2 border-t-accent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
        <div className="absolute inset-4 bg-accent/5 backdrop-blur-xl rounded-full border border-white/10 flex items-center justify-center">
          <Activity className="w-6 h-6 text-accent animate-pulse" />
        </div>
      </div>
      <div className="mt-8 text-center">
        <p className="text-[10px] font-black text-text/60 uppercase tracking-[0.4em] mb-2 animate-pulse">
          Parsing Global SaaS Signals
        </p>
        <p className="text-[8px] text-text/30 font-bold uppercase tracking-widest">
          Establishing Secure Node Connection
        </p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass-card flex flex-col h-full overflow-hidden">
      <div className="aspect-video mb-6 bg-[#1e293b] animate-shimmer" />
      <div className="flex justify-between mb-4">
        <div className="w-16 h-3 bg-white/5 dark:bg-black/20 rounded-full animate-shimmer" />
        <div className="w-12 h-3 bg-white/5 dark:bg-black/20 rounded-full animate-shimmer" />
      </div>
      <div className="w-full h-8 bg-white/5 dark:bg-black/20 rounded-xl mb-4 animate-shimmer" />
      <div className="w-3/4 h-8 bg-white/5 dark:bg-black/20 rounded-xl mb-6 animate-shimmer" />
      <div className="space-y-3 mb-6">
        <div className="w-full h-3 bg-white/5 dark:bg-black/20 rounded-full animate-shimmer" />
        <div className="w-full h-3 bg-white/5 dark:bg-black/20 rounded-full animate-shimmer" />
        <div className="w-2/3 h-3 bg-white/5 dark:bg-black/20 rounded-full animate-shimmer" />
      </div>
      <div className="mt-auto pt-4 border-t border-white/5 flex justify-between">
        <div className="w-20 h-3 bg-white/5 dark:bg-black/20 rounded-full animate-shimmer" />
        <div className="w-16 h-3 bg-white/5 dark:bg-black/20 rounded-full animate-shimmer" />
      </div>
    </div>
  );
}


function AboutPage() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-[1200px] mx-auto py-12 px-4 md:px-8"
    >
      <div className="glass-panel p-8 md:p-16 rounded-[3rem] border-white/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5">
          <Brain className="w-64 h-64 text-accent" />
        </div>
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-8 mb-16 pb-12 border-b border-text/10">
            <div className="bg-accent p-6 rounded-[2rem] shadow-2xl shadow-accent/20">
              <Newspaper className="w-16 h-16 text-white" />
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-5xl md:text-7xl font-black text-text tracking-tighter mb-4">About SaaS Sentinel</h1>
              <p className="text-accent font-black text-sm uppercase tracking-[0.4em]">Elite B2B Market Intelligence & Strategic Analysis</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mb-24">
            <div className="lg:col-span-7 space-y-8">
              <section>
                <h2 className="text-3xl font-black text-text mb-6">The Vision</h2>
                <p className="text-xl text-text/70 leading-relaxed font-medium">
                  SaaS Sentinel is a premier intelligence hub designed for the modern B2B ecosystem. We bridge the gap between raw data and actionable strategy using proprietary AI-driven precision to track real-time market shifts.
                </p>
                <p className="text-lg text-text/60 leading-relaxed mt-4">
                  In an increasingly volatile market, identifying "Bullish" trends and "Bearish" pitfalls requires more than just headlines. Our platform provides high-fidelity signals that give founders, venture capitalists, and software engineers a distinct competitive advantage.
                </p>
              </section>

              <section>
                <h2 className="text-3xl font-black text-text mb-6">Founder Authority</h2>
                <div className="flex items-start gap-6 p-8 glass-panel rounded-[2rem] bg-accent/5 border-accent/10">
                  <div className="w-20 h-20 rounded-full bg-accent/20 shrink-0 flex items-center justify-center border border-accent/30 overflow-hidden shadow-xl">
                    <UserIcon className="w-10 h-10 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-text mb-2">Dominic Watungwa</h3>
                    <p className="text-accent font-bold text-xs uppercase tracking-widest mb-4">Lead Developer & Chief Strategist</p>
                    <p className="text-text/70 leading-relaxed">
                      Dominic is the architect behind SaaS Sentinel's proprietary analysis framework. With a deep background in software engineering and market dynamics, he ensures that every intelligence briefing meets the highest standards of technical and strategic rigor.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <aside className="lg:col-span-5 space-y-8">
              <div className="glass-panel p-8 rounded-[2.5rem] border-white/10 bg-white/5">
                <h3 className="text-xl font-black text-text mb-6 flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-emerald-500" />
                  Editorial Policy
                </h3>
                <p className="text-sm text-text/60 leading-relaxed mb-6">
                  Integrity is our primary asset. Every briefing published on SaaS Sentinel undergoes a rigorous multi-stage verification process:
                </p>
                <ul className="space-y-4">
                  {[
                    "AI-Driven Signal Validation",
                    "Cross-Reference against Financial Data",
                    "Human-Lead Strategic Peer Review",
                    "99% Reliability Benchmark"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-xs font-black text-text/80 uppercase tracking-widest">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="glass-panel p-8 rounded-[2.5rem] border-white/10 bg-white/5">
                <h3 className="text-xl font-black text-text mb-4">Core Values</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Accuracy', val: '100%' },
                    { label: 'Integrity', val: 'Absolute' },
                    { label: 'Privacy', val: 'Zero-Knowledge' },
                    { label: 'Impact', val: 'High' }
                  ].map((v, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/5">
                      <p className="text-[10px] font-black text-text/40 uppercase mb-1">{v.label}</p>
                      <p className="text-sm font-black text-accent tracking-widest uppercase">{v.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          <div className="text-center border-t border-text/10 pt-20 mb-20">
            <h2 className="text-[10px] font-black text-text/40 uppercase tracking-[0.5em] mb-8">Contact & Transparency</h2>
            <div className="max-w-2xl mx-auto space-y-6">
              <p className="text-lg text-text/60">
                We maintain an open-door policy for high-level inquiries, tips, and strategic partnerships.
              </p>
              <div className="inline-flex flex-col items-center gap-4">
                <a 
                  href="mailto:watungwadominic@gmail.com" 
                  className="px-12 py-6 bg-accent text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-accent/30 hover:scale-105 hover:bg-accent/90 transition-all active:scale-95 flex items-center gap-4"
                >
                  <Mail className="w-7 h-7" />
                  watungwadominic@gmail.com
                </a>
                <p className="text-[10px] font-bold text-text/30 uppercase tracking-[0.2em]">Official Strategic Inquiries Only</p>
              </div>
            </div>
          </div>

          {/* AdSense/Mediavine Footer Disclosures */}
          <footer className="mt-24 pt-12 border-t border-dotted border-text/15">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-[11px] leading-relaxed text-text/40 font-medium">
              <div>
                <h4 className="font-black text-text/60 uppercase tracking-widest mb-4">Ad Disclosure</h4>
                <p>
                  To sustain our high-fidelity intelligence operations, SaaS Sentinel may display contextual advertisements. This platform is optimized for AdSense and Mediavine networks. We prioritize your privacy and do not sell user data to third parties.
                </p>
              </div>
              <div>
                <h4 className="font-black text-text/60 uppercase tracking-widest mb-4">Legal Notice</h4>
                <p>
                  &copy; {new Date().getFullYear()} SaaS Sentinel by Dominic Watungwa. All strategic analysis is for informational purposes only and does not constitute financial advice. All briefings are human-verified for 99% reliability.
                </p>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </motion.div>
  );
}

function PrivacyPage() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto py-12 px-4"
    >
      <div className="glass-panel p-12 rounded-[3rem] bg-white/40 dark:bg-white/5 border border-white/20 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-10 h-10 text-accent" />
          <h1 className="text-4xl font-black text-text tracking-tight">Privacy Policy</h1>
        </div>
        
        <div className="prose prose-slate dark:prose-invert max-w-none text-text/80 space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-text mb-4">Introduction</h2>
            <p className="leading-relaxed">
              At SaaS Sentinel, we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website and subscribe to our newsletter.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text mb-4">Information We Collect</h2>
            <p className="leading-relaxed">
              We collect your email address when you voluntarily subscribe to our weekly intelligence newsletter. This information is used solely to provide you with market updates, deep-dives, and technical analysis related to the SaaS industry.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text mb-4">Data Storage and Processing</h2>
            <p className="leading-relaxed">
              Your data is stored securely using <strong>Supabase</strong>, a professional-grade database platform. We utilize <strong>Gmail</strong> (Google Workspace) as our primary service for sending newsletter communications. Both providers maintain high standards of data security and compliance.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text mb-4">Your Rights</h2>
            <p className="leading-relaxed">
              You have the right to access, correct, or delete your personal information at any time. Every newsletter we send includes an "Unsubscribe" link, or you can contact us directly to be removed from our list.
            </p>
          </section>

          <section className="pt-8 border-t border-text/10">
            <h2 className="text-2xl font-bold text-text mb-4">Contact Us</h2>
            <p className="leading-relaxed">
              If you have any questions or concerns about this Privacy Policy, please reach out to us:
            </p>
            <div className="mt-4 p-6 bg-accent/5 rounded-2xl border border-accent/10">
              <p className="font-bold text-text">Email:</p>
              <a href="mailto:watungwadominic@gmail.com" className="text-accent hover:underline font-medium">
                watungwadominic@gmail.com
              </a>
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}

function ArchivePage({ onSelect }: { onSelect: (article: Article) => void }) {
  const [archiveArticles, setArchiveArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const loadArchive = async () => {
      const data = await fetchNewsArticles([], 100); // Fetch up to 100 for archive
      setArchiveArticles(data);
      setLoading(false);
    };
    loadArchive();
  }, []);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const sortedArticles = [...archiveArticles].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-[1200px] mx-auto py-12 px-4 md:px-8"
    >
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-4">
          <div className="bg-accent/10 p-3 rounded-2xl border border-accent/20">
            <Archive className="w-8 h-8 text-accent" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-text tracking-tight text-center md:text-left">Digital Library</h1>
            <p className="text-text/40 font-bold text-sm uppercase tracking-widest mt-1 text-center md:text-left">Archive of SaaS Sentinel Intelligence</p>
          </div>
        </div>
        
        <div className="relative group">
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="glass-button !px-8 !py-3 !text-xs font-black uppercase tracking-widest appearance-none pr-12"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
          <ChevronRight className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-text/40 pointer-events-none" />
        </div>
      </div>

      <div className="space-y-4 md:space-y-6">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-panel p-8 rounded-3xl border border-white/10 animate-pulse">
              <div className="flex gap-6">
                <div className="w-32 h-32 bg-white/5 rounded-2xl" />
                <div className="flex-1 space-y-4">
                  <div className="h-4 bg-white/5 rounded w-1/4" />
                  <div className="h-8 bg-white/5 rounded w-3/4" />
                  <div className="h-4 bg-white/5 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))
        ) : (
          sortedArticles.map((article, i) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card !p-4 md:!p-8 cursor-pointer group hover:!bg-white/10 transition-all"
              onClick={() => onSelect(article)}
            >
              {/* Desktop View */}
              <div className="hidden md:flex gap-8 items-center">
                <div className="w-32 h-32 rounded-2xl overflow-hidden shrink-0">
                  <img 
                    src={article.image_url || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2426'} 
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest">{article.category}</span>
                    <div className="flex items-center gap-2 text-text/30">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px] font-bold">{formatDate(article.date)}</span>
                    </div>
                  </div>
                  <h3 className="text-xl font-black text-text mb-3 group-hover:text-accent transition-colors leading-tight">
                    {article.title}
                  </h3>
                  <p className="text-sm text-text/60 line-clamp-2 leading-relaxed italic">
                    "{article.summary}"
                  </p>
                </div>
                <div className="shrink-0">
                  <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-accent group-hover:border-accent transition-all duration-500">
                    <ChevronRight className="w-5 h-5 text-text" />
                  </div>
                </div>
              </div>

              {/* Mobile View (Slim Card) */}
              <div className="flex md:hidden items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[8px] font-bold text-accent uppercase tracking-widest">{article.category}</span>
                    <span className="text-[8px] text-text/30 font-bold">• {formatDate(article.date)}</span>
                  </div>
                  <h3 className="text-sm font-black text-text truncate group-hover:text-accent transition-colors">
                    {article.title}
                  </h3>
                </div>
                <ChevronRight className="w-4 h-4 text-text/20 shrink-0" />
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Back to Top Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-24 right-6 md:bottom-12 md:right-12 w-14 h-14 bg-accent text-white rounded-full shadow-2xl shadow-accent/30 flex items-center justify-center z-[100] hover:scale-110 active:scale-95 transition-transform"
          >
            <ArrowUp className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Sidebar({ 
  selectedArticle,
  setSelectedArticle, 
  setShowPrivacy, 
  setShowAbout, 
  setShowArchive,
  showAbout,
  showPrivacy,
  showArchive,
  isDarkMode,
  setIsDarkMode,
  user,
  handleLogout
}: any) {

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-72 bg-[var(--color-sidebar-bg)] dark:bg-black/50 backdrop-blur-2xl border-r border-white/10 z-[120] hidden lg:flex flex-col p-8 shadow-2xl">
      <div className="flex flex-col gap-4 mb-12">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); setShowArchive(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <div className="bg-accent p-2.5 rounded-xl shadow-lg shadow-accent/20">
            <Newspaper className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-[var(--color-sidebar-text)] uppercase">SaaS Sentinel</h1>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        <button 
          onClick={() => { setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); setShowArchive(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm ${!selectedArticle && !showAbout && !showPrivacy && !showArchive ? 'text-accent bg-accent/5' : 'text-[var(--color-sidebar-text)]/60 hover:bg-white/5 hover:text-[var(--color-sidebar-text)]'}`}
        >
          <Activity className="w-5 h-5" />
          Feed
        </button>
        <button 
          onClick={() => { setShowArchive(true); setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm ${showArchive ? 'text-accent bg-accent/5' : 'text-[var(--color-sidebar-text)]/60 hover:bg-white/5 hover:text-[var(--color-sidebar-text)]'}`}
        >
          <Archive className="w-5 h-5" />
          Archive
        </button>
        <button 
          onClick={() => { setShowAbout(true); setSelectedArticle(null); setShowPrivacy(false); setShowArchive(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm ${showAbout ? 'text-accent bg-accent/5' : 'text-[var(--color-sidebar-text)]/60 hover:bg-white/5 hover:text-[var(--color-sidebar-text)]'}`}
        >
          <Brain className="w-5 h-5" />
          About
        </button>
      </nav>

      <div className="pt-6 border-t border-white/5 space-y-4">
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl glass-button !justify-start font-bold text-sm"
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {isDarkMode ? 'Light Mode' : 'Dark Mode'}
        </button>

        {user ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-4 py-3 glass-panel !rounded-2xl">
              <div className="flex items-center gap-3">
                <img src={user?.user_metadata?.avatar_url || user?.user_metadata?.picture || ''} alt="" className="w-8 h-8 rounded-full border border-white/20" />
                <span className="text-xs font-bold truncate max-w-[100px]">{user?.user_metadata?.full_name || 'User'}</span>
              </div>
              <button onClick={handleLogout} className="text-text/40 hover:text-text transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => document.getElementById('newsletter-card')?.scrollIntoView({ behavior: 'smooth' })}
            className="w-full btn-accent flex items-center gap-3 px-4 py-3 !rounded-2xl font-bold text-sm"
          >
            <Mail className="w-5 h-5" />
            Subscribe
          </button>
        )}
      </div>
    </aside>
  );
}

const AnalysisImage = React.memo(({ src, alt, className = "", rounded = "rounded-[2.5rem]" }: { src?: string, alt: string, className?: string, rounded?: string }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fallbackImage = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2426'; // Tech Abstract

  // Use our proxy for all external images to bypass hotlink protection and AIS restrictions
  const getProxiedUrl = (url?: string) => {
    if (!url) return fallbackImage;
    // Unsplash handles IDs too, let's normalize
    let targetUrl = url;
    if (!url.startsWith('http') && url.length > 5 && !url.includes('.')) {
      targetUrl = `https://images.unsplash.com/photo-${url}?auto=format&fit=crop&q=80&w=1200`;
    }

    if (targetUrl.startsWith('/') || targetUrl.includes('localhost') || targetUrl.includes('supabase.co')) return targetUrl;
    
    return `/api/proxy-image?url=${encodeURIComponent(targetUrl)}`;
  };

  const imageUrl = error || !src ? fallbackImage : getProxiedUrl(src);

  return (
    <div className={`relative w-full aspect-video overflow-hidden bg-[#1e293b] ${rounded} border border-white/20 shadow-2xl ${className}`}>
      {loading && (
        <div className="absolute inset-0 z-10 animate-shimmer" />
      )}
      <img
        src={imageUrl}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-700 ${loading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setLoading(false)}
        onError={() => {
          console.warn(`[IMAGE-WARN] Failed to load resource, falling back: ${src}`);
          setError(true);
          setLoading(false);
        }}
        referrerPolicy="no-referrer"
      />
    </div>
  );
});

function SentinelAnalysisView({ article, onBack }: { article: Article, onBack: () => void }) {
  // Helper to parse breakdown points if they are JSON strings
  const parsePoint = (point: string) => {
    try {
      const parsed = JSON.parse(point);
      if (parsed.takeaway) return parsed.takeaway;
      if (parsed.point) return parsed.point;
      if (parsed.description) return parsed.description;
      return point;
    } catch (e) {
      return point;
    }
  };  const parseSentinelContent = (content: string | undefined) => {
    if (!content) return { main: '', verdict: '', take: '' };
    
    const verdictMarker = '**Strategic Verdict:**';
    const takeMarker = "**Sentinel's Take:**";
    
    let main = content;
    let verdict = "";
    let take = "";
    
    if (content.includes(verdictMarker)) {
      const parts = content.split(verdictMarker);
      main = parts[0].trim();
      const rest = parts[1].split(takeMarker);
      verdict = rest[0].trim();
      take = rest[1] ? rest[1].trim() : "";
    } else if (content.includes(takeMarker)) {
      const parts = content.split(takeMarker);
      main = parts[0].trim();
      take = parts[1].trim();
    }
    
    return { main, verdict, take };
  };

  const { main, verdict, take } = parseSentinelContent(article.content);
  
  const sentiment = (article.category || '').toUpperCase().includes('BULLISH') ? 'BULLISH' : 
                    (article.category || '').toUpperCase().includes('BEARISH') ? 'BEARISH' : 'NEUTRAL';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-[1240px] mx-auto pb-20 px-4 md:px-8"
    >
      {/* Navigation */}
      <button 
        onClick={onBack}
        className="group inline-flex items-center gap-2 mb-8 text-text/40 font-black text-[10px] uppercase tracking-[0.2em] hover:text-accent transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-accent/50 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
        </div>
        Back to intelligence
      </button>

      {/* Hero Image */}
      <div className="mb-12">
        <AnalysisImage 
          src={article.image_url} 
          alt={article.title} 
          className="aspect-[21/9] rounded-[2rem] border-white/10 shadow-2xl"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8 xl:gap-12 items-start">
        {/* Main Column */}
        <div className="space-y-8 md:space-y-12">
          {/* Header Section */}
          <div className="space-y-6 md:space-y-8">
            <div className="flex items-center gap-2 md:gap-3">
              <span className="bg-[#F27D26] text-white text-[8px] md:text-[9px] font-black px-4 py-1.5 rounded-lg uppercase tracking-[0.2em] shadow-lg shadow-[#F27D26]/20">
                Strategic Brief
              </span>
              <span className="bg-white/5 text-text/40 text-[8px] md:text-[9px] font-black px-4 py-1.5 rounded-lg uppercase tracking-[0.3em] border border-white/10 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                {article.readTime || '8 MIN READ'}
              </span>
            </div>
            
            <h1 className="text-3xl md:text-5xl xl:text-6xl font-black leading-[1.05] text-text tracking-tight max-w-full xl:max-w-[95%]">
              {article.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 md:gap-6 pt-6 border-t border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <UserIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-text/40" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-text leading-none mb-1">Intelligence Division</span>
                  <span className="text-[8px] md:text-[9px] font-bold text-text/30 leading-none">{formatDate(article.date)}</span>
                </div>
              </div>
              <div className="w-px h-6 md:h-8 bg-white/5 hidden sm:block" />
              <a 
                href={article.source || '#'} 
                target="_blank" 
                rel="no-referrer"
                className="text-[#F27D26] text-[9px] md:text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                Original Source <ChevronRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Core Analysis Section */}
          <section className="space-y-6 md:space-y-8">
             <div className="flex items-center gap-4 mb-2">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[9px] md:text-[10px] font-black text-text/20 uppercase tracking-[0.4em]">Dispatch Analysis</span>
                <div className="h-px flex-1 bg-white/10" />
             </div>
             
             <div className="prose prose-invert prose-p:text-text/70 prose-p:leading-[1.7] md:prose-p:leading-[1.8] prose-p:text-base md:prose-p:text-lg max-w-none">
                {main.split('\n\n').map((para, i) => (
                  <p key={i} className={i === 0 ? "text-lg md:text-xl xl:text-2xl text-text font-bold leading-tight md:leading-relaxed mb-6 md:mb-8" : ""}>
                    {para}
                  </p>
                ))}
             </div>
          </section>

          {/* Sentinel's Take Card */}
          <section>
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#F27D26]/20 to-transparent blur-2xl opacity-50 group-hover:opacity-75 transition-opacity" />
              
              <div className="relative glass-panel !bg-[#0D0D15] rounded-[2rem] md:rounded-[3rem] p-8 md:p-14 border-[#F27D26]/20 overflow-hidden min-h-[auto] md:min-h-[300px] flex flex-col justify-center">
                <div className="absolute -right-20 -top-20 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity hidden md:block">
                  <Brain className="w-[300px] md:w-[400px] h-[300px] md:h-[400px] text-white" />
                </div>
                
                <div className="relative z-10 space-y-6 md:space-y-8">
                  <div className="flex items-center gap-3 text-[9px] md:text-[10px] font-black text-[#F27D26] uppercase tracking-[0.4em]">
                    <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    Sentinel's Take
                  </div>
                  
                  <div className="text-lg md:text-xl xl:text-2xl font-black text-text/95 leading-[1.5] md:leading-[1.6] tracking-tight">
                    {take || article.summary || "Strategizing high-impact implications..."}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Strategic Outlook Card */}
          <section>
            <div className="glass-panel !bg-white/5 rounded-[2rem] md:rounded-[3rem] p-8 md:p-16 xl:p-20 border-white/10 text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10 space-y-4 md:space-y-6">
                <span className="text-[9px] md:text-[10px] font-black text-text/30 uppercase tracking-[0.5em] block">Strategic Outlook</span>
                <p className="text-xl md:text-3xl xl:text-4xl font-black text-text leading-[1.2] tracking-tighter xl:max-w-[90%] mx-auto">
                  {verdict || "Maintain strategic liquidity while monitoring vertical realignment."}
                </p>
              </div>
            </div>
          </section>

          {/* Footer Actions */}
          <div className="flex flex-wrap gap-4 items-center mt-12 md:mt-16 pt-8 border-t border-white/5">
            <button 
              onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`, '_blank')}
              className="flex items-center gap-3 px-6 md:px-8 py-3 md:py-3.5 bg-[#0077b5] text-white rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:brightness-110 transition-all shadow-xl shadow-[#0077b5]/20"
            >
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4 fill-current" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
              Share on LinkedIn
            </button>
            <button 
              onClick={() => window.open(`https://threads.net/intent/post?text=${encodeURIComponent(article.title)}`, '_blank')}
              className="flex items-center gap-3 px-6 md:px-8 py-3 md:py-3.5 bg-white text-black rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:opacity-90 transition-all shadow-xl"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5 fill-current" viewBox="0 0 192 192"><path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.834C118.497 71.7915 120.315 75.82 121.411 80.7937C110.82 80.5962 98.7188 80.8999 87.0544 84.7725C74.6041 89.288 64.8878 98.0581 61.7042 109.525C59.9886 115.704 60.3341 122.753 64.2952 128.729C68.3267 134.811 75.334 139.117 84.0538 140.85C87.6201 141.558 91.3113 141.916 95.0211 141.916C105.105 141.916 115.011 138.838 122.062 133.053C126.746 129.213 130.402 124.321 132.553 118.6L143.193 124.623C139.805 133.642 133.4 141.523 126.16 146.997C117.151 153.801 106.104 157.067 95.0211 157.067C90.2223 157.067 85.4526 156.611 80.8415 155.698C68.1009 153.167 57.018 146.983 49.3248 138.355C41.8329 129.93 38.6534 118.727 40.3813 106.772C44.1522 89.6015 56.6433 76.5415 72.8427 68.6186C80.2078 65.018 88.5298 63.1513 97.2662 63.1513C104.97 63.1513 112.593 64.4447 119.576 67.019C128.691 70.384 135.539 76.8407 139.691 85.945C140.334 86.9536 140.947 87.969 141.537 88.9883ZM118.156 122.972C113.626 126.68 106.31 129.624 95.0211 129.624C92.6587 129.624 90.3129 129.408 88.0163 128.95C82.7846 127.904 78.5085 121.139C76.0125 121.139C74.3414 118.461 74.3828 115.111 75.3195 111.737C77.3005 104.593 84.1444 98.4239 94.671 94.6033C104.606 91.31 114.717 91.0776 123.634 91.8023C122.259 104.184 118.156 122.972z"/></svg>
               Share on Threads
            </button>
          </div>
        </div>

        {/* Sidebar Column */}
        <aside className="space-y-6 md:space-y-8">
          {/* Revenue Implications Card */}
          <div className="glass-panel !bg-[#12121A] rounded-[2rem] md:rounded-[2.5rem] p-8 md:p-10 border-white/10 shadow-2xl">
            <h3 className="text-[9px] md:text-[10px] font-black text-text/40 uppercase tracking-[0.4em] mb-8 md:mb-10 flex items-center gap-4">
              Revenue Implications
              <div className="h-px flex-1 bg-white/5" />
            </h3>
            
            <div className="space-y-8">
              {Array.isArray(article.breakdown) && article.breakdown.length > 0 ? (
                article.breakdown.map((point, i) => (
                  <div key={i} className="flex gap-5 group">
                    <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-text/60 font-black text-[11px] group-hover:bg-accent group-hover:text-white transition-all group-hover:border-accent">
                      {i + 1}
                    </div>
                    <p className="text-xs text-text/60 leading-relaxed font-bold group-hover:text-text/90 transition-colors">
                      {parsePoint(point)}
                    </p>
                  </div>
                ))
              ) : (
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-5">
                    <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-text/20 font-black text-[11px]">
                      {i}
                    </div>
                    <div className="space-y-2 flex-1 pt-2">
                      <div className="h-2 bg-white/5 rounded w-full" />
                      <div className="h-2 bg-white/5 rounded w-3/4" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Market Impact Card */}
          <div className="glass-panel !bg-[#12121A] rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 border-white/10 shadow-2xl">
            <h3 className="text-[8px] md:text-[9px] font-black text-text uppercase tracking-[0.3em] md:tracking-[0.4em] mb-6 md:mb-8">Market Impact</h3>
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center justify-between p-4 md:p-5 bg-white/5 rounded-xl md:rounded-2xl border border-white/10">
                <span className="text-[9px] md:text-[10px] font-black text-text/40 uppercase tracking-widest">Sector</span>
                <span className="text-[9px] md:text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">SaaS / Enterprise</span>
              </div>
              <div className="flex items-center justify-between p-4 md:p-5 bg-white/5 rounded-xl md:rounded-2xl border border-white/10">
                <span className="text-[9px] md:text-[10px] font-black text-text/40 uppercase tracking-widest">Sentiment</span>
                <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] ${sentiment === 'BULLISH' ? 'text-emerald-500' : sentiment === 'BEARISH' ? 'text-rose-500' : 'text-amber-500'}`}>
                  {sentiment}
                </span>
              </div>
               <div className="flex items-center justify-between p-4 md:p-5 bg-white/5 rounded-xl md:rounded-2xl border border-white/10">
                <span className="text-[9px] md:text-[10px] font-black text-text/40 uppercase tracking-widest">Confidence</span>
                <span className="text-[9px] md:text-[10px] font-black text-text/60 uppercase tracking-[0.2em]">92%</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </motion.div>
  );
};

function FeaturedInsightCard({ article, onClick }: { article: Article, onClick: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-12 glass-panel !bg-[#0D0D15] !rounded-[3rem] overflow-hidden border-white/5 shadow-2xl group cursor-pointer group hover:border-[#F27D26]/20 transition-all duration-700"
      onClick={onClick}
    >
      <div className="flex flex-col xl:flex-row min-h-[450px] xl:max-h-[600px]">
        {/* Image Section */}
        <div className="w-full xl:w-[40%] relative overflow-hidden">
          <AnalysisImage 
            src={article.image_url} 
            alt={article.title} 
            rounded="rounded-none"
            className="!border-none !shadow-none group-hover:scale-110 transition-transform duration-1000 h-full w-full object-cover"
          />
          {/* Tag Overlay */}
          <div className="absolute top-8 left-8 z-20">
            <div className="flex items-center gap-2 bg-[#F27D26] text-white text-[10px] font-black px-5 py-2.5 rounded-xl uppercase tracking-[0.2em] shadow-2xl shadow-[#F27D26]/40">
              <Zap className="w-4 h-4" />
              Intelligence Briefing
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent pointer-events-none" />
        </div>
        
        {/* Content Section */}
        <div className="w-full xl:w-[60%] p-8 md:p-14 lg:p-16 flex flex-col justify-center relative">
          {/* Abstract background element */}
          <div className="absolute -right-20 -bottom-20 opacity-[0.02] pointer-events-none">
            <Brain className="w-80 h-80 text-white" />
          </div>

          <div className="relative z-10 space-y-8">
            <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.3em] text-text/30">
              <span>{article.source}</span>
              <div className="w-1 h-1 rounded-full bg-white/10" />
              <span>{formatDate(article.date)}</span>
              <div className="w-1 h-1 rounded-full bg-white/10" />
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                {article.readTime || '8 MIN READ'}
              </div>
            </div>
            
            <h2 className="text-3xl md:text-5xl font-black text-text leading-[1.05] tracking-tighter group-hover:text-[#F27D26] transition-colors">
              {article.title}
            </h2>
            
            <p className="text-lg text-text/50 italic leading-relaxed line-clamp-3 font-medium">
              "{article.summary}"
            </p>

            <div className="pt-8 border-t border-white/5 flex items-center justify-between">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0D0D15] bg-white/5 flex items-center justify-center">
                    <UserIcon className="w-3.5 h-3.5 text-white/20" />
                  </div>
                ))}
              </div>
              <div className="text-[#F27D26] font-black text-[11px] uppercase tracking-[0.3em] flex items-center gap-2 group-hover:gap-4 transition-all">
                Access Full Report <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribeSuccess, setSubscribeSuccess] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
    } catch (e) {
      console.warn("Theme detection fallback implemented", e);
      return true;
    }
  });
  const [showHeader, setShowHeader] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFabTooltip, setShowFabTooltip] = useState(false);
  const [showCookieConsent, setShowCookieConsent] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  const [visibleCount, setVisibleCount] = useState(12);

  const loadMore = () => {
    setVisibleCount(prev => prev + 12);
  };

  // Dynamic SEO Metadata
  useEffect(() => {
    if (selectedArticle) {
      document.title = `${selectedArticle.title} | SaaS Sentinel`;
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', selectedArticle.summary);
      }
      
      // Update Open Graph
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', selectedArticle.title);
      
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', selectedArticle.summary);
      
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) ogImage.setAttribute('content', selectedArticle.image_url);
    } else if (showAbout) {
      document.title = "About SaaS Sentinel | Elite B2B Market Intelligence";
    } else {
      document.title = "SaaS Sentinel | Elite B2B Market Intelligence & SaaS Analysis";
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', "SaaS Sentinel is the premier intelligence hub for high-growth software ecosystems. Get real-time AI-driven analysis on SaaS market shifts.");
      }
    }
  }, [selectedArticle, showAbout]);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Check for cookie consent
  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    // Check if we are viewing a specific article to avoid distracting new users immediately
    const params = new URLSearchParams(window.location.search);
    const hasArticleId = params.get('article') || params.get('articleId') || params.get('id') || window.location.pathname.includes('/article/') || window.location.pathname.includes('/news/');
    
    if (!consent) {
      // Check for common bot characteristics in UA to suppress UI
      const ua = navigator.userAgent.toLowerCase();
      const isSuspectedBot = ['bot', 'crawler', 'spider', 'linkedin', 'facebook', 'twitter', 'pingdom'].some(s => ua.includes(s));
      
      if (isSuspectedBot) return;

      // If it's a deep link, delay the consent significantly to allow reading
      if (hasArticleId) {
        const timer = setTimeout(() => setShowCookieConsent(true), 25000); // 25 seconds delay for deep links
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => setShowCookieConsent(true), 5000); // 5 seconds delay for general home page
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleAcceptCookies = () => {
    localStorage.setItem('cookie-consent', 'true');
    setShowCookieConsent(false);
  };

  // Smart Header Logic
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      setIsScrolled(currentScrollY > 20);
      
      if (currentScrollY < 10) {
        setShowHeader(true);
      } else if (currentScrollY > lastScrollY) {
        setShowHeader(false);
      } else {
        setShowHeader(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Theme Toggle Effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Auth Listener
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
      }
      setLoading(false);
    }).catch(err => {
      console.error("Auth session error:", err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Deep Linking Logic
  useEffect(() => {
    async function handleDeepLink() {
      const params = new URLSearchParams(window.location.search);
      let articleId = params.get('article') || params.get('articleId') || params.get('id');
      
      // Also check return_url if present (infrastructure cookie check)
      if (!articleId && params.get('return_url')) {
        try {
          const returnUrl = decodeURIComponent(params.get('return_url')!);
          const returnParams = new URLSearchParams(returnUrl.split('?')[1] || '');
          articleId = returnParams.get('article') || returnParams.get('articleId') || returnParams.get('id');
          
          if (!articleId) {
            const pathParts = returnUrl.split(/[?#\s\\]/)[0].split('/');
            const articleIdx = pathParts.findIndex(p => p === 'article' || p === 'news');
            if (articleIdx !== -1 && pathParts[articleIdx + 1]) {
              articleId = pathParts[articleIdx + 1];
            }
          }
        } catch (e) {}
      }
      
      if (!articleId) {
        const pathParts = window.location.pathname.split('/');
        // Support both /article/ID and /news/ID formats
        const articleIdx = pathParts.findIndex(p => p === 'article' || p === 'news');
        if (articleIdx !== -1 && pathParts[articleIdx + 1]) {
          articleId = pathParts[articleIdx + 1];
        }
      }

      if (articleId && articleId !== 'undefined' && articleId !== 'null') {
        setLoading(true); // Ensure loading state is active while deep linking
        console.log(`[DEBUG-APP] Deep link detected for articleId: ${articleId}`);
        
        // If we already have articles, try to find it
        if (articles.length > 0) {
          const found = articles.find(a => String(a.id) === String(articleId));
          if (found) {
            console.log(`[DEBUG-APP] Found article in current list: ${found.title}`);
            
            // Switch tab logic removed - merged views
            setSelectedArticle(found);
            setShowAbout(false);
            setShowPrivacy(false);
            setShowArchive(false);
            setLoading(false); // Fix: set loading false after finding article
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          } else {
            console.log(`[DEBUG-APP] Article ${articleId} not found in current list of ${articles.length} articles. Fetching specifically...`);
          }
        }

        // If not found in list or list not loaded yet, fetch specifically
        try {
          const article = await fetchArticleById(articleId);
          if (article) {
            console.log(`[DEBUG-APP] Fetched article for deep link: ${article.title}`);
            
            // Switch tab logic removed - merged views
            setSelectedArticle(article);
            setShowAbout(false);
            setShowPrivacy(false);
            setShowArchive(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        } catch (err) {
          console.error("Failed to fetch specific article for deep link:", err);
        } finally {
          setLoading(false); // Fix: ensure loading false after fetch attempt
        }
      }
    }

    handleDeepLink();
    
    // Listen for URL changes (popstate handles back/forward, hashchange for hashes)
    window.addEventListener('popstate', handleDeepLink);
    window.addEventListener('hashchange', handleDeepLink);
    
    return () => {
      window.removeEventListener('popstate', handleDeepLink);
      window.removeEventListener('hashchange', handleDeepLink);
    };
  }, [articles.length, window.location.pathname, window.location.search]); // Re-run when articles are loaded or if we navigate

  // Articles Listener (Supabase)
  useEffect(() => {
    async function loadArticles() {
      setLoading(true);
      try {
        // Fetch initial batch for speed
        const data = await fetchNewsArticles([], 12);
        
        if (data && data.length > 0) {
          setArticles(data);
        } else {
          // Fallback to high-quality mock data if database is truly empty
          setArticles([
            {
              id: 'mock-1',
              title: 'The 2026 SaaS Multiples Report: Why Efficiency is the New Growth',
              content: 'In 2026, the market has shifted its focus from "growth at all costs" to "efficient growth." This report analyzes the top 50 SaaS companies and their Rule of 40 performance. We find that companies with a 20%+ free cash flow margin are trading at a 30% premium compared to those with higher growth but negative margins. The era of cheap capital is over, and the era of the "SaaS Cash Machine" has begun.',
              summary: 'An analysis of 2026 SaaS valuation multiples showing a 30% premium for high-margin efficiency over pure growth.',
              category: 'Market Intelligence',
              date: new Date().toISOString(),
              readTime: '8 min read',
              source: 'SaaS Sentinel Analysis',
              image_url: 'https://images.unsplash.com/photo-1551288049-bbda38a5f9a2?auto=format&fit=crop&q=80&w=2426'
            },
            {
              id: 'mock-initial-1',
              title: 'System Initializing',
              summary: 'Connecting to live market intelligence streams. If data does not appear shortly, please verify database credentials.',
              content: 'Our high-precision scanners are active. We are currently establishing a heartbeat connection to the primary SaaS database.',
              category: 'System',
              date: new Date().toISOString(),
              readTime: '1 min read',
              source: 'System',
              image_url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2426'
            }
          ]);
        }
      } catch (error) {
        console.error("Failed to load articles", error);
        setArticles([{
          id: 'error-mock',
          title: 'Database Connection Offline',
          summary: 'We are experiencing difficulties connecting to the intelligence stream.',
          content: 'Database connection failed. Our engineers have been alerted to the drop in signal signal.',
          category: 'Alert',
          readTime: '1 min read',
          source: 'System',
          date: new Date().toISOString()
        }]);
      } finally {
        setLoading(false);
      }
    }

    loadArticles();
  }, []);

  // SEO & Path-based Navigation Hijack
  useEffect(() => {
    const handleNavigation = async () => {
      const path = window.location.pathname;
      const articleMatch = path.match(/\/article\/(\d+)/);
      
      if (articleMatch) {
         const articleId = articleMatch[1];
         // Search local state first if available, else fetch
         const existing = articles.find(a => a.id === articleId);
         if (existing) {
           setSelectedArticle(existing);
         } else {
           setLoading(true);
           try {
             const article = await fetchArticleById(articleId);
             if (article) setSelectedArticle(article);
           } catch (e) {
             console.error("Deep link navigation error:", e);
           } finally {
             setLoading(false);
           }
         }
      } else if (path === '/' || path === '') {
        setSelectedArticle(null);
        setShowAbout(false);
        setShowArchive(false);
        setShowPrivacy(false);
      }
    };

    handleNavigation();
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, [articles.length]); // Re-run if articles load

  // Sync state changes with browser History API
  useEffect(() => {
    let targetPath = '/';
    if (selectedArticle) {
      targetPath = `/article/${selectedArticle.id}`;
    } else if (showAbout) {
      targetPath = '/about';
    } else if (showArchive) {
      targetPath = '/archive';
    } else if (showPrivacy) {
      targetPath = '/privacy';
    }

    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }

    // Set page title for SEO
    if (selectedArticle) {
      document.title = `${selectedArticle.title} | SaaS Sentinel Intelligence`;
    } else if (showAbout) {
      document.title = "About | SaaS Sentinel Intelligence";
    } else if (showArchive) {
      document.title = "Archive | SaaS Sentinel Intelligence";
    } else {
      document.title = "SaaS Sentinel | Real-time SaaS Intelligence Monitoring";
    }
  }, [selectedArticle, showAbout, showArchive, showPrivacy]);

  const handleLogin = async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newsletterEmail)) {
      setSubscribeError('Please enter a valid email address.');
      setTimeout(() => setSubscribeError(null), 3000);
      return;
    }

    setSubscribing(true);
    setSubscribeError(null);
    try {
      const { success, alreadyExists } = await addSubscriber(newsletterEmail);
      if (success) {
        setSubscribeSuccess(true);
        setNewsletterEmail('');
        setTimeout(() => setSubscribeSuccess(false), 5000);
      } else if (alreadyExists) {
        setSubscribeError('You are already on the list!');
        setTimeout(() => setSubscribeError(null), 5000);
      } else {
        setSubscribeError('Something went wrong. Please try again.');
        setTimeout(() => setSubscribeError(null), 5000);
      }
    } catch (error) {
      console.error("Subscription failed", error);
      setSubscribeError('An unexpected error occurred.');
      setTimeout(() => setSubscribeError(null), 5000);
    } finally {
      setSubscribing(false);
    }
  };

  const filteredArticles = useMemo(() => articles.filter(article => {
    const query = searchQuery.toLowerCase();
    const title = (article.title || '').toLowerCase();
    const content = (article.content || '').toLowerCase();
    const summary = (article.summary || '').toLowerCase();
    const category = (article.category || '').toLowerCase();
    
    return title.includes(query) ||
           content.includes(query) ||
           summary.includes(query) ||
           category.includes(query);
  }), [articles, searchQuery]);

  const displayedArticles = useMemo(() => filteredArticles.slice(0, visibleCount), [filteredArticles, visibleCount]);

  return (
    <div className="min-h-screen relative transition-colors duration-500">
        {/* Background Gradients */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-sunlight opacity-60" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row">
          {/* Desktop Sidebar */}
          <Sidebar 
            selectedArticle={selectedArticle}
            setSelectedArticle={setSelectedArticle}
            setShowPrivacy={setShowPrivacy}
            setShowAbout={setShowAbout}
            setShowArchive={setShowArchive}
            showAbout={showAbout}
            showPrivacy={showPrivacy}
            showArchive={showArchive}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            user={user}
            handleLogout={handleLogout}
          />

          <div className="flex-1 flex flex-col min-w-0 lg:ml-72">
            {/* Smart Header Container (Mobile/Tablet) */}
            <motion.div 
              initial={{ y: 0 }}
              animate={{ 
                y: showHeader ? 0 : -120,
                paddingTop: isScrolled ? '6px' : '12px',
                paddingBottom: isScrolled ? '6px' : '0px'
              }}
              transition={{ 
                duration: 0.4, 
                ease: [0.4, 0, 0.2, 1]
              }}
              className="fixed top-0 left-0 right-0 z-[110] px-3 md:px-6 lg:hidden"
            >
              <div className={`max-w-5xl mx-auto overflow-hidden shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] border ${isScrolled ? 'rounded-2xl bg-[var(--color-glass)] backdrop-blur-[12px] border-white/20' : 'rounded-[32px] bg-[var(--color-nav-bg)] backdrop-blur-md border-white/10'}`}>
                {/* Tier 1: Market Pulse (Top Bar) */}
                <div className={`bg-[var(--color-ticker-bg)] flex items-center gap-2 px-4 transition-all duration-500 border-b border-white/5 ${isScrolled ? 'h-0 opacity-0 overflow-hidden' : 'h-7 opacity-100'}`}>
                  <div className="flex items-center gap-1.5 text-[7px] md:text-[8px] font-black uppercase tracking-widest text-[#F27D26] shrink-0">
                    <Activity className="w-2.5 h-2.5" />
                    <span className="hidden xs:inline">Market Pulse</span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <MarketTicker />
                  </div>
                </div>

                {/* Tier 2: Brand & Navigation (Bottom Bar) */}
                <nav className={`flex items-center justify-between gap-1.5 px-2 md:px-8 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isScrolled ? 'py-1' : 'py-2 md:py-4'}`}>
                  {/* Left side: Logo & Brand */}
                  <div className="flex items-center gap-1 md:gap-3 cursor-pointer shrink-0" onClick={() => { setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); setShowArchive(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <div className={`bg-[#F27D26] rounded-xl shadow-lg transition-all duration-500 ${isScrolled ? 'p-0.5' : 'p-1'}`}>
                      <Newspaper className={`${isScrolled ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5 md:w-6 md:h-6'} text-white`} />
                    </div>
                    <div className="flex flex-col leading-none">
                      <h1 className={`${isScrolled ? 'text-[7px]' : 'text-[9px] md:text-sm'} font-black uppercase tracking-tight text-text transition-all duration-500`}>SaaS Sentinel</h1>
                    </div>
                  </div>
                  
                  {/* Center/Right: Nav Links & Sub Button */}
                  <div className="flex items-center gap-1 md:gap-4 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1.5 md:gap-4 text-[6.5px] md:text-[10px] font-black uppercase tracking-widest overflow-x-auto no-scrollbar whitespace-nowrap px-0.5">
                        <button 
                          onClick={() => { setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); setShowArchive(false); }}
                          className={`relative transition-colors py-1 ${!selectedArticle && !showAbout && !showPrivacy && !showArchive ? 'text-[#F27D26]' : 'text-text/40 hover:text-text'}`}
                        >
                          Feed
                        </button>
                        <button 
                          onClick={() => { setShowAbout(true); setSelectedArticle(null); setShowPrivacy(false); setShowArchive(false); }}
                          className={`relative transition-colors py-1 ${showAbout ? 'text-[#F27D26]' : 'text-text/40 hover:text-text'}`}
                        >
                          About
                        </button>
                        <button 
                          onClick={() => { setShowArchive(true); setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); }}
                          className={`relative transition-colors py-1 ${showArchive ? 'text-[#F27D26]' : 'text-text/40 hover:text-text'}`}
                        >
                          Archive
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-1 md:gap-3 shrink-0">
                      <button 
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={`rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-500 flex items-center justify-center shrink-0 ${isScrolled ? 'w-5 h-5' : 'w-7 h-7'}`}
                        aria-label="Toggle theme"
                      >
                        {isDarkMode ? <Sun className="w-2 h-2" /> : <Moon className="w-2 h-2" />}
                      </button>

                      <button 
                        onClick={() => setShowSubscribeModal(true)}
                        className={`bg-[#F27D26] text-white font-black rounded-lg md:rounded-xl transition-all duration-500 flex items-center justify-center gap-1 md:gap-2 uppercase tracking-widest shadow-lg shadow-[#F27D26]/20 ${isScrolled ? 'px-1.5 py-1 text-[6px]' : 'px-2 py-1.5 text-[7px] md:text-[10px]'}`}
                      >
                        <Mail className="w-2 h-2" />
                        <span className="hidden xs:inline">Subscribe</span>
                        <span className="xs:hidden">Sub</span>
                      </button>
                    </div>
                  </div>
                </nav>
              </div>
            </motion.div>

          <AnimatePresence>
            {/* Modals */}
          </AnimatePresence>

          {/* Subscribe Modal */}
          <AnimatePresence>
            {showSubscribeModal && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="glass-panel rounded-[3rem] max-w-md w-full p-8 md:p-12 shadow-2xl relative overflow-hidden"
                >
                  <button 
                    onClick={() => setShowSubscribeModal(false)}
                    className="absolute top-6 right-6 text-text/40 hover:text-text transition-colors"
                  >
                    <Plus className="w-6 h-6 rotate-45" />
                  </button>

                  <div className="flex flex-col items-center text-center">
                    <div className="bg-accent/10 p-4 rounded-3xl mb-6">
                      <Mail className="w-8 h-8 text-accent" />
                    </div>
                    <h2 className="text-3xl font-black text-text tracking-tight mb-4">Join the Elite</h2>
                    <p className="text-text/60 mb-8 leading-relaxed">
                      Get high-precision SaaS intelligence delivered to your inbox every week. No fluff, just data.
                    </p>
                    
                    <form onSubmit={handleSubscribe} className="w-full space-y-4">
                      <input 
                        type="email" 
                        value={newsletterEmail}
                        onChange={(e) => setNewsletterEmail(e.target.value)}
                        placeholder="founder@company.com"
                        className="w-full bg-white/5 dark:bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-accent/20 outline-none transition-all text-text font-bold"
                        required
                      />
                      <button 
                        type="submit"
                        disabled={subscribing || subscribeSuccess}
                        className="w-full btn-accent py-4 rounded-2xl text-sm font-black shadow-lg shadow-accent/20"
                      >
                        {subscribing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : subscribeSuccess ? 'You\'re on the list!' : 'Subscribe Now'}
                      </button>
                      <AnimatePresence>
                        {subscribeError && (
                          <motion.p 
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-xs text-accent font-bold mt-2"
                          >
                            {subscribeError}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </form>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 pt-40 lg:pt-8 pb-12 transition-all duration-500 relative z-10">
          <div className="max-w-[1800px] mx-auto px-4 md:px-12">
            <AnimatePresence mode="wait">
            {showArchive ? (
              <ArchivePage key="archive-page" onSelect={(article) => { setSelectedArticle(article); setShowArchive(false); }} />
            ) : showAbout ? (
              <AboutPage key="about-page" />
            ) : showPrivacy ? (
              <PrivacyPage key="privacy-page" />
            ) : selectedArticle ? (
              <SentinelAnalysisView 
                article={selectedArticle} 
                onBack={() => setSelectedArticle(null)} 
              />
            ) : (
              <div className="space-y-16">
                {/* News Feed */}
                <section className="min-w-0">
                  {/* Liquid Glass Search Bar */}
                  <div className="mb-16 relative group max-w-5xl mx-auto">
                    <div className="absolute inset-0 bg-accent/5 blur-2xl rounded-3xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative glass-panel !rounded-3xl flex items-center px-6 py-2 border-white/20 shadow-xl focus-within:border-accent/30 transition-all">
                      <Search className="w-5 h-5 text-text/30 mr-4" />
                      <input 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search Intelligence (e.g. AI, Microsoft, Funding)..."
                        className="w-full bg-transparent border-none outline-none text-text placeholder:text-text/20 py-3 font-medium"
                      />
                      {searchQuery && (
                        <button 
                          onClick={() => setSearchQuery('')}
                          className="text-[10px] font-black uppercase tracking-widest text-text/40 hover:text-accent transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {loading && articles.length === 0 ? (
                    <LiquidGlassSpinner />
                  ) : filteredArticles.length > 0 ? (
                    <div className="space-y-16">
                      {/* Featured First Article - Full Width on Desktop for Better Impact */}
                      <FeaturedInsightCard 
                        article={filteredArticles[0]} 
                        onClick={() => setSelectedArticle(filteredArticles[0])} 
                      />

                      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px] gap-8 md:gap-10 items-start px-0">
                        {/* Remaining Articles Grid */}
                        <div className="space-y-12">
                          <div className="flex items-center justify-between border-b border-text/5 pb-4">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-text">
                              <Activity className="w-5 h-5 text-accent" />
                              Intelligence Feed
                            </h2>
                            <div className="flex gap-2">
                              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                              <span className="text-[10px] font-bold text-text/40 uppercase tracking-widest">Live Updates</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6 md:gap-8">
                            {displayedArticles.slice(1).map((article) => (
                              <motion.article 
                                key={article.id}
                                layout
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-50px" }}
                                className="group glass-panel !bg-white/5 hover:!bg-white/10 !rounded-[2.5rem] cursor-pointer flex flex-col h-full transition-all duration-500 border-white/5 hover:border-white/20 shadow-xl overflow-hidden"
                                onClick={() => setSelectedArticle(article)}
                              >
                                <div className="relative aspect-[16/10] overflow-hidden shrink-0">
                                  <AnalysisImage 
                                    src={article.image_url} 
                                    alt={article.title} 
                                    rounded="rounded-none"
                                    className="!border-none !shadow-none group-hover:scale-105 transition-transform duration-700"
                                  />
                                  <div className="absolute top-4 left-4 z-20">
                                    <span className={`text-[9px] font-black px-4 py-1.5 rounded-lg uppercase tracking-widest border backdrop-blur-xl shadow-lg ${
                                      (article.category || '').toUpperCase().includes('BULLISH') ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' :
                                      (article.category || '').toUpperCase().includes('BEARISH') ? 'bg-rose-500/20 text-rose-500 border-rose-500/30' :
                                      'bg-accent/20 text-accent border-accent/30'
                                    }`}>
                                      {article.category === 'Analysis' ? 'AI Intelligence' : article.category}
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="p-6 flex-1 flex flex-col">
                                <div className="flex justify-between items-center mb-3">
                                  <span className="text-[9px] font-black text-text/30 uppercase tracking-[0.2em]">{article.source}</span>
                                  <span className="text-[9px] font-bold text-text/20">{article.readTime}</span>
                                </div>

                                <h3 className="text-lg font-black group-hover:text-accent transition-colors leading-[1.25] mb-3 line-clamp-2">
                                  {article.title}
                                </h3>
                                
                                <p className="text-xs text-text/50 leading-relaxed line-clamp-3 italic mb-6">
                                  "{article.summary}"
                                </p>

                                <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                                  <span className="text-[9px] text-text/20 font-black uppercase tracking-widest">{formatDate(article.date)}</span>
                                  <div className="text-accent font-black text-[9px] uppercase tracking-widest flex items-center gap-1 group-hover:gap-2 transition-all">
                                    Full Analysis <ChevronRight className="w-3 h-3" />
                                    </div>
                                  </div>
                                </div>
                              </motion.article>
                            ))}
                          </div>
                          
                          {visibleCount < filteredArticles.length ? (
                            <div className="flex justify-center pt-8">
                              <button 
                                onClick={loadMore}
                                className="group relative px-10 py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] text-text transition-all overflow-hidden"
                              >
                                <div className="absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/5 to-accent/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                Scan for More Intelligence
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center pt-12 pb-8 border-t border-white/5">
                              <div className="bg-accent/5 p-4 rounded-full mb-4">
                                <Archive className="w-6 h-6 text-accent/40" />
                              </div>
                              <h4 className="text-sm font-black text-text/60 uppercase tracking-widest mb-2">End of Live Feed</h4>
                              <p className="text-xs text-text/40 mb-6 text-center max-w-xs leading-relaxed">
                                You've reached the limit of current active intelligence. Access thousands of historical signals in our secure vault.
                              </p>
                              <button 
                                onClick={() => setShowArchive(true)}
                                className="px-8 py-3 bg-accent text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-accent/20 hover:scale-105 transition-transform"
                              >
                                Access Full Intelligence Archive
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Right Sidebar Column */}
                        <aside className="hidden lg:block space-y-8">
                          {/* Market Ticker Card */}
                          <div className="glass-panel p-6 rounded-[2rem] border border-white/10 shadow-xl overflow-hidden">
                            <div className="flex items-center justify-between mb-6">
                              <div className="flex items-center gap-2">
                                <Activity className="w-5 h-5 text-accent" />
                                <h4 className="text-xs font-black uppercase tracking-widest text-text/60">Market Pulse</h4>
                              </div>
                              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                            </div>
                            <div className="-mx-6 px-6 border-y border-white/5 bg-[var(--color-ticker-bg)]">
                               <MarketTicker />
                             </div>
                            <p className="mt-4 text-[10px] text-text/40 font-bold uppercase tracking-widest text-center">Live SaaS Index Tracking</p>
                          </div>

                          {/* Weekly Intelligence (Subscribe) Card */}
                  <div id="newsletter-card" className="glass-panel p-6 rounded-[2rem] border border-accent/20 shadow-2xl relative overflow-hidden group">
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-accent/10 rounded-full blur-3xl group-hover:bg-accent/20 transition-all duration-700" />
                    
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="bg-accent/10 p-2 rounded-xl">
                          <Mail className="w-5 h-5 text-accent" />
                        </div>
                        <h4 className="font-black text-sm uppercase tracking-widest text-text/80">Weekly Intelligence</h4>
                      </div>
                      
                      <p className="text-sm text-text/60 mb-8 font-medium leading-relaxed">
                        Join 50k+ founders. No fluff, just high-precision SaaS data delivered to your inbox.
                      </p>

                      <form onSubmit={handleSubscribe} className="space-y-4">
                        <div className="relative">
                          <input 
                            type="email" 
                            value={newsletterEmail}
                            onChange={(e) => setNewsletterEmail(e.target.value)}
                            placeholder="founder@company.com"
                            className="w-full bg-white/40 dark:bg-white/5 border border-white/20 rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-accent/20 outline-none transition-all text-text font-bold placeholder:text-text/20"
                            required
                          />
                        </div>
                        <button 
                          type="submit"
                          disabled={subscribing || subscribeSuccess}
                          className="w-full btn-accent py-4 rounded-2xl text-sm font-black shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          {subscribing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : subscribeSuccess ? 'Welcome to the List!' : 'Join the Elite'}
                        </button>
                        <AnimatePresence>
                          {subscribeError && (
                            <motion.p 
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className="text-[10px] text-accent font-bold text-center mt-2 uppercase tracking-widest"
                            >
                              {subscribeError}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </form>
                    </div>
                  </div>

                  {/* Market Health Card */}
                  <div className="glass-panel p-6 rounded-[2rem] border-l-4 border-accent shadow-lg">
                    <div className="flex items-center gap-2 mb-6">
                      <TrendingUp className="w-5 h-5 text-accent" />
                      <h4 className="text-xs font-bold uppercase tracking-widest text-text/60">Market Health</h4>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-base font-bold text-text">SaaS Index</span>
                        <span className="text-base font-black text-accent">+2.4%</span>
                      </div>
                      <div className="w-full bg-text/5 h-2 rounded-full overflow-hidden">
                        <div className="bg-accent h-full w-[75%]" />
                      </div>
                      <p className="text-xs text-text/40 leading-relaxed font-medium">
                        The SaaS sector is showing strong resilience with enterprise spending up 12% YoY.
                      </p>
                    </div>
                  </div>

                  {/* Trending Topics (Sidebar Card) */}
                  <div className="glass-panel p-6 rounded-[2rem]">
                    <h4 className="font-bold mb-8 flex items-center gap-2 text-sm uppercase tracking-widest text-text/80">
                      <Flame className="w-5 h-5 text-accent" />
                      Intelligence Clusters
                    </h4>
                    <ul className="space-y-6">
                      {['#Funding', '#AIUpdate', '#M&A', '#VerticalSaaS', '#SaaSOps'].map((topic) => (
                        <li key={topic} className="flex items-center justify-between group cursor-pointer">
                          <span className="text-sm font-bold text-text/40 group-hover:text-accent transition-colors">{topic}</span>
                          <ChevronRight className="w-4 h-4 text-text/10 group-hover:text-accent group-hover:translate-x-1 transition-all" />
                        </li>
                      ))}
                    </ul>
                  </div>
                </aside>
              </div>
            </div>
          ) : (
            <div className="col-span-full text-center py-24 glass-panel rounded-[3rem] border-dashed border-text/10 bg-white/5">
              <Newspaper className="w-20 h-20 text-text/10 mx-auto mb-6 animate-pulse" />
              <h3 className="text-xl font-black text-text/60 mb-2 uppercase tracking-[0.3em]">No Intelligence Found</h3>
              <p className="text-text/40 font-medium max-w-sm mx-auto">Our Sentinel is currently scanning for market-shifting signals.</p>
            </div>
          )}
        </section>
      </div>
    )}
            </AnimatePresence>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-text/10 mt-20 py-12 bg-white/10 dark:bg-black/10 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-12">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-6 h-6 text-accent" />
                  <span className="font-black text-xl text-text">SaaS Sentinel</span>
                </div>
              </div>
              
              <div className="flex gap-8 text-xs font-black text-text/30 uppercase tracking-widest">
                {['LinkedIn'].map(social => (
                  <a key={social} href="#" className="hover:text-accent transition-colors">{social}</a>
                ))}
              </div>

              <div className="flex gap-8 text-[10px] font-bold text-text/20 uppercase tracking-widest">
                <button onClick={() => { setShowAbout(true); setShowPrivacy(false); setSelectedArticle(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-text transition-colors">About</button>
                <button onClick={() => { setShowPrivacy(true); setShowAbout(false); setShowArchive(false); setSelectedArticle(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-text transition-colors">Privacy</button>
                <button onClick={() => { setShowArchive(true); setShowAbout(false); setShowPrivacy(false); setSelectedArticle(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-text transition-colors">Archive</button>
              </div>
            </div>
            <div className="mt-12 pt-8 border-t border-text/5 text-center">
              <p className="text-[10px] text-text/10 uppercase tracking-widest font-black">© 2026 SaaS Sentinel. High-Precision SaaS Intelligence.</p>
            </div>
          </div>
        </footer>

        {/* Cookie Consent Bar */}
        <AnimatePresence>
          {showCookieConsent && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-6 left-6 right-6 z-[300] flex justify-center"
            >
              <div className="glass-panel max-w-4xl w-full p-6 md:p-8 rounded-[2rem] border border-white/20 shadow-2xl flex flex-col md:flex-row items-center gap-6 md:gap-12 bg-white/60 dark:bg-black/40 backdrop-blur-2xl">
                <div className="flex-1 text-center md:text-left">
                  <h4 className="text-lg font-black text-text mb-2">We respect your intelligence (and your data).</h4>
                  <p className="text-sm text-text/60 leading-relaxed">
                    SaaS Sentinel uses small digital cookies to remember your dashboard preferences and deliver your Weekly Digest. We don't track your life—just your SaaS interests. By staying, you’re cool with our <button onClick={() => { setShowPrivacy(true); setSelectedArticle(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-accent hover:underline font-bold">Privacy Policy</button>.
                  </p>
                </div>
                <button
                  onClick={handleAcceptCookies}
                  className="btn-accent !px-8 !py-4 !text-sm font-black whitespace-nowrap shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all"
                >
                  Got it, let's build.
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sticky Mobile Subscribe Button */}
        <div className="fixed bottom-6 right-6 z-[100] md:hidden">
          <button 
            onClick={() => setShowSubscribeModal(true)}
            className="btn-accent !rounded-full w-14 h-14 flex items-center justify-center shadow-2xl animate-pulse"
          >
            <Mail className="w-6 h-6" />
          </button>
        </div>

        {/* Floating Action Button */}
        <div className="fixed bottom-8 right-8 z-[150] flex flex-col items-end gap-4">
          <AnimatePresence>
            {showFabTooltip && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 10, x: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10, x: 20 }}
                className="glass-panel p-4 rounded-2xl border border-white/20 shadow-2xl max-w-[200px] bg-white/60 dark:bg-black/40 backdrop-blur-2xl relative"
              >
                <p className="text-[11px] font-bold text-text leading-relaxed italic">
                  "Scanning the markets for you, Founder. Don't get distracted!"
                </p>
                <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white/60 dark:bg-black/40 backdrop-blur-2xl border-r border-b border-white/20 rotate-45" />
              </motion.div>
            )}
          </AnimatePresence>
          
          <motion.button
            onClick={() => setShowSubscribeModal(true)}
            onMouseEnter={() => setShowFabTooltip(true)}
            onMouseLeave={() => setShowFabTooltip(false)}
            animate={{ 
              scale: [1, 1.05, 1],
              boxShadow: [
                "0 0 0 0 rgba(242, 125, 38, 0)",
                "0 0 0 10px rgba(242, 125, 38, 0.1)",
                "0 0 0 0 rgba(242, 125, 38, 0)"
              ]
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-14 h-14 rounded-full bg-accent text-white flex items-center justify-center shadow-lg shadow-accent/30 hover:scale-110 active:scale-95 transition-transform"
          >
            <Zap className="w-6 h-6 fill-current" />
          </motion.button>
        </div>
      </div>
    </div>
  </div>
  );
}

// Global Error Boundary
export class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean; error: any}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#d6d3cb] p-4 text-center">
          <div className="bg-white/40 backdrop-blur-xl p-8 rounded-3xl border border-white/20 max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-2">Platform Restart Required</h2>
            <p className="opacity-70 mb-6">{this.state.error?.message || "Critical interface failure detected."}</p>
            <button onClick={() => window.location.reload()} className="bg-[#f08924] text-white px-6 py-2 rounded-xl font-bold w-full">
              Reinitialize Terminal
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
