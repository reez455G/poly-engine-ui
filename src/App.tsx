import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  Zap, 
  Settings2,
  History as HistoryIcon,
  ExternalLink,
  BarChart4,
  Brain
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Backtest from './pages/Backtest';
import TraderAnalysis from './pages/TraderAnalysis';
import TraderIntelligentDashboard from './pages/TraderIntelligentDashboard';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isHistory = location.pathname === '/history';
  const isBacktest = location.pathname === '/backtest';
  const isTraderAnalysis = location.pathname === '/trader-analysis';
  const isTraderIntelligentDashboard = location.pathname === '/trader-intelligent-dashboard';

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 p-4 md:p-8 lg:p-12 font-sans selection:bg-pink-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] transition-colors duration-1000 ${isHistory ? 'bg-purple-900/20' : isBacktest ? 'bg-pink-950/20' : isTraderAnalysis ? 'bg-cyan-950/20' : isTraderIntelligentDashboard ? 'bg-purple-950/25' : 'bg-emerald-900/20'}`} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <nav className="flex flex-col md:flex-row md:items-center justify-between mb-8 bg-slate-900/50 backdrop-blur-xl border border-white/5 p-4 rounded-3xl shadow-xl">
           <div className="flex items-center gap-3 mb-4 md:mb-0 px-2">
              <div className="w-8 h-8 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
                 <Zap className="w-4 h-4 text-pink-500" />
              </div>
              <span className="font-black text-lg tracking-tight text-white">Poly Engine UI</span>
           </div>
           
           <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5">
              <Link 
                to="/"
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${(!isHistory && !isBacktest && !isTraderAnalysis && !isTraderIntelligentDashboard) ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
              >
                <Settings2 className="w-4 h-4" /> Dashboard
              </Link>
              <Link 
                to="/backtest"
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${isBacktest ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
              >
                <BarChart4 className="w-4 h-4" /> Backtest
              </Link>
              <Link 
                to="/trader-intelligent-dashboard"
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${isTraderIntelligentDashboard ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
              >
                <Brain className="w-4 h-4" /> Trader Intelligent
              </Link>
              <Link 
                to="/trader-analysis"
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${isTraderAnalysis ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
              >
                <Brain className="w-4 h-4" /> Trader Intel
              </Link>
              <Link 
                to="/history"
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${isHistory ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
              >
                <HistoryIcon className="w-4 h-4" /> Session History
              </Link>
           </div>

           <div className="hidden md:flex items-center gap-3 px-2">
               <a href={`http://${window.location.hostname}:4173`} className="text-xs font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors">
                  <ExternalLink className="w-3 h-3"/> Project Hub
               </a>
           </div>
        </nav>

        {children}

        <footer className="pt-12 mt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-600 text-[10px] font-bold tracking-widest uppercase">
          <p>© 2026 Poly Engine Advanced UI</p>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              API Controller: Online
            </span>
            <span>v2.1.0 Architecture</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/trader-intelligent-dashboard" element={<TraderIntelligentDashboard />} />
          <Route path="/trader-analysis" element={<TraderAnalysis />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
