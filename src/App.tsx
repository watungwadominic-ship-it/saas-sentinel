/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './services/supabase.js';
import { Article } from './types.js';
import { generateArticle, fetchTopSaaSNews, parseNewsIntoStories } from './services/gemini.js';
import { fetchNewsArticles, saveNewsArticle } from './services/news_articles.js';
import { addSubscriber } from './services/subscribers.js';
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
  ArrowUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      message = this.state.error.message || message;

      return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-4 transition-colors duration-500">
          <div className="glass-panel p-8 rounded-3xl max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-accent mx-auto mb-4" />
            <h2 className="text-xl font-bold text-text mb-2">Application Error</h2>
            <p className="text-text/60 mb-6">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="glass-button w-full"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MarketTicker() {
  const [stocks, setStocks] = useState<any[]>([]);

  useEffect(() => {
    async function fetchStocks() {
      try {
        const { data, error } = await supabase
          .from('market_stocks')
          .select('*');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          setStocks(data);
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

  if (stocks.length === 0) return null;

  return (
    <div className="relative w-full overflow-hidden group">
      {/* Gradient Masks for Fading Effect */}
      <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[var(--color-ticker-bg)] to-transparent z-10 pointer-events-none opacity-80" />
      <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[var(--color-ticker-bg)] to-transparent z-10 pointer-events-none opacity-80" />
      
      <div className="flex items-center gap-12 animate-marquee whitespace-nowrap py-2 hover:[animation-play-state:paused] active:[animation-play-state:paused] cursor-pointer">
        {stocks.concat(stocks).concat(stocks).map((stock, i) => {
          const price = typeof stock.price === 'number' ? `$${stock.price.toFixed(2)}` : stock.price;
          const changeValue = typeof stock.change === 'number' ? stock.change : parseFloat(stock.change);
          const changeStr = typeof stock.change === 'number' ? `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(1)}%` : stock.change;
          const isPositive = typeof changeValue === 'number' ? changeValue >= 0 : changeStr.startsWith('+');

          return (
            <div key={i} className="flex items-center gap-3 text-[10px] font-bold">
              <span className="text-text">{stock.symbol}</span>
              <span className="text-text/60">{price}</span>
              <span className={isPositive ? 'text-accent' : 'text-[#d64545]'}>
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
    <div className="flex flex-col items-center justify-center py-20 w-full col-span-full">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 border-4 border-accent/20 rounded-full" />
        <motion.div 
          className="absolute inset-0 border-4 border-t-accent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <div className="absolute inset-2 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-inner" />
      </div>
      <p className="mt-6 text-[10px] font-black text-text/40 uppercase tracking-[0.3em] animate-pulse">
        Sourcing Intelligence...
      </p>
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
        
        <div className="relative z-10 text-center md:text-left">
          <div className="flex flex-col md:flex-row items-center gap-6 mb-12">
            <div className="bg-accent p-4 rounded-3xl shadow-xl shadow-accent/20">
              <Newspaper className="w-12 h-12 text-white" />
            </div>
            <div>
              <h1 className="text-4xl md:text-6xl font-black text-text tracking-tighter mb-2">SaaS Sentinel</h1>
              <p className="text-accent font-black text-xs uppercase tracking-[0.3em]">Precision Intelligence for B2B Founders</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-20">
            <div className="space-y-6">
              <h2 className="text-3xl font-black text-text">The Mission</h2>
              <p className="text-lg text-text/70 leading-relaxed">
                In an era of noise and hype, SaaS Sentinel provides the signal. We don't just report news; we analyze the structural shifts in the B2B SaaS landscape to give founders and investors a competitive edge.
              </p>
              <p className="text-lg text-text/70 leading-relaxed">
                Our intelligence is powered by high-precision AI models and curated by veteran market analysts who understand that data without context is just noise.
              </p>
            </div>
            <div className="glass-card !bg-white/5 border-white/10 p-8 rounded-[2.5rem] flex flex-col justify-center">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center border border-accent/20">
                    <Zap className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h4 className="font-black text-text">Real-time Feed</h4>
                    <p className="text-sm text-text/40">24/7 monitoring of the SaaS ecosystem.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center border border-accent/20">
                    <TrendingUp className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h4 className="font-black text-text">Deep Analysis</h4>
                    <p className="text-sm text-text/40">Strategic deep-dives into market trends.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-[10px] font-black text-text/40 uppercase tracking-[0.4em] mb-12 text-center">Our Methodology</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            {[
              { icon: Search, title: 'Scout', desc: 'Continuous scanning of global tech news, funding rounds, and product launches.' },
              { icon: Brain, title: 'Analyst', desc: 'AI-driven synthesis and human-verified strategic implications.' },
              { icon: Mail, title: 'Delivery', desc: 'High-precision intelligence delivered via our feed and weekly newsletter.' }
            ].map((item, i) => (
              <div key={i} className="text-center p-8 glass-panel rounded-[2.5rem] border-white/10 hover:border-accent/30 transition-all group">
                <div className="w-16 h-16 rounded-3xl bg-accent/5 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                  <item.icon className="w-8 h-8 text-accent" />
                </div>
                <h4 className="text-xl font-black text-text mb-4">{item.title}</h4>
                <p className="text-sm text-text/60 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center border-t border-text/5 pt-20">
            <h2 className="text-3xl font-black text-text mb-6">Get in Touch</h2>
            <p className="text-text/60 mb-10 max-w-xl mx-auto">Have a tip or want to partner with SaaS Sentinel? Our analysts are always looking for the next big signal.</p>
            <a 
              href="mailto:watungwadominic@gmail.com" 
              className="inline-flex items-center gap-3 px-10 py-5 bg-accent text-white rounded-2xl font-black text-lg shadow-xl shadow-accent/20 hover:scale-105 transition-transform active:scale-95"
            >
              <Mail className="w-6 h-6" />
              Contact Us
            </a>
          </div>
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
      const data = await fetchNewsArticles([]); // Fetch all
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
                      <span className="text-[10px] font-bold">{new Date(article.date).toLocaleDateString()}</span>
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
                    <span className="text-[8px] text-text/30 font-bold">• {new Date(article.date).toLocaleDateString()}</span>
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
  activeTab, 
  setActiveTab, 
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
      <div className="flex items-center gap-3 mb-12 cursor-pointer" onClick={() => { setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); setShowArchive(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
        <div className="bg-accent p-2.5 rounded-xl shadow-lg shadow-accent/20">
          <Newspaper className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-xl font-black tracking-tight text-[var(--color-sidebar-text)]">SaaS Sentinel</h1>
      </div>

      <nav className="flex-1 space-y-2">
        <button 
          onClick={() => { setActiveTab('Intelligence Feed'); setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); setShowArchive(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm ${activeTab === 'Intelligence Feed' && !showAbout && !showPrivacy && !showArchive ? 'text-accent bg-accent/5' : 'text-[var(--color-sidebar-text)]/60 hover:bg-white/5 hover:text-[var(--color-sidebar-text)]'}`}
        >
          <Activity className="w-5 h-5" />
          Feed
        </button>
        <button 
          onClick={() => { setActiveTab('Market Analysis'); setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); setShowArchive(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm ${activeTab === 'Market Analysis' && !showAbout && !showPrivacy && !showArchive ? 'text-accent bg-accent/5' : 'text-[var(--color-sidebar-text)]/60 hover:bg-white/5 hover:text-[var(--color-sidebar-text)]'}`}
        >
          <TrendingUp className="w-5 h-5" />
          Analysis
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

function AnalysisImage({ src, alt, className = "", rounded = "rounded-[2.5rem]" }: { src?: string, alt: string, className?: string, rounded?: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fallbackImage = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2426'; // Tech Abstract

  return (
    <div className={`relative w-full aspect-video overflow-hidden bg-[#1e293b] ${rounded} border border-white/20 shadow-2xl ${className}`}>
      {loading && (
        <div className="absolute inset-0 z-10 animate-shimmer" />
      )}
      <img
        src={error || !src ? fallbackImage : src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-700 ${loading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

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
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-[1200px] mx-auto pb-20 px-4 md:px-8"
    >
      <button 
        onClick={onBack}
        className="glass-button !inline-flex !w-auto !px-6 !py-3 mb-8 text-text/60 font-bold text-xs uppercase tracking-widest hover:!bg-white/10 transition-all"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back to analysis
      </button>

      {/* Analysis Hero Image */}
      <div className="mb-12">
        <AnalysisImage 
          src={article.image_url} 
          alt={article.title} 
        />
      </div>

      <div className="flex flex-col xl:flex-row gap-12 items-start">
        {/* Main Content (60%) */}
        <div className="w-full xl:w-[60%]">
          {/* The Signal (Header) */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <span className="bg-accent text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] shadow-lg shadow-accent/20">
                Deep Dive
              </span>
              <span className="bg-white/5 dark:bg-white/10 text-text/40 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] border border-white/10 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                {article.readTime || '5-minute read'}
              </span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-black mb-8 leading-[1.1] text-gradient-warm tracking-tight">
              {article.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-widest text-text/40 border-b pb-8 border-text/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white/40 dark:bg-white/10 rounded-full flex items-center justify-center border border-white/20">
                  <UserIcon className="w-4 h-4 text-text/60" />
                </div>
                <span className="text-text/80">{article.source}</span>
              </div>
              <span>•</span>
              <span>{new Date(article.date).toLocaleDateString()}</span>
              <span>•</span>
              <a href="#" className="text-accent hover:underline flex items-center gap-1">
                Original Source <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          </header>

          {/* The Sentinel's Take (Analysis) */}
          <section className="mb-16">
            <div className="animated-border-orange rounded-[3rem] p-px overflow-hidden">
              <div className="glass-panel !bg-white/40 dark:!bg-black/40 shadow-[0_0_40px_rgba(242,125,38,0.1)] rounded-[3rem] p-8 md:p-12 relative overflow-hidden h-full">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Brain className="w-32 h-32 text-accent" />
                </div>
                
                <div className="relative z-10">
                  <h3 className="text-[10px] font-black text-accent uppercase tracking-[0.3em] mb-10 flex items-center gap-3">
                    <Zap className="w-4 h-4" />
                    The Sentinel's Take
                  </h3>
                  
                  <div className="prose prose-xl prose-slate dark:prose-invert max-w-none text-text/90 leading-[1.8] font-medium">
                    {(article.sentinel_take || article.content) ? (
                      <div className="space-y-8">
                        {(article.sentinel_take || article.content).split('\n\n').map((para, i) => (
                          <p key={i} className={i === 0 ? "text-2xl font-black text-text leading-tight" : ""}>
                            {para}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="italic text-text/40">Our Sentinel is currently processing the strategic implications of this development...</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* The Verdict (Prediction) */}
          <section>
            <div className="p-8 md:p-12 glass-card border-white/20 bg-gradient-to-br from-accent/10 to-transparent rounded-[2.5rem] text-center">
              <h3 className="text-[10px] font-black text-text/40 uppercase tracking-[0.3em] mb-6">
                The Verdict
              </h3>
              <p className="text-2xl md:text-4xl font-black text-text leading-tight tracking-tight">
                {article.verdict || "Market volatility expected as structural shifts continue."}
              </p>
            </div>
          </section>
        </div>

        {/* Sidebar (40%) - Quick Context */}
        <aside className="w-full xl:w-[40%] xl:sticky xl:top-32 space-y-8">
          <div className="glass-panel p-8 rounded-[2.5rem] border-white/10">
            <h3 className="text-[10px] font-black text-text/40 uppercase tracking-[0.3em] mb-8 flex items-center gap-4">
              Quick Context
              <div className="h-px flex-1 bg-text/10" />
            </h3>
            
            <div className="space-y-6">
              {article.breakdown && article.breakdown.length > 0 ? (
                article.breakdown.map((point, i) => (
                  <div key={i} className="flex gap-4 group">
                    <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 text-accent font-black text-xs group-hover:bg-accent group-hover:text-white transition-all">
                      {i + 1}
                    </div>
                    <p className="text-sm text-text/70 leading-relaxed font-medium">
                      {parsePoint(point)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="italic text-text/40 text-center py-4">Context loading...</p>
              )}
            </div>
          </div>

          <div className="glass-card p-8 rounded-[2.5rem] bg-accent/5 border-accent/20">
            <h4 className="text-xs font-black text-text uppercase tracking-widest mb-4">Market Impact</h4>
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 mb-4">
              <span className="text-xs font-bold text-text/60">Sector</span>
              <span className="text-xs font-black text-accent uppercase tracking-widest">{article.category}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
              <span className="text-xs font-bold text-text/60">Sentiment</span>
              <span className="text-xs font-black text-emerald-500 uppercase tracking-widest">Bullish</span>
            </div>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}

function FeaturedInsightCard({ article, onClick }: { article: Article, onClick: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 xl:mb-6 glass-panel !rounded-[2rem] overflow-hidden border-white/20 shadow-xl group cursor-pointer max-h-none xl:max-h-[350px]"
      onClick={onClick}
    >
      <div className="flex flex-col xl:flex-row h-full">
        {/* Left Side: Image + Headline + Signal (PC) / Top Side (Mobile) */}
        <div className="w-full xl:w-1/2 flex flex-col border-b xl:border-b-0 xl:border-r border-white/10 overflow-hidden">
          <div className="relative aspect-video xl:aspect-auto xl:h-40 overflow-hidden shrink-0">
            <AnalysisImage 
              src={article.image_url} 
              alt={article.title} 
              rounded="rounded-none"
              className="!border-none !shadow-none"
            />
            <div className="absolute top-4 left-4 z-20">
              <span className="bg-accent text-white text-[8px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] shadow-lg">
                Featured Insight
              </span>
            </div>
          </div>
          
          <div className="p-6 xl:p-8 flex-1 flex flex-col justify-center bg-white/20 dark:bg-black/20 backdrop-blur-xl">
            <div className="flex items-center gap-3 mb-4 text-[9px] font-black uppercase tracking-widest text-text/40">
              <span>{article.source}</span>
              <span>•</span>
              <span>{new Date(article.date).toLocaleDateString()}</span>
            </div>
            
            <h2 className="text-xl md:text-2xl xl:text-3xl font-black mb-4 leading-tight text-gradient-warm line-clamp-2">
              {article.title}
            </h2>
            
            <p className="text-sm text-text/60 italic leading-relaxed line-clamp-2">
              "{article.summary}"
            </p>
          </div>
        </div>
        
        {/* Right Side: Sentinel's Take (PC) / Bottom Side (Mobile) */}
        <div className="w-full xl:w-1/2 p-6 xl:p-8 bg-white/30 dark:bg-black/30 backdrop-blur-2xl flex flex-col overflow-hidden">
          <h4 className="text-[9px] font-black text-accent uppercase tracking-[0.2em] mb-4 flex items-center gap-2 shrink-0">
            <Zap className="w-3 h-3" />
            The Sentinel's Take
          </h4>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
            <p className="text-xs text-text/80 leading-relaxed font-medium">
              Our AI Sentinel has analyzed this development against the broader SaaS landscape. This isn't just a news event; it's a structural realignment of market forces.
            </p>
            <p className="text-xs text-text/70 leading-relaxed">
              <span className="text-text font-bold">Strategic Impact:</span> The convergence of {article.category} and AI-driven automation is accelerating. We anticipate a 15-20% increase in vertical integration over the next quarter. Founders should focus on proprietary data moats and aggressive cost-optimization through LLM orchestration.
            </p>
            <p className="text-xs text-text/70 leading-relaxed">
              <span className="text-text font-bold">Market Outlook:</span> This volatility creates a unique entry point for resilient platforms. The "Sentinel's Strategy" here is to maintain high liquidity while doubling down on core infrastructure that supports this new {article.category.toLowerCase()} paradigm.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-white/5 shrink-0">
            <span className="text-[10px] font-black text-accent uppercase tracking-widest flex items-center gap-2">
              Read Full Analysis <ChevronRight className="w-3 h-3" />
            </span>
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
  const [activeTab, setActiveTab] = useState<'Intelligence Feed' | 'Market Analysis'>('Intelligence Feed');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribeSuccess, setSubscribeSuccess] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const isGenerating = useRef(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [showHeader, setShowHeader] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFabTooltip, setShowFabTooltip] = useState(false);
  const [showCookieConsent, setShowCookieConsent] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Check for cookie consent
  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    // Check if we are viewing a specific article to avoid distracting new users immediately
    const params = new URLSearchParams(window.location.search);
    const hasArticleId = params.get('article') || params.get('articleId') || params.get('id') || window.location.pathname.includes('/article/') || window.location.pathname.includes('/news/');
    
    if (!consent) {
      // If it's a deep link, delay the consent significantly to allow reading
      if (hasArticleId) {
        const timer = setTimeout(() => setShowCookieConsent(true), 10000); // 10 seconds delay for deep links
        return () => clearTimeout(timer);
      } else {
        setShowCookieConsent(true);
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

  // Auto-Sync / Background Generation
  useEffect(() => {
    async function checkAndGenerate() {
      try {
        const { data, error } = await supabase
          .from('news_articles')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error checking latest article:", error);
          return;
        }

        const now = new Date();
        const lastPostDate = data ? new Date(data.created_at) : null;
        const hoursSinceLastPost = lastPostDate ? (now.getTime() - lastPostDate.getTime()) / (1000 * 60 * 60) : Infinity;

        if (!data || hoursSinceLastPost >= 24) {
          console.log("Feed is empty or stale. Triggering auto-generation...");
          await triggerAutoGeneration();
        }
      } catch (err) {
        console.error("Auto-sync failed:", err);
      }
    }

    if (!loading) {
      checkAndGenerate();
    }
  }, [loading]);

  const triggerAutoGeneration = async () => {
    if (isGenerating.current) {
      console.log("Auto-generation already in progress. Skipping...");
      return;
    }

    const lastGenTime = localStorage.getItem('last_news_generation');
    const now = Date.now();
    if (lastGenTime && now - parseInt(lastGenTime) < 5 * 60 * 1000) {
      console.log("Auto-generation cooldown active (5 min). Skipping...");
      return;
    }

    isGenerating.current = true;
    localStorage.setItem('last_news_generation', now.toString());

    try {
      // 1. Fetch top news
      const context = articles.slice(0, 3).map(a => `${a.title}: ${a.summary}`).join('\n');
      const rawNews = await fetchTopSaaSNews(context);
      // 2. Parse into stories
      const stories = await parseNewsIntoStories(rawNews);
      // 3. Generate and save top 3 to match LinkedIn quantity
      const topStories = stories.slice(0, 3);
      
      for (const story of topStories) {
        // Add a 30-second delay between articles to respect free tier rate limits (2 RPM for Pro)
        if (topStories.indexOf(story) > 0) {
          console.log("Waiting 30s before next generation to avoid rate limits...");
          await sleep(30000);
        }

        const result = await generateArticle(story.title, story.snippet);
        await saveNewsArticle({
          title: result.title,
          content: result.content || "Analysis pending.",
          summary: story.snippet,
          category: result.category || "Intelligence Feed",
          readTime: "5 min read",
          source: "SaaS Sentinel AI",
          breakdown: result.breakdown,
          sentinel_take: result.sentinel_take,
          verdict: result.verdict
        });
      }
      
      // Refresh articles
      const data = await fetchNewsArticles();
      setArticles(data);
      console.log('PRIVATE KEY ACTIVE');
    } catch (error) {
      console.error("Auto-generation failed:", error);
    } finally {
      isGenerating.current = false;
    }
  };

  // Articles Listener (Supabase)
  useEffect(() => {
    async function loadArticles() {
      setLoading(true);
      try {
        let data: Article[] = [];
        if (activeTab === 'Intelligence Feed') {
          // Fetch all rows
          data = await fetchNewsArticles();
        } else {
          // Fetch only 'Analysis' or 'Market'
          data = await fetchNewsArticles(['Analysis', 'Market']);
          
          // Fallback to mock data if empty
          if (data.length === 0) {
            data = [
              {
                id: 'mock-1',
                title: 'The 2026 SaaS Multiples Report: Why Efficiency is the New Growth',
                content: 'In 2026, the market has shifted its focus from "growth at all costs" to "efficient growth." This report analyzes the top 50 SaaS companies and their Rule of 40 performance. We find that companies with a 20%+ free cash flow margin are trading at a 30% premium compared to those with higher growth but negative margins. The era of cheap capital is over, and the era of the "SaaS Cash Machine" has begun.',
                summary: 'An analysis of 2026 SaaS valuation multiples showing a 30% premium for high-margin efficiency over pure growth.',
                category: 'Market',
                date: new Date().toISOString(),
                readTime: '8 min read',
                source: 'SaaS Sentinel Analysis',
                image_url: 'https://images.unsplash.com/photo-1551288049-bbda38a5f9a2?auto=format&fit=crop&q=80&w=2426'
              },
              {
                id: 'mock-2',
                title: 'M&A Heatmap: Salesforce vs. Microsoft in the Battle for Agentic AI',
                content: 'The battle for the enterprise desktop has moved to the background. Salesforce and Microsoft are aggressively acquiring startups in the "Agentic AI" space—autonomous software that can execute tasks without human intervention. This heatmap shows the recent acquisitions and the strategic gaps remaining in both ecosystems. Salesforce is winning in CRM-specific agents, while Microsoft dominates the horizontal productivity layer.',
                summary: 'A strategic comparison of Salesforce and Microsoft acquisitions in the autonomous AI agent space.',
                category: 'Analysis',
                date: new Date().toISOString(),
                readTime: '12 min read',
                source: 'SaaS Sentinel Analysis',
                image_url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2426'
              },
              {
                id: 'mock-3',
                title: 'Vertical SaaS Deep Dive: Why Logistics is the Next $100B Opportunity',
                content: 'While horizontal SaaS is becoming saturated, vertical SaaS continues to find massive untapped markets. Logistics, specifically mid-market freight forwarding, remains one of the most fragmented and technologically underserved industries. This deep dive explores the unit economics of the three leading startups in this space and why we expect a major IPO in Q4 2026.',
                summary: 'Deep dive into the logistics vertical SaaS market and why it is poised for a $100B valuation breakout.',
                category: 'Market',
                date: new Date().toISOString(),
                readTime: '10 min read',
                source: 'SaaS Sentinel Analysis',
                image_url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=2426'
              }
            ];
          }
        }
        setArticles(data);

        // Check for article parameter in URL after articles are loaded
        // Handle deep linking from URL params or path
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

        if (articleId) {
          const found = data.find(a => a.id === articleId);
          if (found) {
            setSelectedArticle(found);
            // Clear other views to ensure we show the article
            setShowAbout(false);
            setShowPrivacy(false);
            setShowArchive(false);
          } else {
            // If not found in the list, fetch it specifically
            try {
              const { fetchArticleById } = await import('./services/news_articles.js');
              const article = await fetchArticleById(articleId);
              if (article) {
                setSelectedArticle(article);
                setShowAbout(false);
                setShowPrivacy(false);
                setShowArchive(false);
              }
            } catch (err) {
              console.error("Failed to fetch specific article for deep link:", err);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load articles", error);
      } finally {
        setLoading(false);
      }
    }
    loadArticles();
  }, [activeTab]);

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

  const filteredArticles = articles.filter(article => 
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ErrorBoundary>
      <div className="min-h-screen relative transition-colors duration-500">
        {/* Background Gradients */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-sunlight opacity-60" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row">
          {/* Desktop Sidebar */}
          <Sidebar 
            activeTab={activeTab}
            setActiveTab={setActiveTab}
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
                paddingTop: isScrolled ? '8px' : '16px',
                paddingBottom: isScrolled ? '8px' : '0px'
              }}
              transition={{ 
                duration: 0.4, 
                ease: [0.4, 0, 0.2, 1] // Cubic-Bezier
              }}
              className="fixed top-0 left-0 right-0 z-[110] px-4 lg:hidden"
            >
              <div className={`max-w-5xl mx-auto overflow-hidden shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] border ${isScrolled ? 'rounded-2xl bg-[var(--color-glass)] backdrop-blur-[10px] border-white/20' : 'rounded-[40px] bg-[var(--color-nav-bg)] backdrop-blur-md border-white/10'}`}>
                {/* Tier 1: Market Pulse (Top Bar) */}
                <div className={`bg-[var(--color-ticker-bg)] flex items-center gap-2 px-4 transition-all duration-500 ${isScrolled ? 'h-0 opacity-0 overflow-hidden' : 'h-8 opacity-100'}`}>
                  <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest text-text/60 shrink-0">
                    <Activity className="w-2.5 h-2.5 text-accent" />
                    <span className="hidden xs:inline">Market Pulse</span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <MarketTicker />
                  </div>
                </div>

                {/* Tier 2: Brand & Navigation (Bottom Bar) */}
                <nav className={`flex items-center justify-between gap-2 px-5 md:px-8 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isScrolled ? 'py-2' : 'py-3 md:py-4'}`}>
                  {/* Left side: Logo & Brand */}
                  <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={() => { setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); setShowArchive(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <div className={`bg-accent rounded-xl shadow-lg transition-all duration-500 ${isScrolled ? 'p-1' : 'p-2'}`}>
                      <Newspaper className={`${isScrolled ? 'w-3.5 h-3.5' : 'w-5 h-5 md:w-6 md:h-6'} text-white`} />
                    </div>
                    <h1 className={`${isScrolled ? 'text-[10px]' : 'text-xs md:text-base'} font-bold tracking-tight text-text transition-all duration-500`}>SaaS Sentinel</h1>
                  </div>
                  
                  {/* Center/Right: Nav Links & Sub Button */}
                  <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                    <div className="flex items-center gap-3 text-[10px] md:text-xs font-bold overflow-x-auto no-scrollbar whitespace-nowrap px-1">
                        <button 
                          onClick={() => { setActiveTab('Intelligence Feed'); setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); setShowArchive(false); }}
                          className={`relative transition-colors py-1 ${activeTab === 'Intelligence Feed' && !showAbout && !showPrivacy && !showArchive ? 'text-accent' : 'text-[var(--color-nav-text)] hover:text-text'}`}
                        >
                          Feed
                        </button>
                        <button 
                          onClick={() => { setActiveTab('Market Analysis'); setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); setShowArchive(false); }}
                          className={`relative transition-colors py-1 ${activeTab === 'Market Analysis' && !showAbout && !showPrivacy && !showArchive ? 'text-accent' : 'text-[var(--color-nav-text)] hover:text-text'}`}
                        >
                          Analysis
                        </button>
                        {!isScrolled && (
                          <>
                            <button 
                              onClick={() => { setShowAbout(true); setSelectedArticle(null); setShowPrivacy(false); setShowArchive(false); }}
                              className={`relative transition-colors py-1 ${showAbout ? 'text-accent' : 'text-[var(--color-nav-text)] hover:text-text'}`}
                            >
                              About
                            </button>
                            <button 
                              onClick={() => { setShowArchive(true); setSelectedArticle(null); setShowPrivacy(false); setShowAbout(false); }}
                              className={`relative transition-colors py-1 ${showArchive ? 'text-accent' : 'text-[var(--color-nav-text)] hover:text-text'}`}
                            >
                              Archive
                            </button>
                          </>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className="p-2 rounded-xl bg-white/40 dark:bg-black/20 border border-white/20 hover:bg-accent/10 transition-all duration-500 flex items-center justify-center shadow-sm"
                        aria-label="Toggle theme"
                      >
                        {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      </button>

                      {user ? (
                        <div className={`flex items-center gap-2 bg-white/20 rounded-full border border-white/10 transition-all duration-500 ${isScrolled ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
                          <img src={user?.user_metadata?.avatar_url || user?.user_metadata?.picture || ''} alt="" className={`${isScrolled ? 'w-4 h-4' : 'w-5 h-5'} rounded-full`} />
                          {!isScrolled && (
                            <button onClick={handleLogout} className="text-text/40 hover:text-text transition-colors">
                              <LogOut className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <button 
                          onClick={() => setShowSubscribeModal(true)}
                          className={`btn-accent font-black transition-all duration-500 flex items-center justify-center gap-1.5 shrink-0 ${isScrolled ? '!px-2 !py-1 !text-[9px] scale-90' : '!px-3 !py-1.5 !text-[10px] md:!text-xs'}`}
                        >
                          <Mail className="w-3 h-3" />
                          <span className="hidden xs:inline">Subscribe</span>
                          <span className="xs:hidden">Sub</span>
                        </button>
                      )}
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
        <main className="flex-1 pt-48 lg:pt-12 pb-12 transition-all duration-500 relative z-10">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8">
            <AnimatePresence mode="wait">
            {showArchive ? (
              <ArchivePage key="archive-page" onSelect={(article) => { setSelectedArticle(article); setShowArchive(false); }} />
            ) : showAbout ? (
              <AboutPage key="about-page" />
            ) : showPrivacy ? (
              <PrivacyPage key="privacy-page" />
            ) : selectedArticle ? (
              activeTab === 'Market Analysis' ? (
                <SentinelAnalysisView 
                  article={selectedArticle} 
                  onBack={() => setSelectedArticle(null)} 
                />
              ) : (
                <motion.div 
                  key="article-detail"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-3xl mx-auto"
                >
                <button 
                  onClick={() => setSelectedArticle(null)}
                  className="glass-button !inline-flex !w-auto !px-6 !py-3 mb-8 text-text/60 font-bold text-xs uppercase tracking-widest"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  Back to feed
                </button>
                
                <div className="mb-8 md:mb-12">
                  <AnalysisImage 
                    src={selectedArticle.image_url} 
                    alt={selectedArticle.title} 
                  />
                  <div className="mt-8">
                    <span className="text-[10px] font-black bg-accent/10 text-accent px-4 py-2 rounded-full uppercase tracking-[0.2em] border border-accent/20">{selectedArticle.category}</span>
                  </div>
                  <h1 className="mt-6">{selectedArticle.title}</h1>
                  <div className="mt-8 flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-widest text-text/40 border-y py-6 border-text/10">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-white/40 dark:bg-white/10 rounded-full flex items-center justify-center border border-white/20">
                        <UserIcon className="w-4 h-4 text-text/60" />
                      </div>
                      <span className="text-text/80">{selectedArticle.source}</span>
                    </div>
                    <span className="hidden sm:inline">•</span>
                    <span>{new Date(selectedArticle.date).toLocaleDateString()}</span>
                    <span className="hidden sm:inline">•</span>
                    <span>{selectedArticle.readTime}</span>
                  </div>
                </div>

                <div className="mb-12 p-8 md:p-12 glass-panel border-white/20 rounded-[3rem]">
                  <h4 className="text-[10px] font-black text-accent uppercase tracking-[0.2em] mb-4">Quick Take</h4>
                  <p className="text-xl md:text-2xl font-bold text-text leading-relaxed italic">
                    "{selectedArticle.summary}"
                  </p>
                </div>

                <div className="prose prose-slate dark:prose-invert max-w-none text-text/80 px-4 md:px-0">
                  <ReactMarkdown>{selectedArticle.sentinel_take || selectedArticle.content}</ReactMarkdown>
                </div>

                {selectedArticle.verdict && (
                  <div className="mt-12 p-8 bg-accent/5 border border-accent/20 rounded-3xl">
                    <h4 className="text-[10px] font-black text-accent uppercase tracking-[0.3em] mb-4">The Verdict</h4>
                    <p className="text-xl font-bold text-text leading-snug">{selectedArticle.verdict}</p>
                  </div>
                )}

                {/* Sentinel Recommendation Box */}
                {(selectedArticle.title + ' ' + selectedArticle.content + ' ' + selectedArticle.summary).toLowerCase().match(/marketing|crm|growth/) && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-12 p-8 glass-card border-white/20 bg-white/40 dark:bg-white/5 rounded-[2.5rem] relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <TrendingUp className="w-24 h-24 text-text" />
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-accent" />
                        <h4 className="font-bold text-sm uppercase tracking-widest text-text/60">Sentinel Recommendation</h4>
                      </div>
                      <p className="text-text/80 text-lg leading-relaxed mb-6 max-w-xl">
                        To scale your SaaS operations effectively, we recommend <span className="text-text font-black">HubSpot</span>. It's the industry-leading platform for managing your entire customer journey—from marketing automation to sales CRM and growth analytics.
                      </p>
                      <div className="flex items-center justify-between">
                        <a 
                          href="https://www.hubspot.com" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="btn-accent !px-8 !py-3 !text-sm font-bold"
                        >
                          Get Started Free
                        </a>
                        <span className="text-[10px] text-text/30 uppercase font-bold tracking-widest border border-text/10 px-2 py-1 rounded">Partner Link</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-12">
                {/* News Feed */}
                <section className="min-w-0">
                  {/* Liquid Glass Search Bar */}
                  <div className="mb-12 relative group">
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

                  {/* Featured Insight Card for Analysis Page */}
                  {activeTab === 'Market Analysis' && articles.length > 0 && !searchQuery && (
                    <FeaturedInsightCard 
                      article={articles[0]} 
                      onClick={() => setSelectedArticle(articles[0])} 
                    />
                  )}

                  <div className="flex items-center justify-between border-b border-text/5 pb-4 mb-8">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-text">
                      <Activity className="w-5 h-5 text-accent" />
                      Intelligence Feed
                    </h2>
                    <div className="flex gap-2">
                      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                      <span className="text-[10px] font-bold text-text/40 uppercase tracking-widest">Live Updates</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {loading && articles.length === 0 ? (
                      <LiquidGlassSpinner />
                    ) : loading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <motion.div
                          key={`skeleton-${i}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <SkeletonCard />
                        </motion.div>
                      ))
                    ) : filteredArticles.length > 0 ? (
                      filteredArticles.map((article) => (
                        <motion.article 
                          key={article.id}
                          layout
                          initial={{ opacity: 0, y: 30 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true, margin: "-50px" }}
                          whileHover={{ backdropFilter: "blur(40px)" }}
                          className="group glass-card cursor-pointer flex flex-col h-full transition-all duration-500 hover:shadow-2xl hover:shadow-accent/5"
                          onClick={() => setSelectedArticle(article)}
                        >
                          <div className="relative aspect-video overflow-hidden rounded-2xl mb-6">
                            <AnalysisImage 
                              src={article.image_url} 
                              alt={article.title} 
                              rounded="rounded-none"
                              className="!border-none !shadow-none"
                            />
                            <div className="absolute top-3 left-3 flex gap-2 z-20">
                              <span className="text-[10px] font-bold bg-white/60 dark:bg-black/60 text-text px-3 py-1.5 rounded-full uppercase tracking-widest border border-white/20 backdrop-blur-md shadow-sm">
                                {article.category === 'Analysis' ? 'AI Update' : article.category}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex-1 flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                              <span className="text-[10px] font-bold text-text/40 uppercase tracking-widest">{article.source}</span>
                              <span className="text-[10px] font-bold text-text/30">{article.readTime}</span>
                            </div>

                            <h3 className={`text-xl font-black group-hover:text-accent transition-colors leading-tight mb-4 line-clamp-2 ${activeTab === 'Market Analysis' ? 'text-gradient-warm' : ''}`}>
                              {article.title}
                            </h3>
                            
                            <p className="text-sm text-text/60 leading-relaxed line-clamp-3 mb-6 italic">
                              "{article.summary}"
                            </p>

                            <div className="mt-auto pt-6 border-t border-text/5 flex items-center justify-between">
                              <span className="text-[10px] text-text/30 font-bold">{new Date(article.date).toLocaleDateString()}</span>
                              <div className="text-accent font-black text-[10px] uppercase tracking-widest flex items-center gap-1 group-hover:gap-2 transition-all">
                                View Report <ChevronRight className="w-3 h-3" />
                              </div>
                            </div>
                          </div>
                        </motion.article>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-20 glass-panel rounded-[2.5rem] border-dashed border-text/10">
                        <Newspaper className="w-12 h-12 text-text/10 mx-auto mb-4" />
                        <p className="text-text/40 font-bold">No intelligence reports found.</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Right Sidebar Column */}
                <aside className="hidden lg:block space-y-8">
                  {/* Market Ticker Card */}
                  <div className="glass-panel p-8 rounded-[2rem] border border-white/10 shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-accent" />
                        <h4 className="text-xs font-black uppercase tracking-widest text-text/60">Market Pulse</h4>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    </div>
                    <div className="-mx-8 px-8 border-y border-white/5 bg-[var(--color-ticker-bg)]">
                      <MarketTicker />
                    </div>
                    <p className="mt-4 text-[10px] text-text/40 font-bold uppercase tracking-widest text-center">Live SaaS Index Tracking</p>
                  </div>

                  {/* Weekly Intelligence (Subscribe) Card */}
                  <div id="newsletter-card" className="glass-panel p-8 rounded-[2rem] border border-accent/20 shadow-2xl relative overflow-hidden group">
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
                  <div className="glass-panel p-8 rounded-[2rem] border-l-4 border-accent shadow-lg">
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
                  <div className="glass-panel p-8 rounded-[2rem]">
                    <h4 className="font-bold mb-8 flex items-center gap-2 text-sm uppercase tracking-widest text-text/80">
                      <Flame className="w-5 h-5 text-accent" />
                      Trending Analysis
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
            )}
            </AnimatePresence>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-text/10 mt-20 py-12 bg-white/10 dark:bg-black/10 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-12">
              <div className="flex items-center gap-2">
                <Newspaper className="w-6 h-6 text-accent" />
                <span className="font-black text-xl text-text">SaaS Sentinel</span>
              </div>
              
              <div className="flex gap-8 text-xs font-black text-text/30 uppercase tracking-widest">
                {['Twitter', 'LinkedIn', 'GitHub'].map(social => (
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
  </ErrorBoundary>
  );
}
