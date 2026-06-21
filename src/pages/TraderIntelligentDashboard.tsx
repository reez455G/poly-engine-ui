import { useEffect, useState } from 'react';
import { Brain, RefreshCw, AlertTriangle, Clock } from 'lucide-react';

const API_BASE = window.location.origin;

type AnalysisRow = {
  timestamp: string;
  slug: string;
  asset: string;
  result_side: string;
  binance_pred_1_15s: string;
  binance_pred_15_45s: string;
  binance_pred_45_60s: string;
  binance_pred_1m_5m: string;
  chainlink_pred_1_15s: string;
  chainlink_pred_15_45s: string;
  chainlink_pred_45_60s: string;
  chainlink_pred_1m_5m: string;
  is_correct_1_15s: string;
  is_correct_15_45s: string;
  is_correct_45_60s: string;
  is_correct_1m_5m: string;
  open_price: number;
  binance_correct_count: number;
  chainlink_correct_count: number;
  analysis_text: string;
};

export default function TraderIntelligentDashboard() {
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/agy-market-analyses?limit=40`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (json.available) {
        setRows(json.rows || []);
      } else {
        setError(json.error || "QuestDB analytical tables not initialized yet.");
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load AGY market analysis data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const getPredictionBadge = (pred: string, actual: string) => {
    if (!pred || pred === "UNKNOWN") return <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px] font-bold">UNKNOWN</span>;
    const correct = pred === actual;
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
        correct ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
      }`}>
        {pred}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center animate-pulse">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">Trader Intelligent Dashboard</h1>
              <p className="text-slate-400 text-sm font-medium">Prediksi market dari data polymarket + bursa (analis by agy)</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
            Automatic 5-minute analysis from AGY AI & QuestDB.
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
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/25 text-amber-200 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" /> {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="p-12 rounded-3xl bg-slate-900/40 border border-white/5 text-center">
          <p className="text-slate-400 font-bold">Waiting for finalized market slots...</p>
          <p className="text-slate-500 text-xs mt-2">The AGY Analysis daemon analyzes slots every 5 minutes at slot expiration.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {rows.map((row) => {
            const timeStr = row.timestamp ? new Date(row.timestamp).toLocaleTimeString() : '—';
            const slugTime = row.slug ? row.slug.split('-').pop() : null;
            const slotInterval = slugTime ? (() => {
              const startMs = Number(slugTime) * 1000;
              const endMs = startMs + 5 * 60 * 1000;
              return `${new Date(startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}-${new Date(endMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            })() : '—';

            return (
              <div key={row.slug} className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-lg hover:border-purple-500/20 transition-all">
                {/* HEAD DETAILS */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/5 mb-4">
                  <div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-widest mr-2">
                      {row.asset}
                    </span>
                    <span className="font-mono text-sm text-slate-300 font-bold">{row.slug}</span>
                    <span className="text-[11px] font-bold text-slate-500 ml-3">Interval: {slotInterval}</span>
                    <span className="text-[11px] font-bold text-slate-600 ml-3">Analyzed: {timeStr}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-[8px] uppercase tracking-widest text-slate-500 mb-0.5">Final Outcome</div>
                      <div className={`text-base font-black uppercase ${
                        row.result_side === 'UP' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {row.result_side}
                      </div>
                    </div>
                    <div className="h-8 w-[1px] bg-white/5" />
                    <div className="text-right">
                      <div className="text-[8px] uppercase tracking-widest text-slate-500 mb-0.5">Accuracy</div>
                      <div className="text-base font-black text-white font-mono">
                        {row.binance_correct_count}/4
                      </div>
                    </div>
                  </div>
                </div>

                {/* GRID PREDICTIONS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* BINANCE PREDICTIONS */}
                  <div className="p-4 bg-black/30 border border-white/5 rounded-2xl">
                    <div className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-3 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Binance Spot Predictions
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest mb-1.5">1-15s</span>
                        {getPredictionBadge(row.binance_pred_1_15s, row.result_side)}
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest mb-1.5">15-45s</span>
                        {getPredictionBadge(row.binance_pred_15_45s, row.result_side)}
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest mb-1.5">45-60s</span>
                        {getPredictionBadge(row.binance_pred_45_60s, row.result_side)}
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest mb-1.5">1m-5m</span>
                        {getPredictionBadge(row.binance_pred_1m_5m, row.result_side)}
                      </div>
                    </div>
                  </div>

                  {/* CHAINLINK PREDICTIONS */}
                  <div className="p-4 bg-black/30 border border-white/5 rounded-2xl">
                    <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-3 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Chainlink Oracle Predictions
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest mb-1.5">1-15s</span>
                        {getPredictionBadge(row.chainlink_pred_1_15s, row.result_side)}
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest mb-1.5">15-45s</span>
                        {getPredictionBadge(row.chainlink_pred_15_45s, row.result_side)}
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest mb-1.5">45-60s</span>
                        {getPredictionBadge(row.chainlink_pred_45_60s, row.result_side)}
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest mb-1.5">1m-5m</span>
                        {getPredictionBadge(row.chainlink_pred_1m_5m, row.result_side)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* AGY NARRATIVE */}
                <div className="mt-4 p-3 bg-purple-500/5 border border-purple-500/10 rounded-2xl text-[11px] font-bold text-purple-300 flex items-start gap-2.5">
                  <Brain className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    {row.analysis_text || "No AGY analysis narrative available for this slot."}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
