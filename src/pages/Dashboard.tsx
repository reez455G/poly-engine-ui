import { useState, useEffect, cloneElement } from 'react';
import type { ReactElement } from 'react';
import { 
  Zap, 
  Activity, 
  ShieldAlert, 
  Target,
  PlayCircle,
  Square,
  TrendingUp,
  Wallet,
  Settings2,
  Radio,
  Clock,
  Layers,
  BookOpen,
  HelpCircle,
  ExternalLink,
  RotateCcw
} from 'lucide-react';

const API_BASE = `http://${window.location.hostname}:4175`;

const AVAILABLE_STRATEGIES = [
  'simulation', 'late-entry', 'steady-scalp', 'iron-lock', 
  'late-down', 'late-down-v2', 'certainty-sweeper', 'certainty-sweeper-mid', 'sweeper-adaptive', 'sweeper-adaptive-exclude-btc', 'sweeper-adaptive-xrp', 'sweeper-adaptive-eth', 'sweeper-adaptive-sol', 'sweeper-adaptive-doge', 'sweeper-adaptive-bnb', 'sure-win-sniper'
];

const AVAILABLE_TICKERS = ['btc', 'eth', 'xrp', 'sol', 'doge', 'bnb'];
const AVAILABLE_TICKER_SOURCES = ['binance', 'chainlink', 'coinbase', 'polymarket', 'okx', 'bybit'];

const marketTimeFromSlug = (slug?: string) => {
  const match = slug?.match(/-(\d{10})$/);
  if (!match) return '—';
  const startMs = Number(match[1]) * 1000;
  const endMs = startMs + 5 * 60 * 1000;
  return `${new Date(startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}-${new Date(endMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const formatTickerPrice = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
};

const formatTimeRunning = (startTime?: number) => {
  if (!startTime) return '—';
  const diffMs = Date.now() - startTime;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'running just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `running ${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  const diffHr = Math.floor(diffMin / 60);
  const remainingMin = diffMin % 60;
  if (diffHr < 24) {
    return `running ${diffHr} hour${diffHr !== 1 ? 's' : ''} ${remainingMin}m ago`;
  }
  const diffDay = Math.floor(diffHr / 24);
  return `running ${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
};

const PARAM_METADATA: Record<string, Record<string, { label: string, step: string, min: string }>> = {
  'steady-scalp': {
    minEntryNotional: { label: 'Min Entry Notional ($)', step: '0.01', min: '0.1' },
    stopLossLimit: { label: 'Stop Loss Limit (Ratio)', step: '0.01', min: '0.01' },
    profitTarget: { label: 'Profit Target (Ratio)', step: '0.01', min: '0.01' },
    minLiquidityUsd: { label: 'Min Liquidity (USD)', step: '1', min: '1' },
    hardStopLossLimit: { label: 'Hard Stop Loss (Ratio)', step: '0.01', min: '0.01' },
    protectConfirmMs: { label: 'Confirm Delay (ms)', step: '100', min: '0' },
    protectConfirmTicks: { label: 'Confirm Ticks', step: '1', min: '1' }
  },
  'iron-lock': {
    shares: { label: 'Default Shares', step: '1', min: '1' },
    minShares: { label: 'Min Shares', step: '1', min: '1' },
    stopLossLimit: { label: 'Stop Loss Limit (Ratio)', step: '0.01', min: '0.01' },
    profitTarget: { label: 'Profit Target (Ratio)', step: '0.01', min: '0.01' },
    minLiquidityUsd: { label: 'Min Liquidity (USD)', step: '1', min: '1' },
    hardStopLossLimit: { label: 'Hard Stop Loss (Ratio)', step: '0.01', min: '0.01' },
    protectConfirmMs: { label: 'Confirm Delay (ms)', step: '100', min: '0' },
    protectConfirmTicks: { label: 'Confirm Ticks', step: '1', min: '1' },
    maxSpread: { label: 'Max Spread (Ratio)', step: '0.01', min: '0.001' }
  }
};

export default function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [inputs, setInputs] = useState({
    balance: '100',
    maxLoss: '20',
    maxProfit: '50',
    tradeAmount: '10',
    strategy: 'late-down',
    rounds: '0',
    hourlyProfitTarget: '0',
    tickerSources: 'binance,chainlink,coinbase',
    prod: false
  });
  const [selectedTickers, setSelectedTickers] = useState<string[]>(['btc']);
  const [activeStats, setActiveStats] = useState<any>(null);
  const [runningProcesses, setRunningProcesses] = useState<any[]>([]);
  const [strategySettings, setStrategySettings] = useState<any>(null);
  const [tickerValues, setTickerValues] = useState<any[]>([]);
  const [tickerUpdatedAt, setTickerUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/settings`);
        if (res.ok) {
          const data = await res.json();
          setStrategySettings(data);
        }
      } catch (e) {
        console.error("Failed to fetch settings", e);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveSettings = async (updatedSettings: any) => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      });
      if (res.ok) {
        setStrategySettings(updatedSettings);
      } else {
        alert("Failed to save settings");
      }
    } catch (e) {
      alert("Error saving settings");
    }
  };

  const handleParamChange = (strategy: string, key: string, value: string) => {
    if (!strategySettings) return;
    const updated = {
      ...strategySettings,
      [strategy]: {
        ...strategySettings[strategy],
        [key]: value === '' ? '' : Number(value)
      }
    };
    setStrategySettings(updated);
  };

  useEffect(() => {
    let timer: any;
    const fetchTickerValues = async () => {
      try {
        const activeAssets = runningProcesses.map((proc: any) => proc.config?.asset).filter(Boolean);
        const assets = Array.from(new Set([...(selectedTickers.length ? selectedTickers : ['btc']), ...activeAssets]));
        const res = await fetch(`${API_BASE}/api/ticker-values?assets=${assets.join(',')}`);
        if (!res.ok) return;
        const data = await res.json();
        setTickerValues(data.assets || []);
        setTickerUpdatedAt(data.updatedAt || Date.now());
      } catch (e) {
        console.error("Ticker fetch error:", e);
      }
    };
    fetchTickerValues();
    timer = setInterval(fetchTickerValues, 5000);
    return () => clearInterval(timer);
  }, [selectedTickers, runningProcesses]);

  useEffect(() => {
    let timer: any;
    const fetchStatus = async () => {
      try {
          const res = await fetch(`${API_BASE}/api/status`);
          const statusData = await res.json();
          
          const activeArray = [];
          for (const [processId, data] of Object.entries(statusData)) {
              if ((data as any).isRunning) {
                  activeArray.push({ processId, ...(data as any) });
              }
          }
          
          setIsRunning(activeArray.length > 0);
          setRunningProcesses(activeArray);
          
          let totalPnl = 0;
          let totalTrades = 0;
          let totalAllocatedBalance = 0;
          
          activeArray.forEach((a: any) => {
              const allocated = parseFloat(a.config?.balance || '0');
              totalAllocatedBalance += allocated;
              
              if (a.state) {
                  totalPnl += a.state.sessionPnl || 0;
                  totalTrades += a.state.completedMarkets?.length || 0;
              }
          });
          
          setActiveStats({
              pnl: totalPnl,
              trades: totalTrades,
              runningCount: activeArray.length,
              allocatedBalance: totalAllocatedBalance
          });
      } catch (e) {
          console.error("Status fetch error:", e);
      }
    };
    fetchStatus();
    timer = setInterval(fetchStatus, 2000);
    return () => clearInterval(timer);
  }, []);

  const handleLaunch = async () => {
    try {
        const numericKeys = ['balance', 'maxLoss', 'maxProfit', 'tradeAmount', 'rounds', 'hourlyProfitTarget'];
        const hasInvalidNumeric = numericKeys.some(k => {
            const val = (inputs as any)[k];
            return !val || parseFloat(val) < 0;
        });
        if (hasInvalidNumeric || !inputs.strategy || !inputs.tickerSources) {
            alert("Mohon isi semua variabel dengan nilai yang valid!");
            return;
        }
        await fetch(`${API_BASE}/api/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...inputs, tickers: selectedTickers })
        });
        setIsRunning(true);
    } catch (e) {
        alert("Error launching strategy");
    }
  };

  const handleStopAll = async () => {
      try {
          await fetch(`${API_BASE}/api/stop`, { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}) // Stop all
          });
          setIsRunning(false);
      } catch(e) {
          alert("Error stopping strategies");
      }
  };

  const handleStopSingle = async (processId: string) => {
      try {
          await fetch(`${API_BASE}/api/stop`, { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ processId })
          });
      } catch(e) {
          alert("Error stopping strategy");
      }
  };

  const handleRestartSingle = async (processId: string) => {
      try {
          const res = await fetch(`${API_BASE}/api/restart`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ processId })
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(data.error || "Error restarting strategy");
          }
      } catch(e) {
          alert("Error restarting strategy");
      }
  };

  const handleTickerToggle = (ticker: string) => {
    setSelectedTickers(prev => 
      prev.includes(ticker) && prev.length > 1 ? prev.filter(t => t !== ticker) : Array.from(new Set([...prev, ticker]))
    );
  };

  const handleTickerSourceToggle = (source: string) => {
    const current = inputs.tickerSources.split(',').map(s => s.trim()).filter(Boolean);
    const next = current.includes(source)
      ? current.filter(s => s !== source)
      : [...current, source];
    setInputs({ ...inputs, tickerSources: next.join(',') });
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8 pb-12">
      {/* Execution Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-900/50 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-xl">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-2xl border transition-all duration-500 ${isRunning ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-pink-500/10 border-pink-500/20'}`}>
              <Zap className={`w-8 h-8 ${isRunning ? 'text-emerald-500 animate-pulse' : 'text-pink-500'}`} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">Execution <span className={isRunning ? 'text-emerald-500' : 'text-pink-500'}>Control</span></h1>
              <p className="text-slate-400 font-medium italic text-sm">Manage Live Trading Sessions</p>
            </div>
          </div>
          
          <div className="flex gap-3">
              {isRunning && (
                  <button 
                    onClick={handleStopAll}
                    className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold transition-all active:scale-95 bg-red-500/10 border border-red-500/20 text-red-500 shadow-lg shadow-red-500/10 hover:bg-red-500/20"
                  >
                    <Square className="w-5 h-5 fill-current" /> STOP ALL
                  </button>
              )}
              <button 
                onClick={handleLaunch}
                className="flex items-center justify-center gap-3 px-10 py-4 rounded-2xl font-bold transition-all active:scale-95 bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
              >
                <PlayCircle className="w-5 h-5" /> LAUNCH NEW SESSION
              </button>
          </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* CONFIG & TICKER SELECTION */}
        <section className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-xl">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-3 text-white"><Settings2 className="w-4 h-4 text-pink-500" /> Configuration</h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Layers className="w-3 h-3"/> Strategy</label>
                <select 
                  value={inputs.strategy}
                  onChange={(e) => setInputs({...inputs, strategy: e.target.value})}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none appearance-none"
                >
                  {AVAILABLE_STRATEGIES.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Activity className="w-3 h-3"/> Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInputs({...inputs, prod: false})}
                    className={`px-3 py-2 rounded-xl text-[10.5px] font-black uppercase transition-all border ${
                      !inputs.prod 
                      ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40 shadow-lg shadow-cyan-500/10' 
                      : 'bg-black/40 text-slate-500 border-white/5 hover:border-cyan-500/30'
                    }`}
                  >
                    Simulation
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputs({...inputs, prod: true})}
                    className={`px-3 py-2 rounded-xl text-[10.5px] font-black uppercase transition-all border ${
                      inputs.prod 
                      ? 'bg-red-500/20 text-red-200 border-red-500/40 shadow-lg shadow-red-500/10' 
                      : 'bg-black/40 text-slate-500 border-white/5 hover:border-red-500/30'
                    }`}
                  >
                    Production
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Tickers</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TICKERS.map(ticker => (
                    <button
                      key={ticker}
                      onClick={() => handleTickerToggle(ticker)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                        selectedTickers.includes(ticker) 
                        ? 'bg-pink-500 text-white border-pink-500 shadow-lg shadow-pink-500/20' 
                        : 'bg-black/40 text-slate-500 border-white/5 hover:border-pink-500/30'
                      } border`}
                    >
                      {ticker}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Radio className="w-3 h-3"/> Ticker Value Sources</label>
                <input
                  type="text"
                  name="tickerSources"
                  value={inputs.tickerSources}
                  onChange={(e) => setInputs({...inputs, tickerSources: e.target.value})}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-pink-500/50"
                  placeholder="binance,chainlink,coinbase"
                />
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TICKER_SOURCES.map(source => {
                    const active = inputs.tickerSources.split(',').map(s => s.trim()).includes(source);
                    return (
                      <button
                        key={source}
                        type="button"
                        onClick={() => handleTickerSourceToggle(source)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${
                          active
                          ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                          : 'bg-black/40 text-slate-500 border-white/5 hover:border-cyan-500/30'
                        }`}
                      >
                        {source}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-slate-500 leading-relaxed">
                  Ini dikirim sebagai env <span className="font-mono text-slate-300">TICKER={inputs.tickerSources || '—'}</span> saat launch strategy.
                </p>
              </div>

              {[
                { name: 'balance', label: 'Balance', icon: <Wallet /> },
                { name: 'tradeAmount', label: 'Size', icon: <Zap /> },
                { name: 'maxLoss', label: 'Stop Loss', icon: <ShieldAlert /> },
                { name: 'maxProfit', label: 'Session Target', icon: <Target /> },
                { name: 'hourlyProfitTarget', label: 'Hourly Target (0=Off)', icon: <Clock /> },
                { name: 'rounds', label: 'Rounds (0=Inf)', icon: <Clock /> }
              ].map((input) => (
                <div key={input.name} className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    {cloneElement(input.icon as ReactElement<any>, { className: "w-3 h-3" })} {input.label}
                  </label>
                  <input 
                    type="number"
                    name={input.name}
                    value={(inputs as any)[input.name]}
                    onChange={(e) => setInputs({...inputs, [e.target.name]: e.target.value})}
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-pink-500/50"
                  />
                </div>
              ))}

            </div>

            {/* STRATEGY TUNING CARD */}
            {PARAM_METADATA[inputs.strategy] && strategySettings && (
              <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-xl mt-6">
                <h2 className="text-sm font-black uppercase tracking-widest text-white mb-4 flex items-center gap-3">
                  <Settings2 className="w-4 h-4 text-pink-500" />
                  Tuning: <span className="text-pink-500">{inputs.strategy}</span>
                </h2>
                <div className="space-y-4">
                  {Object.entries(PARAM_METADATA[inputs.strategy] || {}).map(([key, meta]) => {
                    const val = strategySettings[inputs.strategy]?.[key] ?? '';
                    return (
                      <div key={key} className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          {meta.label}
                        </label>
                        <input
                          type="number"
                          step={meta.step}
                          min={meta.min}
                          value={val}
                          onChange={(e) => handleParamChange(inputs.strategy, key, e.target.value)}
                          className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2 text-white text-xs focus:outline-none focus:border-pink-500/50"
                        />
                      </div>
                    );
                  })}
                  <button
                    onClick={() => handleSaveSettings(strategySettings)}
                    className="w-full mt-2 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 bg-pink-500 text-white hover:bg-pink-600 shadow-lg shadow-pink-500/20"
                  >
                    Save Parameters
                  </button>
                </div>
              </div>
            )}

            {/* QUICK REFERENCE / WIKI INTEGRATION */}
            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-xl mt-6">
              <h2 className="text-sm font-black uppercase tracking-widest text-white mb-4 flex items-center gap-3"><BookOpen className="w-4 h-4 text-emerald-400" /> Quick Reference</h2>
              <div className="space-y-3">
                 <a 
                    href={`http://${window.location.hostname}:5174`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-xl group hover:border-emerald-500/30 transition-all"
                 >
                    <div className="flex items-center gap-3">
                        <HelpCircle className="w-4 h-4 text-slate-500 group-hover:text-emerald-400" />
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Strategy Guide</span>
                    </div>
                    <ExternalLink className="w-3 h-3 text-slate-600" />
                 </a>
                 <p className="text-[9px] text-slate-500 italic px-1 leading-relaxed">
                    Akses dokumentasi teknis dan panduan manajemen risiko langsung dari basis pengetahuan terpusat.
                 </p>
              </div>
            </div>
          </div>
        </section>

        {/* MONITORING DASHBOARD */}
        <section className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total P&L', value: activeStats?.pnl.toFixed(2) || '0.00', icon: <Activity />, color: (activeStats?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Active Assets', value: activeStats?.runningCount || 0, icon: <Layers />, color: 'text-blue-400' },
              { label: 'Total Trades', value: activeStats?.trades || 0, icon: <TrendingUp />, color: 'text-purple-400' },
              { label: 'Live Balance', value: ((activeStats?.allocatedBalance || 0) + (activeStats?.pnl || 0)).toFixed(2), icon: <Wallet />, color: 'text-white' }
            ].map((stat, i) => (
              <div key={i} className="bg-slate-900/50 backdrop-blur-xl border border-white/5 p-6 rounded-3xl relative overflow-hidden shadow-xl">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3 text-slate-500">
                    {cloneElement(stat.icon as ReactElement<any>, { className: "w-3 h-3" })}
                    <span className="text-[8px] font-black uppercase tracking-widest">{stat.label}</span>
                  </div>
                  <div className={`text-3xl font-black ${stat.color}`}>{stat.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* LIVE TICKER VALUES */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
              <h2 className="text-xl font-bold flex items-center gap-3 text-white"><Radio className="w-5 h-5 text-cyan-400" /> Live Ticker Values</h2>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {tickerUpdatedAt ? `Updated ${new Date(tickerUpdatedAt).toLocaleTimeString()}` : 'Waiting for feed'}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {tickerValues.map((row: any) => {
                const spread = typeof row.spread === 'number' ? row.spread : null;
                const spreadWarn = spread !== null && spread > (row.asset === 'btc' ? 50 : row.asset === 'eth' ? 5 : 0.5);
                return (
                  <div key={row.asset} className="p-4 bg-black/40 border border-white/5 rounded-2xl">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-black uppercase text-white">{row.label || row.asset}</span>
                      <span className={`text-[9px] font-black uppercase tracking-widest ${row.error ? 'text-red-400' : 'text-emerald-400'}`}>
                        {row.error ? 'Feed Error' : 'Live'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <div className="text-[8px] uppercase tracking-widest text-slate-500 mb-1">Binance</div>
                        <div className="text-cyan-300 font-bold">{formatTickerPrice(row.sources?.binance)}</div>
                      </div>
                      <div>
                        <div className="text-[8px] uppercase tracking-widest text-slate-500 mb-1">Coinbase</div>
                        <div className="text-blue-300 font-bold">{formatTickerPrice(row.sources?.coinbase)}</div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[8px] uppercase tracking-widest text-slate-500">Spread</span>
                      <span className={`text-xs font-black ${spreadWarn ? 'text-red-400' : 'text-slate-300'}`}>{spread === null ? '—' : formatTickerPrice(spread)}</span>
                    </div>
                  </div>
                );
              })}
              {!tickerValues.length && (
                <div className="col-span-full p-4 bg-black/40 border border-white/5 rounded-2xl text-slate-500 text-xs italic">Ticker values are loading...</div>
              )}
            </div>
          </div>

          {/* ACTIVE SESSIONS CARDS */}
          {isRunning && (
            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-bold flex items-center gap-3 text-white"><PlayCircle className="w-5 h-5 text-pink-500" /> Active Sessions</h2>
              </div>
              <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {runningProcesses.map((proc) => {
                    const cnf = proc.config || {};
                    const st = proc.state || {};
                    const pnl = st.sessionPnl || 0;
                    const hourlyPnl = st.hourlyPnl || 0;
                    const hourlyTarget = st.hourlyProfitTarget || Number(cnf.hourlyProfitTarget || 0);
                    const hourlyPaused = !!st.hourlyEntryPaused;
                    const hourlyResetAt = st.hourlyResetAtMs ? new Date(st.hourlyResetAtMs).toLocaleTimeString() : '—';
                    const hourlyResetCount = st.hourlyResetCount || 0;
                    const activePositions = (st.activeMarkets || [])
                      .flatMap((market: any) => (market.orderHistory || [])
                        .filter((order: any) => order.action === 'buy')
                        .map((order: any) => ({ slug: market.slug, marketTime: marketTimeFromSlug(market.slug), ...order }))
                      );
                    const activePositionLabel = activePositions.length
                      ? activePositions.map((order: any) => `${order.marketTime} · ${order.shares || 1} @ ${Number(order.price).toFixed(2)}`).join(', ')
                      : 'None';
                    const settledPositions = (st.completedMarkets || []).filter((market: any) => (market.orderHistory || []).some((order: any) => order.action === 'buy'));
                    const latestSettled = settledPositions[settledPositions.length - 1];
                    const latestBuy = latestSettled?.orderHistory?.find((order: any) => order.action === 'buy');
                    const latestSettledLabel = latestSettled && latestBuy
                      ? `${marketTimeFromSlug(latestSettled.slug)} · ${Number(latestSettled.pnl || 0) >= 0 ? '+' : ''}${Number(latestSettled.pnl || 0).toFixed(2)} · ${latestBuy.action.toUpperCase()} @ ${Number(latestBuy.price).toFixed(2)}`
                      : 'No settled position';
                    
                    return (
                    <div key={proc.processId} className="p-5 bg-black/40 border border-white/10 rounded-2xl text-left animate-in zoom-in-95 hover:border-pink-500/30 transition-colors min-w-0 overflow-hidden">
                        <div className="flex justify-between items-start gap-3 mb-3">
                            <span className="min-w-0 text-sm font-black uppercase text-emerald-500 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                <span className="truncate">{cnf.asset || proc.processId}</span>
                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${
                                  cnf.prod === true || cnf.prod === 'true'
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                }`}>
                                  {cnf.prod === true || cnf.prod === 'true' ? 'Prod' : 'Sim'}
                                </span>
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                  onClick={() => handleRestartSingle(proc.processId)}
                                  className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-white transition-colors"
                                  title="Restart this session"
                              >
                                  <RotateCcw className="w-4 h-4" />
                              </button>
                              <button 
                                  onClick={() => handleStopSingle(proc.processId)}
                                  className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                                  title="Stop this session"
                              >
                                  <Square className="w-4 h-4 fill-current" />
                              </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="min-w-0 text-[11px] text-slate-400 font-mono space-y-1.5">
                              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2"><span className="text-slate-500">Strategy</span><span className="text-white truncate" title={cnf.strategy}>{cnf.strategy}</span></div>
                              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2"><span className="text-slate-500">Ticker</span><span className="text-cyan-300 truncate" title={cnf.tickerSources || 'binance,chainlink,coinbase'}>{cnf.tickerSources || 'binance,chainlink,coinbase'}</span></div>
                              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2"><span className="text-slate-500">Runtime</span><span className="text-pink-300 truncate font-semibold" title={formatTimeRunning(cnf.startTime)}>{formatTimeRunning(cnf.startTime)}</span></div>
                              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                                <span className="text-slate-500">Hourly</span>
                                <span className={hourlyPaused ? 'text-amber-300 truncate' : 'text-emerald-300 truncate'}>
                                  {hourlyPnl >= 0 ? '+' : ''}{hourlyPnl.toFixed(2)} / {hourlyTarget > 0 ? `+${hourlyTarget.toFixed(2)}` : 'OFF'}
                                </span>
                              </div>
                              {hourlyTarget > 0 && (
                                <>
                                  <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2"><span className="text-slate-500">Gate</span><span className={hourlyPaused ? 'text-amber-300 truncate' : 'text-emerald-300 truncate'} title={hourlyPaused ? `PAUSED until ${hourlyResetAt}` : `OPEN reset ${hourlyResetAt}`}>{hourlyPaused ? `PAUSED until ${hourlyResetAt}` : `OPEN reset ${hourlyResetAt}`}</span></div>
                                  <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2"><span className="text-slate-500">Resets</span><span className="text-violet-300">{hourlyResetCount}x</span></div>
                                </>
                              )}
                              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                                <span className="text-slate-500">Active</span>
                                <span className={activePositions.length ? 'text-amber-300 truncate' : 'text-slate-500 truncate'} title={activePositionLabel}>
                                  {activePositions.length ? `${activePositions.length} pos · ${activePositionLabel}` : 'No open position'}
                                </span>
                              </div>
                              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                                <span className="text-slate-500">Latest</span>
                                <span className={latestSettled ? `${Number(latestSettled.pnl || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'} truncate` : 'text-slate-500 truncate'} title={latestSettled ? `${latestSettled.slug} · ${latestSettledLabel}` : latestSettledLabel}>
                                  {latestSettledLabel}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-end justify-between gap-3 pt-3 border-t border-white/5">
                                <div className="text-[8px] uppercase tracking-widest text-slate-500">Session P&L</div>
                                <div className={`text-sm font-bold whitespace-nowrap ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} USDC
                                </div>
                            </div>
                        </div>
                    </div>
                )})}
              </div>
            </div>
          )}

          {/* LIVE POLLING FEED */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 min-h-[300px] flex flex-col shadow-xl">
            <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
               <h2 className="text-xl font-bold flex items-center gap-3 text-white"><Activity className="w-5 h-5 text-emerald-500" /> Live Polling Feed</h2>
               {isRunning && <span className="flex items-center gap-2 text-[10px] font-bold text-emerald-500 animate-pulse tracking-widest"><div className="w-2 h-2 rounded-full bg-emerald-500"/> SYSTEM ACTIVE</span>}
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              {!isRunning ? (
                <div className="opacity-30 flex flex-col items-center">
                    <div className="p-6 rounded-full bg-white/5 mb-4"><PlayCircle className="w-12 h-12" /></div>
                    <p className="text-sm italic font-medium">Engine is currently resting.<br/>Select assets and press Launch Session.</p>
                </div>
              ) : (
                <div className="w-full flex-1 flex flex-col items-start justify-start space-y-2 font-mono text-xs text-slate-400">
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-left w-full animate-in fade-in slide-in-from-left-2">
                       <span className="text-emerald-500 mr-2">[{new Date().toLocaleTimeString()}]</span> Connected to Backend Controller API.
                    </div>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-left w-full animate-in fade-in slide-in-from-left-2 delay-150">
                       <span className="text-emerald-500 mr-2">[{new Date().toLocaleTimeString()}]</span> Synchronizing state with active Poly Engine instances...
                    </div>
                    {runningProcesses.map((proc, idx) => (
                      <div key={idx} className="p-3 bg-black/40 rounded-xl border border-white/5 text-left w-full animate-in fade-in slide-in-from-left-2 delay-300">
                         <span className="text-blue-500 mr-2">[HEARTBEAT]</span> Process <span className="text-white font-bold">{proc.processId}</span> is responding normally.
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
