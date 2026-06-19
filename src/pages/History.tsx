import { useState, useEffect } from 'react';
import { 
  History as HistoryIcon,
  CheckCircle2,
  Layers,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Clock,
  Zap,
  AlertTriangle,
  BarChart4,
  Activity,
  PlayCircle,
  RotateCcw,
  X
} from 'lucide-react';

const API_BASE = `http://${window.location.hostname}:4175`;

const getMarketTimestamp = (slug: string): number => {
  const parts = slug.split('-');
  const lastPart = parts[parts.length - 1];
  const parsed = parseInt(lastPart || '');
  return isNaN(parsed) ? 0 : parsed * 1000;
};

const formatDuration = (ms: number): string => {
  if (!ms || isNaN(ms)) return '0d';
  const sec = Math.floor(ms / 1000);
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  if (hrs > 0) return `${hrs} jam ${mins} menit`;
  if (mins > 0) return `${mins} menit ${secs} detik`;
  return `${secs} detik`;
};

const formatDate = (ms: number): string => {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const formatShortDate = (ms: number): string => {
  if (!ms) return '';
  return new Date(ms).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const normalizeKey = (value?: string): string => {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

const getMarketAsset = (market: any): string => {
  if (market?.asset) return market.asset;
  if (market?.config?.asset) return market.config.asset;
  if (market?.slug) return market.slug.split('-')[0] || 'unknown';
  return 'unknown';
};

const hasKnownAsset = (asset?: string): boolean => {
  const norm = normalizeKey(asset);
  return norm.length > 0 && norm !== 'unknown';
};

const clusterMarketsIntoSessions = (markets: any[]): any[] => {
  const sorted = [...markets].sort((a, b) => getMarketTimestamp(a.slug) - getMarketTimestamp(b.slug));
  const virtualSessions: any[] = [];
  if (sorted.length === 0) return [];
  
  const marketsByKey: Record<string, { strategy: string; asset: string; markets: any[] }> = {};
  sorted.forEach(m => {
    const strat = m.strategyName || 'unknown';
    const asset = getMarketAsset(m);
    const key = `${normalizeKey(strat)}::${normalizeKey(asset)}`;
    if (!marketsByKey[key]) {
      marketsByKey[key] = { strategy: strat, asset, markets: [] };
    }
    marketsByKey[key]!.markets.push(m);
  });
  
  const GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  
  Object.values(marketsByKey).forEach(({ strategy, asset, markets: stratMarkets }) => {
    let currentSessionMarkets: any[] = [stratMarkets[0]];
    
    for (let i = 1; i < stratMarkets.length; i++) {
      const prevMarket = stratMarkets[i - 1]!;
      const curMarket = stratMarkets[i]!;
      const prevTime = getMarketTimestamp(prevMarket.slug);
      const curTime = getMarketTimestamp(curMarket.slug);
      
      if (curTime - prevTime > GAP_THRESHOLD_MS) {
        virtualSessions.push(createVirtualSession(strategy, asset, currentSessionMarkets));
        currentSessionMarkets = [curMarket];
      } else {
        currentSessionMarkets.push(curMarket);
      }
    }
    
    if (currentSessionMarkets.length > 0) {
      virtualSessions.push(createVirtualSession(strategy, asset, currentSessionMarkets));
    }
  });
  
  return virtualSessions.sort((a, b) => b.startTime - a.startTime);
};

const createVirtualSession = (strategy: string, asset: string, markets: any[]): any => {
  const firstTime = getMarketTimestamp(markets[0].slug);
  const lastTime = getMarketTimestamp(markets[markets.length - 1].slug);
  const resolvedAsset = asset || getMarketAsset(markets[0]);
  
  return {
    id: firstTime,
    strategy,
    asset: resolvedAsset,
    startTime: firstTime - 5 * 60 * 1000,
    endTime: lastTime + 5 * 60 * 1000,
    exitCode: 0,
    isVirtual: true
  };
};

const parseMarkdownToHtml = (markdown: string): string => {
  let html = markdown;
  
  // Clean HTML tags first
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
    
  // Headers
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-xl font-bold text-white border-b border-white/10 pb-2 mb-4 mt-6">$1</h1>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold text-white border-b border-white/5 pb-1 mb-3 mt-5">$1</h2>');
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold text-slate-200 mb-2 mt-4">$1</h3>');
  
  // Lists
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-slate-300 text-xs py-0.5">$1</li>');
  
  // Code blocks
  html = html.replace(/```([a-z]*)\n([\s\S]*?)\n```/gim, '<pre class="bg-black/60 border border-white/10 rounded-xl p-4 font-mono text-[10px] text-emerald-400 overflow-x-auto my-3 leading-relaxed">$2</pre>');
  html = html.replace(/~~~([a-z]*)\n([\s\S]*?)\n~~~/gim, '<pre class="bg-black/60 border border-white/10 rounded-xl p-4 font-mono text-[10px] text-emerald-400 overflow-x-auto my-3 leading-relaxed">$2</pre>');
  
  // Tables
  const lines = html.split('\n');
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        lines[i] = '<div class="overflow-x-auto my-4 border border-white/5 rounded-xl"><table class="w-full text-left border-collapse text-xs text-slate-300"><thead class="bg-slate-900/50 text-white font-bold border-b border-white/10"><tr>' + 
          line.split('|').slice(1, -1).map(cell => `<th class="p-3">${cell.trim()}</th>`).join('') + 
          '</tr></thead><tbody class="divide-y divide-white/5">';
      } else {
        if (line.includes('---')) {
          lines[i] = '';
        } else {
          lines[i] = '<tr class="hover:bg-white/5 transition-colors">' + 
            line.split('|').slice(1, -1).map(cell => `<td class="p-3 font-mono">${cell.trim()}</td>`).join('') + 
            '</tr>';
        }
      }
    } else {
      if (inTable) {
        inTable = false;
        lines[i] = '</tbody></table></div>' + lines[i];
      }
    }
  }
  html = lines.join('\n');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
  
  return html;
};

export default function History() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [historyDetail, setHistoryDetail] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'sessions' | 'markets' | 'analytics' | 'changelog'>('sessions');
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Gamma outcomes cache
  const [marketResolutions, setMarketResolutions] = useState<Record<string, any>>({});
  const [fetchingResolutions, setFetchingResolutions] = useState<Record<string, boolean>>({});

  // Logs cache
  const [marketLogs, setMarketLogs] = useState<Record<string, string>>({});
  const [fetchingLogs, setFetchingLogs] = useState<Record<string, boolean>>({});
  const [resettingStrategy, setResettingStrategy] = useState<string | null>(null);
  const [runningDiagnostic, setRunningDiagnostic] = useState<{ strategy: string; type: 'session' | 'full' } | null>(null);
  const [diagnosticReport, setDiagnosticReport] = useState<{ strategy: string; html: string } | null>(null);
  const [changelogData, setChangelogData] = useState<any[]>([]);

  const cleanAnsi = (str: string): string => {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  };

  const fetchMarketLog = async (strategy: string, slug: string) => {
    if (marketLogs[slug] || fetchingLogs[slug]) return;
    setFetchingLogs(prev => ({ ...prev, [slug]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/logs/${strategy}/${slug}`);
      if (res.ok) {
        const text = await res.text();
        setMarketLogs(prev => ({ ...prev, [slug]: text }));
      } else {
        setMarketLogs(prev => ({ ...prev, [slug]: 'Log file not found' }));
      }
    } catch (e) {
      console.error(`Error fetching log for ${slug}:`, e);
      setMarketLogs(prev => ({ ...prev, [slug]: 'Failed to load log file' }));
    } finally {
      setFetchingLogs(prev => ({ ...prev, [slug]: false }));
    }
  };

  const handleToggleMarketExpand = (strategy: string, slug: string) => {
    if (expandedHistoryId === slug) {
      setExpandedHistoryId(null);
    } else {
      setExpandedHistoryId(slug);
      fetchMarketLog(strategy, slug);
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      // Fetch sessions from Redis
      const resSessions = await fetch(`${API_BASE}/api/history`);
      const sessionsData = await resSessions.json();
      
      // Fetch detailed completed markets
      const resMarkets = await fetch(`${API_BASE}/api/history-detail`);
      const marketsData = await resMarkets.json();

      // Fetch active process status so session cards can show whether their
      // latest strategy/asset session is still running.
      const resStatus = await fetch(`${API_BASE}/api/status`);
      const statusData = await resStatus.json();
      const runningKeys = new Set<string>();
      Object.values(statusData || {}).forEach((proc: any) => {
        if (!proc?.isRunning) return;
        const strategy = proc.config?.strategy;
        const asset = proc.config?.asset;
        if (strategy && asset) runningKeys.add(`${normalizeKey(strategy)}:${normalizeKey(asset)}`);
      });
      
      // Group markets into sessions automatically to catch CLI runs & missing records
      const virtualSessions = clusterMarketsIntoSessions(marketsData);
      
      // 1. Map all Redis sessions into target format
      const redisSessionsMapped = sessionsData.map((rSession: any) => {
        const startTime = rSession.startTime || rSession.config?.startTime || rSession.id;
        const endTime = rSession.endTime || startTime;
        return {
          id: rSession.id || startTime,
          strategy: rSession.strategy || rSession.config?.strategy,
          asset: rSession.asset || rSession.config?.asset || 'unknown',
          startTime: startTime,
          endTime: endTime,
          exitCode: rSession.exitCode !== undefined ? rSession.exitCode : 0,
          config: rSession.config || null,
          stats: rSession.stats || null,
          isVirtual: false
        };
      });

      // 2. Extract virtual sessions from completed markets that don't match any Redis session
      const unmatchedVirtualSessions = virtualSessions.filter(vSession => {
        const hasMatch = sessionsData.some((rSession: any) => {
          if (normalizeKey(rSession.strategy) !== normalizeKey(vSession.strategy)) return false;
          const rAsset = rSession.asset || rSession.config?.asset;
          if (hasKnownAsset(rAsset) && hasKnownAsset(vSession.asset)) {
            if (normalizeKey(rAsset) !== normalizeKey(vSession.asset)) return false;
          }
          const rStart = rSession.startTime || rSession.config?.startTime;
          if (!rStart) return false;
          return Math.abs(rStart - vSession.startTime) < 10 * 60 * 1000;
        });
        return !hasMatch;
      });

      // 3. Combine both and sort by startTime descending. Mark only the latest
      // session per running strategy/asset as RUNNING; older sessions remain settled.
      const combinedSessionsBase = [...redisSessionsMapped, ...unmatchedVirtualSessions].sort((a, b) => b.startTime - a.startTime);
      const seenRunningKeys = new Set<string>();
      const combinedSessions = combinedSessionsBase.map((session: any) => {
        const key = `${normalizeKey(session.strategy)}:${normalizeKey(session.asset)}`;
        const isRunning = runningKeys.has(key) && !seenRunningKeys.has(key);
        if (isRunning) seenRunningKeys.add(key);
        return { ...session, isRunning };
      });

      setSessions(combinedSessions);
      setHistoryDetail(marketsData);
      
      try {
        const resChangelog = await fetch(`${API_BASE}/api/changelog`);
        if (resChangelog.ok) {
          const changelog = await resChangelog.json();
          setChangelogData(changelog);
        }
      } catch (err) {
        console.error("Failed to fetch changelog", err);
      }
    } catch (e) {
      console.error("Error fetching history data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = window.setInterval(fetchData, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const handleResetState = async (strategy: string, asset: string) => {
    const confirm = window.confirm(`Apakah Anda yakin ingin me-reset state untuk strategi "${strategy}" (${asset})?\n\nIni akan menghapus P&L sesi dan riwayat market.`);
    if (!confirm) return;
    
    setResettingStrategy(strategy);
    try {
      const res = await fetch(`${API_BASE}/api/reset-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, asset })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`State untuk strategi "${strategy}" (${asset}) berhasil di-reset!`);
        fetchData();
      } else {
        alert(`Gagal me-reset state: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan koneksi saat me-reset state.');
    } finally {
      setResettingStrategy(null);
    }
  };

  const handleRunDiagnostic = async (strategy: string, asset: string, startTime?: number) => {
    const type = startTime ? 'session' : 'full';
    setRunningDiagnostic({ strategy, type });
    try {
      const res = await fetch(`${API_BASE}/api/run-diagnostic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, startTime, asset })
      });
      const data = await res.json();
      if (res.ok) {
        const html = parseMarkdownToHtml(data.report);
        setDiagnosticReport({ strategy, html });
      } else {
        alert(`Gagal menjalankan diagnostic: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan koneksi saat menjalankan diagnostic.');
    } finally {
      setRunningDiagnostic(null);
    }
  };

  const fetchMarketResolution = async (slug: string) => {
    if (marketResolutions[slug] || fetchingResolutions[slug]) return;
    setFetchingResolutions(prev => ({ ...prev, [slug]: true }));
    try {
      const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
      if (res.ok) {
        const events = await res.json();
        const event = events?.[0];
        const market = event?.markets?.[0];
        if (market) {
          setMarketResolutions(prev => ({ ...prev, [slug]: market }));
        }
      }
    } catch (e) {
      console.error(`Error fetching Gamma resolution for ${slug}:`, e);
    } finally {
      setFetchingResolutions(prev => ({ ...prev, [slug]: false }));
    }
  };

  const getSessionMarkets = (session: any) => {
    const sessionAsset = session?.asset;
    const shouldMatchAsset = hasKnownAsset(sessionAsset);
    return historyDetail.filter((m: any) => {
      // Normalise strategyName comparisons
      const mStrat = normalizeKey(m.strategyName);
      const sStrat = normalizeKey(session.strategy);
      if (mStrat !== sStrat) return false;
      if (shouldMatchAsset) {
        const mAsset = normalizeKey(getMarketAsset(m));
        const sAsset = normalizeKey(sessionAsset);
        if (mAsset !== sAsset) return false;
      }

      const marketTime = getMarketTimestamp(m.slug);
      // Include buffer of 30 seconds for round timing margins
      return marketTime >= (session.startTime - 30000) && marketTime <= (session.endTime + 30000);
    });
  };

  const getMarketAnalysis = (market: any) => {
    const resolution = marketResolutions[market.slug];
    const buyOrder = market.orderHistory?.find((o: any) => o.action === 'buy');
    const sellOrder = market.orderHistory?.find((o: any) => o.action === 'sell');

    if (!market.orderHistory || market.orderHistory.length === 0) {
      return { status: 'SKIPPED', label: 'Dilewati (Skip)', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
    }

    if (!resolution) {
      return { status: 'LOADING', label: 'Memeriksa Gamma...', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20 animate-pulse' };
    }

    if (!resolution.closed) {
      return { status: 'PENDING', label: 'Belum Selesai (Pending)', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
    }

    try {
      const clobTokenIds = JSON.parse(resolution.clobTokenIds);
      const outcomePrices = JSON.parse(resolution.outcomePrices);
      const winIdx = outcomePrices.findIndex((p: string) => p === "1.00" || p === "1");

      if (winIdx !== -1 && buyOrder) {
        const winningTokenId = clobTokenIds[winIdx];
        const boughtTokenWon = buyOrder.tokenId === winningTokenId;
        const hasEarlyExit = !!sellOrder;
        const isLoss = market.pnl < 0;

        if (hasEarlyExit) {
          if (isLoss) {
            if (boughtTokenWon) {
              return { status: 'FALSE_EXIT', label: 'False Exit ⚠️', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
            } else {
              return { status: 'CORRECT_EXIT', label: 'Correct Exit ✅', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' };
            }
          } else {
            return { status: 'PROFIT_TAKE', label: 'Profit Take 💰', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
          }
        } else {
          if (boughtTokenWon) {
            return { status: 'MATURITY_WIN', label: 'Maturity Win 🏆', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
          } else {
            return { status: 'MATURITY_LOSS', label: 'Maturity Loss ❌', color: 'text-red-400 bg-red-500/10 border-red-500/20' };
          }
        }
      }
    } catch (e) {}

    return { status: 'RESOLVED', label: 'Telesolusi', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
  };

  const getSessionStats = (sessionMarkets: any[]) => {
    const entered = sessionMarkets.filter(m => m.orderHistory && m.orderHistory.length > 0);
    const skipped = sessionMarkets.filter(m => !m.orderHistory || m.orderHistory.length === 0);
    const wins = entered.filter(m => m.pnl > 0);
    const winrate = entered.length > 0 ? (wins.length / entered.length) * 100 : 0;
    const totalPnl = sessionMarkets.reduce((acc, m) => acc + (m.pnl || 0), 0);

    let falseExits = 0;
    entered.forEach(m => {
      const analysis = getMarketAnalysis(m);
      if (analysis.status === 'FALSE_EXIT') {
        falseExits++;
      }
    });

    return {
      total: sessionMarkets.length,
      entered: entered.length,
      skipped: skipped.length,
      pnl: totalPnl,
      winrate,
      falseExits
    };
  };

  const handleExpandSession = (sessionId: number, sessionMarkets: any[]) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
    } else {
      setExpandedSessionId(sessionId);
      // Fetch Gamma outcomes for entered trades in this session
      sessionMarkets.forEach(m => {
        if (m.orderHistory && m.orderHistory.length > 0) {
          fetchMarketResolution(m.slug);
        }
      });
    }
  };

  // Compile overall sorted markets for analytics
  const sortedMarkets = [...historyDetail].sort((a, b) => getMarketTimestamp(a.slug) - getMarketTimestamp(b.slug));
  let cumulativePnl = 0;
  const pnlPoints = sortedMarkets.map(m => {
    cumulativePnl += m.pnl || 0;
    return {
      slug: m.slug,
      pnl: cumulativePnl
    };
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Tab Navigation */}
      <div className="flex bg-slate-900/50 backdrop-blur-xl border border-white/5 p-1.5 rounded-2xl max-w-xl">
        {[
          { id: 'sessions', label: 'Sesi Trading', icon: <PlayCircle className="w-4 h-4" /> },
          { id: 'markets', label: 'Semua Market', icon: <Layers className="w-4 h-4" /> },
          { id: 'analytics', label: 'Analisis Performa', icon: <BarChart4 className="w-4 h-4" /> },
          { id: 'changelog', label: 'Tuning & Pembaruan', icon: <HistoryIcon className="w-4 h-4" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-20 text-center text-slate-500 flex flex-col items-center shadow-xl">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="animate-pulse tracking-widest text-xs font-bold uppercase text-slate-300">Menghubungkan & Memuat Log Histori...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: SESSIONS VIEW */}
          {activeTab === 'sessions' && (
            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 min-h-[60vh] shadow-xl animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                <h2 className="text-2xl font-bold flex items-center gap-3 text-white">
                  <HistoryIcon className="w-6 h-6 text-purple-500" /> Riwayat Sesi Trading
                </h2>
                <span className="text-xs font-bold text-slate-500 bg-black/40 px-4 py-2 rounded-full border border-white/5 shadow-inner">
                  {sessions.length} Sesi Tercatat
                </span>
              </div>

              {sessions.length === 0 ? (
                <div className="text-center py-20 opacity-50">
                  <HistoryIcon className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="italic text-slate-400">Belum ada sesi trading yang selesai.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sessions.map((session, idx) => {
                    const isExpanded = expandedSessionId === session.id;
                    const sessionMarkets = getSessionMarkets(session);
                    
                    // Derive stats with fallback to Redis persisted stats
                    const hasLiveMarkets = sessionMarkets.length > 0;
                    const stats = getSessionStats(sessionMarkets);
                    const finalStats = {
                      total: hasLiveMarkets ? stats.total : (session.stats?.trades || 0),
                      entered: hasLiveMarkets ? stats.entered : (session.stats?.trades || 0),
                      skipped: hasLiveMarkets ? stats.skipped : 0,
                      pnl: hasLiveMarkets ? stats.pnl : (session.stats?.pnl || 0),
                      winrate: hasLiveMarkets ? stats.winrate : 0,
                      falseExits: hasLiveMarkets ? stats.falseExits : 0
                    };
                    
                    const duration = session.endTime - session.startTime;
                    const isWin = finalStats.pnl >= 0;

                    return (
                      <div key={session.id || idx} className="border border-white/5 bg-black/40 rounded-2xl overflow-hidden transition-all hover:border-purple-500/20">
                        {/* Header Row */}
                        <div 
                          onClick={() => handleExpandSession(session.id, sessionMarkets)}
                          className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 cursor-pointer hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-5">
                            <div className={`p-4 rounded-xl ${isWin ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                              {isWin ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                            </div>
                            <div>
                              <h3 className="font-bold text-white uppercase tracking-wider text-base flex items-center gap-2 flex-wrap">
                                {session.strategy} 
                                <span className="text-xs font-medium text-pink-500 border border-pink-500/20 px-2 py-0.5 rounded bg-pink-500/5">{session.asset}</span>
                                <span className={`text-[10px] font-black border px-2.5 py-1 rounded-full flex items-center gap-1 ${session.isRunning ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-slate-400 border-white/10 bg-white/5'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${session.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                                  {session.isRunning ? 'RUNNING' : 'SETTLED'}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResetState(session.strategy, session.asset);
                                  }}
                                  disabled={resettingStrategy === session.strategy}
                                  className="text-[10px] font-bold text-red-400 border border-red-500/30 hover:border-red-400 hover:text-white px-2.5 py-1 rounded bg-red-500/5 hover:bg-red-500/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all ml-2 flex items-center gap-1 cursor-pointer"
                                >
                                  <RotateCcw className={`w-3 h-3 ${resettingStrategy === session.strategy ? 'animate-spin' : ''}`} />
                                  {resettingStrategy === session.strategy ? 'Resetting...' : 'Reset State'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRunDiagnostic(session.strategy, session.asset, session.startTime);
                                  }}
                                  disabled={!!runningDiagnostic}
                                  className="text-[10px] font-bold text-purple-400 border border-purple-500/30 hover:border-purple-400 hover:text-white px-2.5 py-1 rounded bg-purple-500/5 hover:bg-purple-500/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all ml-2 flex items-center gap-1 cursor-pointer"
                                >
                                  <Zap className={`w-3 h-3 ${runningDiagnostic?.strategy === session.strategy && runningDiagnostic?.type === 'session' ? 'animate-spin' : ''}`} />
                                  {runningDiagnostic?.strategy === session.strategy && runningDiagnostic?.type === 'session' ? 'Analyzing Sesi...' : 'Diag Sesi'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRunDiagnostic(session.strategy, session.asset);
                                  }}
                                  disabled={!!runningDiagnostic}
                                  className="text-[10px] font-bold text-blue-400 border border-blue-500/30 hover:border-blue-400 hover:text-white px-2.5 py-1 rounded bg-blue-500/5 hover:bg-blue-500/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all ml-2 flex items-center gap-1 cursor-pointer"
                                >
                                  <Zap className={`w-3 h-3 ${runningDiagnostic?.strategy === session.strategy && runningDiagnostic?.type === 'full' ? 'animate-spin' : ''}`} />
                                  {runningDiagnostic?.strategy === session.strategy && runningDiagnostic?.type === 'full' ? 'Analyzing Full...' : 'Diag Full'}
                                </button>
                              </h3>
                              <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-2.5 font-medium">
                                <Clock className="w-3.5 h-3.5 text-purple-400" /> {formatDate(session.startTime)}
                                <span className="text-slate-700">|</span> Durasi: {session.isRunning ? 'masih berjalan' : formatDuration(duration)}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center">
                            <div className="text-center md:text-left">
                              <div className="text-xs font-mono text-slate-300">
                                <span className="text-emerald-400">{finalStats.entered}</span>
                                <span className="text-slate-600"> / </span>
                                <span className="text-slate-400">{finalStats.skipped}</span>
                              </div>
                              <div className="text-[8px] uppercase tracking-wider font-bold text-slate-500 mt-1">Entry / Skip</div>
                            </div>

                            <div className="text-center md:text-left">
                              <div className="text-sm font-mono text-white">{finalStats.winrate.toFixed(0)}%</div>
                              <div className="text-[8px] uppercase tracking-wider font-bold text-slate-500 mt-1">Win Rate</div>
                            </div>

                            <div className="text-center md:text-left">
                              <div className="flex items-center justify-center md:justify-start gap-1">
                                <span className="text-sm font-mono text-white">{finalStats.falseExits}</span>
                                {finalStats.falseExits > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />}
                              </div>
                              <div className="text-[8px] uppercase tracking-wider font-bold text-slate-500 mt-1">False Exit</div>
                            </div>

                            <div className="text-right">
                              <div className={`text-base font-black ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isWin ? '+' : ''}{finalStats.pnl.toFixed(2)} USDC
                              </div>
                              <div className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-widest">Total P&L</div>
                            </div>
                          </div>
                          
                          <div className="bg-white/5 p-2 rounded-lg self-center hidden md:block">
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="p-6 border-t border-white/5 bg-slate-900/50 space-y-6">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <Activity className="w-4 h-4 text-purple-400" /> Hasil Akhir Analisis Market Sesi
                            </h4>

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              {[
                                { label: 'Total Markets', value: finalStats.total, color: 'text-white' },
                                { label: 'Entry Trades', value: finalStats.entered, color: 'text-blue-400' },
                                { label: 'Skip Trades', value: finalStats.skipped, color: 'text-slate-400' },
                                { label: 'Win Rate', value: `${finalStats.winrate.toFixed(1)}%`, color: 'text-purple-400' },
                                { label: 'False Exits ⚠️', value: finalStats.falseExits, color: finalStats.falseExits > 0 ? 'text-amber-400' : 'text-slate-400' }
                              ].map((item, idx) => (
                                <div key={idx} className="bg-black/35 border border-white/5 rounded-xl p-4 text-center">
                                  <div className={`text-2xl font-black ${item.color}`}>{item.value}</div>
                                  <div className="text-[8px] uppercase tracking-wider text-slate-500 font-bold mt-1.5">{item.label}</div>
                                </div>
                              ))}
                            </div>

                             <div className="space-y-3 mt-4">
                               {(() => {
                                 const executedMarkets = sessionMarkets.filter(m => m.orderHistory && m.orderHistory.length > 0);
                                 if (executedMarkets.length === 0) {
                                   return <p className="text-xs text-slate-500 italic text-center p-4">Tidak ada trade yang dieksekusi dalam sesi ini.</p>;
                                 }
                                 return executedMarkets.map((market: any, mIdx: number) => {
                                   const isMExpanded = expandedHistoryId === market.slug;
                                   const analysis = getMarketAnalysis(market);
                                   const isMWin = market.pnl >= 0;

                                   return (
                                     <div key={market.slug || mIdx} className="bg-black/25 border border-white/5 rounded-xl overflow-hidden">
                                       <div 
                                         onClick={(e) => {
                                           e.stopPropagation();
                                           handleToggleMarketExpand(market.strategyName, market.slug);
                                         }}
                                         className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                                       >
                                         <div className="flex items-center gap-4">
                                           <div>
                                             <h5 className="font-mono text-xs font-bold text-white uppercase">{market.slug}</h5>
                                             <p className="text-[9px] text-slate-500 mt-1">{formatDate(getMarketTimestamp(market.slug))}</p>
                                           </div>
                                         </div>

                                         <div className="flex items-center gap-4">
                                           <span className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border ${analysis.color}`}>
                                             {analysis.label}
                                           </span>
                                           <div className={`text-sm font-black ${isMWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                             {market.pnl > 0 ? '+' : ''}{market.pnl.toFixed(2)} USDC
                                           </div>
                                         </div>
                                       </div>

                                       {/* Collapsible Order History for Market */}
                                       {isMExpanded && (
                                         <div className="p-4 border-t border-white/5 bg-slate-950/40 space-y-2">
                                           <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black block">Log Eksekusi Order</span>
                                           {(!market.orderHistory || market.orderHistory.length === 0) ? (
                                             <p className="text-xs text-slate-500 italic">Bot tidak melakukan eksekusi trade di slot ini (Dilewati).</p>
                                           ) : (
                                             market.orderHistory.map((order: any, oIdx: number) => (
                                               <div key={oIdx} className="flex justify-between items-center bg-black/45 border border-white/5 rounded-lg p-3 text-xs font-mono">
                                                 <div className="flex items-center gap-3">
                                                   <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${order.action === 'buy' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/10' : 'bg-orange-500/10 text-orange-400 border border-orange-500/10'}`}>
                                                     {order.action}
                                                   </span>
                                                   <span className="text-white font-bold">{order.shares} lembar</span>
                                                   <span className="text-slate-600">@</span>
                                                   <span className="text-white">${order.price}</span>
                                                 </div>
                                                 <span className="text-slate-400 font-bold">${(order.shares * order.price).toFixed(2)}</span>
                                               </div>
                                             ))
                                           )}
                                           <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
                                              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black block">Raw Terminal Execution Log</span>
                                              {fetchingLogs[market.slug] ? (
                                                <div className="p-4 bg-black/60 rounded-xl border border-white/5 text-center flex items-center justify-center gap-2">
                                                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                                  <p className="text-xs text-slate-400 animate-pulse font-mono">Loading terminal log...</p>
                                                </div>
                                              ) : (
                                                <pre className="p-4 bg-black border border-white/10 rounded-xl text-[10px] font-mono text-emerald-400/90 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed shadow-inner">
                                                  {marketLogs[market.slug] ? cleanAnsi(marketLogs[market.slug]) : 'No log details available.'}
                                                </pre>
                                              )}
                                            </div>
                                         </div>
                                       )}
                                     </div>
                                   );
                                 });
                               })()}
                             </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ORIGINAL MARKETS VIEW */}
          {activeTab === 'markets' && (
            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 min-h-[60vh] shadow-xl animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                <h2 className="text-2xl font-bold flex items-center gap-3 text-white">
                  <Layers className="w-6 h-6 text-purple-500" /> Semua Market Tercatat
                </h2>
                <span className="text-xs font-bold text-slate-500 bg-black/40 px-4 py-2 rounded-full border border-white/5 shadow-inner">
                  {historyDetail.filter(m => m.orderHistory && m.orderHistory.length > 0).length} Trades
                </span>
              </div>

              <div className="space-y-4">
                {(() => {
                  const executedAll = historyDetail.filter(m => m.orderHistory && m.orderHistory.length > 0);
                  if (executedAll.length === 0) {
                    return (
                      <div className="text-center py-20 opacity-50">
                        <HistoryIcon className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                        <p className="italic text-slate-400">Belum ada trade yang dieksekusi.</p>
                      </div>
                    );
                  }
                  return executedAll.map((market: any, idx: number) => {
                    const isExpanded = expandedHistoryId === market.slug;
                    const pnl = market.pnl || 0;
                    const isWin = pnl >= 0;

                    return (
                      <div key={market.slug || idx} className="border border-white/5 bg-black/40 rounded-2xl overflow-hidden transition-all hover:border-purple-500/10">
                        <div 
                          onClick={() => handleToggleMarketExpand(market.strategyName, market.slug)}
                          className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-5">
                            <div className={`p-4 rounded-xl ${isWin ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                              {isWin ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                            </div>
                            <div>
                              <h3 className="font-mono font-bold text-white uppercase tracking-wider text-sm">{market.slug}</h3>
                              <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-2 font-medium">
                                <Layers className="w-3.5 h-3.5 text-purple-400" /> {market.strategyName}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-8">
                            <div className="text-right">
                              <div className={`text-lg font-black ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isWin ? '+' : ''}{pnl.toFixed(2)} USDC
                              </div>
                              <div className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">Net Result</div>
                            </div>
                            <div className="bg-white/5 p-2 rounded-lg">
                              {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-300" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-6 border-t border-white/5 bg-slate-900/50">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Log Eksekusi Order</h4>
                            {(!market.orderHistory || market.orderHistory.length === 0) ? (
                              <div className="p-4 bg-black/30 rounded-xl border border-white/5 text-center">
                                <p className="text-xs text-slate-500 italic">Tidak ada trade yang dieksekusi pada slot ini.</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {market.orderHistory.map((order: any, i: number) => (
                                  <div key={i} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-black/40 border border-white/5 rounded-xl text-sm font-mono hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-4 mb-3 md:mb-0">
                                      <span className={`px-3 py-1.5 rounded-lg font-bold uppercase text-[10px] tracking-wider ${order.action === 'buy' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' : 'bg-orange-500/20 text-orange-400 border border-orange-500/20'}`}>
                                        {order.action}
                                      </span>
                                      <span className="text-slate-300">Token: <span className="text-white font-bold">{order.shares}</span></span>
                                      <span className="text-slate-600">@</span>
                                      <span className="text-white font-bold">${order.price}</span>
                                    </div>
                                    <div className="flex items-center gap-6 text-slate-400">
                                      <span className="bg-black/50 px-3 py-1 rounded-lg">Total: <span className="text-white font-medium">${(order.shares * order.price).toFixed(2)}</span></span>
                                      {order.status === 'filled' || !order.status ? (
                                        <span className="text-emerald-500 flex items-center gap-1.5 text-xs font-bold uppercase"><CheckCircle2 className="w-4 h-4"/> Filled</span>
                                      ) : (
                                        <span className="text-slate-500 flex items-center gap-1.5 text-xs font-bold uppercase">{order.status}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
                              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black block">Raw Terminal Execution Log</span>
                              {fetchingLogs[market.slug] ? (
                                <div className="p-4 bg-black/60 rounded-xl border border-white/5 text-center flex items-center justify-center gap-2">
                                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                  <p className="text-xs text-slate-400 animate-pulse font-mono">Loading terminal log...</p>
                                </div>
                              ) : (
                                <pre className="p-4 bg-black border border-white/10 rounded-xl text-[10px] font-mono text-emerald-400/90 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed shadow-inner">
                                  {marketLogs[market.slug] ? cleanAnsi(marketLogs[market.slug]) : 'No log details available.'}
                                </pre>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* TAB 3: PERFORMANCE ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 min-h-[60vh] shadow-xl animate-in fade-in duration-300 space-y-8">
              <div className="flex items-center justify-between border-b border-white/5 pb-6">
                <h2 className="text-2xl font-bold flex items-center gap-3 text-white">
                  <BarChart4 className="w-6 h-6 text-purple-500" /> Analisis Performa Strategi
                </h2>
              </div>

              {/* Aggregated KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: 'Total Keuntungan / Kerugian', value: `${cumulativePnl >= 0 ? '+' : ''}${cumulativePnl.toFixed(2)} USDC`, color: cumulativePnl >= 0 ? 'text-emerald-400' : 'text-red-400', desc: 'Akumulasi P&L dari semua market', icon: <Activity className="w-6 h-6" /> },
                  { label: 'Total Sesi Dijalankan', value: sessions.length, color: 'text-blue-400', desc: 'Jumlah total bot running sessions', icon: <PlayCircle className="w-6 h-6" /> },
                  { label: 'Aktivitas Trade', value: `${historyDetail.filter(m => m.orderHistory?.length > 0).length} / ${historyDetail.length}`, color: 'text-purple-400', desc: 'Jumlah Market Dieksekusi / Dilewati', icon: <Zap className="w-6 h-6" /> }
                ].map((kpi, idx) => (
                  <div key={idx} className="bg-black/45 border border-white/5 rounded-2xl p-6 flex items-start gap-4 hover:border-purple-500/25 transition-all">
                    <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl">
                      {kpi.icon}
                    </div>
                    <div>
                      <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">{kpi.label}</div>
                      <div className={`text-2xl font-black mt-2 ${kpi.color}`}>{kpi.value}</div>
                      <div className="text-xs text-slate-500 mt-1 italic font-medium">{kpi.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Cumulative PNL Graph */}
              {pnlPoints.length > 1 && (
                <div className="bg-black/35 border border-white/5 rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-widest">Kurva Akumulasi Profit (P&L Trend)</h3>
                  <div className="w-full relative overflow-hidden bg-slate-950/20 rounded-xl border border-white/5 p-4">
                    <svg viewBox="0 0 500 150" className="w-full h-48 overflow-visible">
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25"/>
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0"/>
                        </linearGradient>
                      </defs>
                      
                      {/* Zero baseline */}
                      {(() => {
                        const minVal = Math.min(0, ...pnlPoints.map(p => p.pnl));
                        const maxVal = Math.max(1, ...pnlPoints.map(p => p.pnl));
                        const range = maxVal - minVal;
                        const yZero = 150 - 20 - ((0 - minVal) / (range || 1)) * 110;
                        return (
                          <line x1="20" y1={yZero} x2="480" y2={yZero} stroke="#ffffff" strokeOpacity="0.1" strokeDasharray="3,3" strokeWidth="1" />
                        );
                      })()}

                      {/* Line points rendering */}
                      {(() => {
                        const minVal = Math.min(0, ...pnlPoints.map(p => p.pnl));
                        const maxVal = Math.max(1, ...pnlPoints.map(p => p.pnl));
                        const range = maxVal - minVal;
                        const points = pnlPoints.map((p, i) => {
                          const x = 20 + (i / (pnlPoints.length - 1 || 1)) * 460;
                          const y = 150 - 20 - ((p.pnl - minVal) / (range || 1)) * 110;
                          return `${x},${y}`;
                        }).join(' ');

                        return (
                          <>
                            <polyline fill="none" stroke="#8b5cf6" strokeWidth="2.5" points={points} />
                            <path d={`M 20,130 L ${points} L 480,130 Z`} fill="url(#chartGrad)" />
                          </>
                        );
                      })()}
                      {pnlPoints.length > 0 && (
                        <>
                          <text x="20" y="145" fill="#64748b" fontSize="7.5" fontWeight="bold" textAnchor="start">
                            {formatShortDate(getMarketTimestamp(pnlPoints[0].slug))}
                          </text>
                          {pnlPoints.length > 2 && (
                            <text x="250" y="145" fill="#64748b" fontSize="7.5" fontWeight="bold" textAnchor="middle">
                              {formatShortDate(getMarketTimestamp(pnlPoints[Math.floor(pnlPoints.length / 2)].slug))}
                            </text>
                          )}
                          <text x="480" y="145" fill="#64748b" fontSize="7.5" fontWeight="bold" textAnchor="end">
                            {formatShortDate(getMarketTimestamp(pnlPoints[pnlPoints.length - 1].slug))}
                          </text>
                        </>
                      )}
                    </svg>
                    <div className="flex justify-between text-[9px] text-slate-500 font-bold uppercase mt-2 px-4">
                      <span>Market Terlama</span>
                      <span>Total Kumulatif P&L Trend</span>
                      <span>Market Terbaru</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Strategy Comparison Grid */}
              <div className="bg-black/35 border border-white/5 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">Performa Berdasarkan Strategi</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Array.from(new Set(historyDetail.map((m: any) => m.strategyName).filter(Boolean))).map(strat => {
                    const stratMarkets = historyDetail.filter(m => m.strategyName === strat);
                    const entered = stratMarkets.filter(m => m.orderHistory?.length > 0);
                    const wins = entered.filter(m => m.pnl > 0);
                    const winrate = entered.length > 0 ? (wins.length / entered.length) * 100 : 0;
                    const pnl = stratMarkets.reduce((acc, m) => acc + (m.pnl || 0), 0);

                    return (
                      <div key={strat} className="bg-black/40 border border-white/5 rounded-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="text-base font-bold text-white uppercase">{strat}</h4>
                          <span className={`text-base font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} USDC
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                            <div className="text-lg font-mono text-white">{stratMarkets.length}</div>
                            <div className="text-[8px] uppercase tracking-wider text-slate-500 font-bold mt-1">Total Markets</div>
                          </div>
                          <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                            <div className="text-lg font-mono text-blue-400">{entered.length}</div>
                            <div className="text-[8px] uppercase tracking-wider text-slate-500 font-bold mt-1">Trades Entered</div>
                          </div>
                          <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                            <div className="text-lg font-mono text-purple-400">{winrate.toFixed(0)}%</div>
                            <div className="text-[8px] uppercase tracking-wider text-slate-500 font-bold mt-1">Win Rate</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: STRATEGY CHANGELOG */}
          {activeTab === 'changelog' && (
            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 min-h-[60vh] shadow-xl animate-in fade-in duration-300 space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-6">
                <h2 className="text-2xl font-bold flex items-center gap-3 text-white">
                  <HistoryIcon className="w-6 h-6 text-purple-500" /> Log Penyetelan & Pembaruan Strategi
                </h2>
                <span className="text-xs font-bold text-slate-500 bg-black/40 px-4 py-2 rounded-full border border-white/5 shadow-inner">
                  {changelogData.length} Catatan Rilis
                </span>
              </div>

              {changelogData.length === 0 ? (
                <div className="text-center py-20 opacity-50">
                  <HistoryIcon className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="italic text-slate-400">Belum ada catatan pembaruan yang dimuat.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {changelogData.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="border border-white/5 bg-black/40 rounded-2xl p-6 hover:border-purple-500/25 transition-all space-y-4"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 flex-wrap">
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md border ${
                            item.type === 'tuning' 
                              ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' 
                              : 'text-purple-400 bg-purple-500/10 border-purple-500/20'
                          }`}>
                            {item.type}
                          </span>
                          <div>
                            <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                              {item.strategy} <span className="text-xs font-medium text-pink-500 border border-pink-500/20 px-2 py-0.5 rounded bg-pink-500/5">{item.version}</span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-1 font-medium">{item.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-mono text-slate-400 bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg">
                            {item.date}
                          </span>
                        </div>
                      </div>
                      <div className="border-t border-white/5 pt-4 space-y-2">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black block mb-2">Daftar Perubahan (Tuning Notes)</span>
                        <ul className="space-y-2">
                          {item.changes.map((change: string, cIdx: number) => (
                            <li key={cIdx} className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed">
                              <span className="text-purple-400 mt-1 select-none">•</span>
                              <span>{change}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Diagnostic Report Modal */}
      {diagnosticReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Hasil Diagnostik Market Regime</h3>
                  <p className="text-xs text-slate-400">Strategi: <span className="font-mono text-purple-400 font-bold">{diagnosticReport.strategy}</span></p>
                </div>
              </div>
              <button
                onClick={() => setDiagnosticReport(null)}
                className="p-2 hover:bg-white/5 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div 
                className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: diagnosticReport.html }}
              />
            </div>
            {/* Modal Footer */}
            <div className="p-6 border-t border-white/5 bg-slate-950/20 flex justify-end">
              <button
                onClick={() => setDiagnosticReport(null)}
                className="px-6 py-2.5 bg-purple-500 text-white rounded-xl text-xs font-bold hover:bg-purple-600 transition-all shadow-lg shadow-purple-500/20 cursor-pointer"
              >
                Tutup Laporan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
