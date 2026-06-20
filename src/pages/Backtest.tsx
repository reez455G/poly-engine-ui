import { useState, useEffect } from 'react';
import { 
  BarChart4, 
  Calendar, 
  Play, 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  Activity, 
  FileText,
  AlertTriangle,
  HelpCircle,
  Clock,
  TrendingUp as WinrateIcon
} from 'lucide-react';

const API_BASE = window.location.origin;

const FALLBACK_STRATEGIES = [
  'simulation', 'late-entry', 'steady-scalp', 'iron-lock', 
  'late-down', 'late-down-v2', 'certainty-sweeper', 'certainty-sweeper-mid', 'sweeper-adaptive', 'sweeper-adaptive-exclude-btc', 'sweeper-adaptive-xrp', 'sweeper-adaptive-eth', 'sweeper-adaptive-sol', 'sweeper-adaptive-doge', 'sweeper-adaptive-bnb', 'sure-win-sniper', 'sure-win-sniper-v2'
];

const AVAILABLE_TICKERS = ['btc', 'eth', 'xrp', 'sol', 'doge', 'bnb'];

export default function Backtest() {
  const [strategies, setStrategies] = useState<string[]>(FALLBACK_STRATEGIES);
  const [inputs, setInputs] = useState({
    strategy: 'certainty-sweeper',
    asset: 'btc',
    window: '5m',
    from: '',
    to: ''
  });
  
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawReport, setShowRawReport] = useState(false);

  // Set default dates: from 7 days ago to now
  useEffect(() => {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - 7);

    // Format to YYYY-MM-DDTHH:MM for datetime-local input
    const formatLocal = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setInputs(prev => ({
      ...prev,
      from: formatLocal(fromDate),
      to: formatLocal(toDate)
    }));

    // Fetch live strategies list
    const fetchStrategies = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/strategies`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setStrategies(data);
          }
        }
      } catch (e) {
        console.error("Failed to fetch strategies", e);
      }
    };
    fetchStrategies();
  }, []);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputs.from || !inputs.to) {
      setError("Please specify both 'From' and 'To' datetimes.");
      return;
    }

    setIsRunning(true);
    setError(null);
    setResults(null);

    try {
      // Convert datetime-local strings to ISO strings
      const fromIso = new Date(inputs.from).toISOString();
      const toIso = new Date(inputs.to).toISOString();

      const res = await fetch(`${API_BASE}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: inputs.strategy,
          asset: inputs.asset,
          window: inputs.window,
          from: fromIso,
          to: toIso
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.stderr || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResults(data);
    } catch (err: any) {
      console.error("Backtest execution error:", err);
      setError(err.message || "An unknown error occurred while running backtest.");
    } finally {
      setIsRunning(false);
    }
  };

  const isPositive = (valStr?: string) => {
    if (!valStr) return false;
    return !valStr.startsWith('-');
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8 pb-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-900/50 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className={`p-4 rounded-2xl border transition-all duration-500 ${isRunning ? 'bg-purple-500/10 border-purple-500/20' : 'bg-pink-500/10 border-pink-500/20'}`}>
            <BarChart4 className={`w-8 h-8 ${isRunning ? 'text-purple-400 animate-pulse' : 'text-pink-500'}`} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Offline <span className="text-pink-500">Backtesting</span></h1>
            <p className="text-slate-400 font-medium italic text-sm">Simulate Strategy Logic Over Historical QuestDB Telemetry</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* CONFIG SECTION */}
        <section className="lg:col-span-1 space-y-6">
          <form onSubmit={handleRun} className="bg-slate-900/50 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-xl space-y-4">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-3 text-white">
              <Layers className="w-4 h-4 text-pink-500" /> Parameters
            </h2>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Strategy</label>
              <select 
                value={inputs.strategy}
                onChange={(e) => setInputs({...inputs, strategy: e.target.value})}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none appearance-none font-medium"
              >
                {strategies.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Asset</label>
              <select 
                value={inputs.asset}
                onChange={(e) => setInputs({...inputs, asset: e.target.value})}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none appearance-none font-medium uppercase"
              >
                {AVAILABLE_TICKERS.map(t => <option key={t} value={t} className="bg-slate-900 uppercase">{t}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timeframe Window</label>
              <select 
                value={inputs.window}
                onChange={(e) => setInputs({...inputs, window: e.target.value})}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none appearance-none font-medium"
              >
                <option value="5m" className="bg-slate-900">5m</option>
                <option value="15m" className="bg-slate-900">15m</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-1">
                <Calendar className="w-3 h-3 text-pink-500" /> From
              </label>
              <input 
                type="datetime-local" 
                value={inputs.from}
                onChange={(e) => setInputs({...inputs, from: e.target.value})}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-pink-500/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-1">
                <Calendar className="w-3 h-3 text-pink-500" /> To
              </label>
              <input 
                type="datetime-local" 
                value={inputs.to}
                onChange={(e) => setInputs({...inputs, to: e.target.value})}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-pink-500/50"
              />
            </div>

            <button
              type="submit"
              disabled={isRunning}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold transition-all active:scale-95 bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/20"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> RUNNING...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" /> RUN BACKTEST
                </>
              )}
            </button>
          </form>

          {/* Quick Notice */}
          <div className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl text-[11px] text-slate-400 space-y-2 leading-relaxed">
            <span className="font-extrabold text-slate-200 flex items-center gap-1"><HelpCircle className="w-3 h-3 text-cyan-400" /> Backtesting Notice</span>
            <p>Backtests run completely offline inside the server controller against historical snapshots stored in QuestDB.</p>
            <p>Make sure the QuestDB container is running and has the analytics tables backfilled.</p>
          </div>
        </section>

        {/* RESULTS SECTION */}
        <section className="lg:col-span-3 space-y-6">
          {/* Error Alert */}
          {error && (
            <div className="p-5 bg-red-500/10 border border-red-500/20 text-red-200 rounded-3xl flex items-start gap-3 animate-in fade-in duration-300">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
              <div>
                <h3 className="font-bold text-white mb-1">Execution Failure</h3>
                <p className="text-xs font-mono leading-relaxed bg-black/30 p-3 rounded-xl border border-white/5 mt-2 overflow-auto max-h-40">{error}</p>
              </div>
            </div>
          )}

          {/* Waiting/No Results state */}
          {!results && !isRunning && !error && (
            <div className="bg-slate-900/30 border border-white/5 rounded-3xl p-12 min-h-[400px] flex flex-col items-center justify-center text-center">
              <div className="p-6 rounded-full bg-white/5 mb-4 text-slate-500">
                <Activity className="w-12 h-12" />
              </div>
              <h3 className="text-lg font-black text-slate-300">Ready to Backtest</h3>
              <p className="text-slate-500 text-sm max-w-sm mt-2">
                Configure your strategy and date range parameters, then click the run button to view metrics, skips, and candidate outcomes.
              </p>
            </div>
          )}

          {/* Running State Spinner */}
          {isRunning && (
            <div className="bg-slate-900/30 border border-white/5 rounded-3xl p-12 min-h-[400px] flex flex-col items-center justify-center text-center">
              <Loader2 className="w-12 h-12 text-pink-500 animate-spin mb-4" />
              <h3 className="text-lg font-black text-white">Simulating Replay Frames...</h3>
              <p className="text-slate-500 text-sm max-w-sm mt-2">
                Querying QuestDB slot records and orderbooks to rebuild market tick timelines. This may take up to a minute depending on duration.
              </p>
            </div>
          )}

          {/* Results Display */}
          {results && !isRunning && (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Top Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Activity className="w-3 h-3 text-pink-500" /> Strict P&L</span>
                  <span className={`text-2xl font-black mt-2 ${isPositive(results.pnl) ? 'text-emerald-400' : 'text-red-400'}`}>
                    {results.pnl}
                  </span>
                </div>

                <div className="p-5 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><WinrateIcon className="w-3 h-3 text-cyan-400" /> Win Rate</span>
                  <span className="text-2xl font-black mt-2 text-cyan-300">
                    {results.winRate}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 mt-1">Wins: {results.wins} / Losses: {results.losses}</span>
                </div>

                <div className="p-5 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Layers className="w-3 h-3 text-purple-400" /> Total Markets</span>
                  <span className="text-2xl font-black mt-2 text-purple-300">
                    {results.totalMarkets}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 mt-1">Candidates: {results.candidates}</span>
                </div>

                <div className="p-5 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-emerald-400" /> Expectancy</span>
                  <span className="text-2xl font-black mt-2 text-white">
                    {results.expectancy}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 mt-1">PF: {results.profitFactor}</span>
                </div>
              </div>

              {/* Lower Detail Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900/30 border border-white/5 rounded-xl text-center">
                  <div className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Max Drawdown</div>
                  <div className="text-base font-bold text-red-400 mt-1">{results.maxDrawdown}</div>
                </div>
                <div className="p-4 bg-slate-900/30 border border-white/5 rounded-xl text-center">
                  <div className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Strict Fills</div>
                  <div className="text-base font-bold text-slate-200 mt-1">{results.strictFills} / {results.resolvedFills}</div>
                </div>
                <div className="p-4 bg-slate-900/30 border border-white/5 rounded-xl text-center">
                  <div className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Missed Winners</div>
                  <div className="text-base font-bold text-amber-300 mt-1">{results.missedWinners}</div>
                </div>
                <div className="p-4 bg-slate-900/30 border border-white/5 rounded-xl text-center">
                  <div className="text-[9px] text-slate-500 uppercase font-black tracking-wider">False Entries</div>
                  <div className="text-base font-bold text-red-300 mt-1">{results.falseEntries}</div>
                </div>
              </div>

              {/* Missed Winners Skip Reason Analysis */}
              <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-amber-500" /> Missed Winners Skip Reason Analysis
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-2.5 px-3">Reason</th>
                        <th className="py-2.5 px-3 text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {results.skipReasons && results.skipReasons.length > 0 ? (
                        results.skipReasons.map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-white/5">
                            <td className="py-2.5 px-3 text-slate-200">{row.reason}</td>
                            <td className="py-2.5 px-3 text-right text-amber-300 font-bold">{row.count}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="py-6 text-center text-slate-500 italic">No skip reason data parsed.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Candidates Replay Details */}
              <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" /> Recent Candidates Replay Details
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3">Slug</th>
                        <th className="py-2 px-3">Side</th>
                        <th className="py-2 px-3">Ladder</th>
                        <th className="py-2 px-3">Filled</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Outcome</th>
                        <th className="py-2 px-3 text-right">PnL</th>
                        <th className="py-2 px-3 text-right">Bid</th>
                        <th className="py-2 px-3 text-right">Gap</th>
                        <th className="py-2 px-3 text-right">Sec</th>
                        <th className="py-2 px-3 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {results.recentCandidates && results.recentCandidates.length > 0 ? (
                        results.recentCandidates.map((row: any, i: number) => {
                          const pnlNum = parseFloat(row.pnl || '0');
                          const pnlColor = pnlNum > 0 ? 'text-emerald-400' : pnlNum < 0 ? 'text-red-400' : 'text-slate-400';
                          return (
                            <tr key={i} className="hover:bg-white/5">
                              <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{row.time}</td>
                              <td className="py-2 px-3 text-white font-semibold max-w-[120px] truncate" title={row.slug}>{row.slug}</td>
                              <td className={`py-2 px-3 font-bold ${row.side === 'UP' ? 'text-cyan-400' : 'text-pink-400'}`}>{row.side}</td>
                              <td className="py-2 px-3 text-slate-300">{row.ladder}</td>
                              <td className="py-2 px-3 text-slate-300">{row.filled}</td>
                              <td className="py-2 px-3 text-slate-400">{row.status}</td>
                              <td className={`py-2 px-3 font-bold ${row.outcome === row.side ? 'text-emerald-400' : row.outcome === 'UNKNOWN' ? 'text-slate-500' : 'text-red-400'}`}>{row.outcome}</td>
                              <td className={`py-2 px-3 text-right font-bold ${pnlColor}`}>{row.pnl}</td>
                              <td className="py-2 px-3 text-right text-slate-300">{row.bid}</td>
                              <td className="py-2 px-3 text-right text-slate-300">{row.gap}</td>
                              <td className="py-2 px-3 text-right text-slate-300">{row.remain}</td>
                              <td className="py-2 px-3 text-right text-purple-300 font-bold">{row.score}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={12} className="py-6 text-center text-slate-500 italic">No candidate records found in this backtest.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Raw Report Toggle */}
              <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl">
                <button
                  type="button"
                  onClick={() => setShowRawReport(!showRawReport)}
                  className="flex items-center justify-between w-full font-bold text-white focus:outline-none"
                >
                  <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-pink-500" /> Raw Markdown Report</span>
                  <span className="text-slate-400 text-xs hover:text-white transition-colors">
                    {showRawReport ? "Hide" : "Show"} Details
                  </span>
                </button>

                {showRawReport && (
                  <pre className="mt-4 p-4 bg-black/40 rounded-xl border border-white/5 text-slate-300 font-mono text-[10px] whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                    {results.rawReport}
                  </pre>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
