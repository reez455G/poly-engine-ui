import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  Zap, 
  Settings2,
  History as HistoryIcon,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import History from './pages/History';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isHistory = location.pathname === '/history';

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 p-4 md:p-8 lg:p-12 font-sans selection:bg-pink-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] transition-colors duration-1000 ${isHistory ? 'bg-purple-900/20' : 'bg-emerald-900/20'}`} />
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
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${!isHistory ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
              >
                <Settings2 className="w-4 h-4" /> Dashboard
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
  const [token, setToken] = useState<string | null>(localStorage.getItem('it_hub_token'));
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    // Phase 3 Fix: Handle SSO token from URL
    const urlParams = new URLSearchParams(window.location.search);
    const ssoToken = urlParams.get('token');
    
    let currentToken = token;
    if (ssoToken) {
        localStorage.setItem('it_hub_token', ssoToken);
        currentToken = ssoToken;
        setToken(ssoToken);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (currentToken) {
        fetch(`http://${window.location.hostname}:4176/api/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: currentToken })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.valid) {
                localStorage.removeItem('it_hub_token');
                setToken(null);
            }
        })
        .catch(() => {})
        .finally(() => setIsVerifying(false));
    } else {
        setIsVerifying(false);
    }
  }, [token]);

  if (isVerifying) {
    return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
  }

  if (!token) {
      return (
          <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-center">
              <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-red-500/10">
                  <ShieldAlert className="w-10 h-10 text-red-500" />
              </div>
              <h1 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter">Access Restricted</h1>
              <p className="text-slate-400 max-w-sm mb-10 font-medium">This terminal requires a valid Enterprise Security Token. Please login via Project Hub.</p>
              <a 
                href={`http://${window.location.hostname}:4173`} 
                className="bg-white text-black font-black px-10 py-4 rounded-2xl hover:bg-slate-200 transition-all active:scale-95 uppercase tracking-widest text-xs"
              >
                Return to Gateway
              </a>
          </div>
      );
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
