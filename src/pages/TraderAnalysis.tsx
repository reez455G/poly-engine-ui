import { useEffect, useState } from 'react';
import { Brain, RefreshCw, Wallet, Trophy, AlertTriangle, Layers, Activity } from 'lucide-react';

const API_BASE = window.location.origin;

type WalletSummary = {
  wallet: string;
  runs: number;
  classification: string;
  totalPnl: number;
  resolvedPositions: number;
  winRate: number;
  concentration: number;
  reason: string;
  lastSeen: string;
};

type CategorySummary = {
  wallet: string;
  category: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  winRate: number;
  avgPnl: number;
  biggestWin: number;
  biggestLoss: number;
};

type Insight = {
  wallet: string;
  classification: string;
  headline: string;
  bestCategory: string;
  worstCategory: string;
  reason: string;
};

function money(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function shortWallet(w: string) {
  return w.length > 16 ? `${w.slice(0, 8)}…${w.slice(-6)}` : w;
}

export default function TraderAnalysis() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/api/trader-analysis/report`),
        fetch(`${API_BASE}/api/trader-analysis/status`),
      ]);
      const reportJson = await reportRes.json();
      const statusJson = await statusRes.json();
      if (!reportRes.ok) throw new Error(reportJson.error || `HTTP ${reportRes.status}`);
      setData(reportJson);
      setStatus(statusJson);
    } catch (e: any) {
      setError(e.message || 'Failed to load trader analysis report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const report = data?.report;
  const wallets: WalletSummary[] = report?.wallets || [];
  const categories: CategorySummary[] = report?.categories || [];
  const insights: Insight[] = report?.insights || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">Trader Wallet Intelligence</h1>
              <p className="text-slate-500 text-sm font-medium">6-hour heartbeat analysis from Polymarket public trader APIs + QuestDB.</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">
            Generated: {report?.generatedAt || 'No report yet'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-bold transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-5">
          <div className="text-slate-500 text-xs font-bold uppercase mb-2">Collector</div>
          <div className="flex items-center gap-2 text-lg font-black text-white"><Activity className="w-4 h-4 text-emerald-400" /> {status?.collector || 'unknown'}</div>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-5">
          <div className="text-slate-500 text-xs font-bold uppercase mb-2">Heartbeat Agent</div>
          <div className="flex items-center gap-2 text-lg font-black text-white"><Brain className="w-4 h-4 text-cyan-400" /> {status?.heartbeat || 'unknown'}</div>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-5">
          <div className="text-slate-500 text-xs font-bold uppercase mb-2">Wallets Analyzed</div>
          <div className="flex items-center gap-2 text-lg font-black text-white"><Wallet className="w-4 h-4 text-pink-400" /> {wallets.length}</div>
        </div>
      </div>

      {!data?.available && (
        <div className="p-8 rounded-3xl bg-slate-900/60 border border-white/5 text-center">
          <p className="text-slate-400 font-bold">No heartbeat report yet.</p>
          <p className="text-slate-600 text-sm mt-2">Start the collector and heartbeat agent, then wait for the first run.</p>
        </div>
      )}

      {insights.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-black text-white flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-400" /> Agent Insights</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {insights.map((i) => (
              <div key={i.wallet} className="bg-slate-900/60 border border-white/5 rounded-3xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs text-slate-400">{shortWallet(i.wallet)}</span>
                  <span className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-[10px] font-black uppercase">{i.classification}</span>
                </div>
                <p className="text-white font-bold mb-3">{i.headline}</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/10"><span className="text-slate-500 block text-xs">Best</span><span className="text-emerald-300 font-bold">{i.bestCategory}</span></div>
                  <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/10"><span className="text-slate-500 block text-xs">Worst</span><span className="text-red-300 font-bold">{i.worstCategory}</span></div>
                </div>
                <p className="text-slate-500 text-xs mt-3">{i.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {wallets.length > 0 && (
        <section className="bg-slate-900/60 border border-white/5 rounded-3xl overflow-hidden">
          <div className="p-5 border-b border-white/5 flex items-center gap-2"><Wallet className="w-5 h-5 text-pink-400" /><h2 className="font-black text-white">Wallet Summary</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs uppercase"><tr>{['Wallet','Class','PnL','Resolved','Winrate','Concentration','Reason'].map(h => <th key={h} className="text-left p-4">{h}</th>)}</tr></thead>
              <tbody>
                {wallets.map((w) => <tr key={w.wallet} className="border-t border-white/5">
                  <td className="p-4 font-mono text-slate-300">{shortWallet(w.wallet)}</td>
                  <td className="p-4 text-cyan-300 font-bold">{w.classification}</td>
                  <td className={`p-4 font-black ${w.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(w.totalPnl)}</td>
                  <td className="p-4 text-slate-300">{w.resolvedPositions}</td>
                  <td className="p-4 text-slate-300">{pct(w.winRate)}</td>
                  <td className="p-4 text-slate-300">{pct(w.concentration)}</td>
                  <td className="p-4 text-slate-500 max-w-md">{w.reason}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {categories.length > 0 && (
        <section className="bg-slate-900/60 border border-white/5 rounded-3xl overflow-hidden">
          <div className="p-5 border-b border-white/5 flex items-center gap-2"><Layers className="w-5 h-5 text-purple-400" /><h2 className="font-black text-white">Category Performance</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs uppercase"><tr>{['Wallet','Category','Trades','Wins','Losses','Winrate','PnL','Avg'].map(h => <th key={h} className="text-left p-4">{h}</th>)}</tr></thead>
              <tbody>
                {categories.slice(0, 100).map((c, idx) => <tr key={`${c.wallet}-${c.category}-${idx}`} className="border-t border-white/5">
                  <td className="p-4 font-mono text-slate-400">{shortWallet(c.wallet)}</td>
                  <td className="p-4 text-white font-bold">{c.category}</td>
                  <td className="p-4 text-slate-300">{c.trades}</td>
                  <td className="p-4 text-emerald-300">{c.wins}</td>
                  <td className="p-4 text-red-300">{c.losses}</td>
                  <td className="p-4 text-slate-300">{pct(c.winRate)}</td>
                  <td className={`p-4 font-black ${c.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(c.pnl)}</td>
                  <td className="p-4 text-slate-300">{c.avgPnl.toFixed(2)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
