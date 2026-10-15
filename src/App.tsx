import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  ArrowLeft,
  Wallet,
  Smartphone,
  Shield,
  CreditCard,
  FileText,
  Tv,
  LogOut,
  RefreshCw,
  ExternalLink,
  Zap,
  Layers,
  Sparkles
} from 'lucide-react';
import { VtuAnimation } from './components/VtuAnimation';

interface ToastData {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  position?: 'topRight' | 'center';
}

export default function App() {
  const [view, setView] = useState<'signin' | 'forgot' | 'signup' | 'dashboard'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  // Layout mode: 'split' (blended with VTU animation) or 'classic' (exact original centered form)
  const [layoutMode, setLayoutMode] = useState<'split' | 'classic'>('split');

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Sign up state
  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  // Logged-in state
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showNotification = (
    type: 'success' | 'error' | 'warning' | 'info',
    title: string,
    message: string,
    position: 'topRight' | 'center' = 'topRight'
  ) => {
    setToast({
      id: Date.now().toString(),
      type,
      title,
      message,
      position,
    });
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showNotification('error', 'Error', 'Please enter your email and password');
      return;
    }

    setIsLoading(true);

    // Simulate authentic server response matching agenthub backend
    setTimeout(() => {
      setIsLoading(false);

      if (email.toLowerCase() === 'unverified@agenthub.ng') {
        showNotification(
          'warning',
          'Verify Your Email',
          'A verification message was sent to your email check your (Spam folder) if not found in Inbox',
          'center'
        );
      } else if (password === 'wrong' || password.length < 4) {
        showNotification('error', 'Error', 'Invalid email or password combination. Please try again.');
      } else {
        const userName = email.split('@')[0].replace(/[._]/g, ' ');
        const formattedName = userName.charAt(0).toUpperCase() + userName.slice(1);
        setCurrentUser({ email, name: formattedName || 'Agent Partner' });

        showNotification('success', 'Welcome', 'Login Successfully');

        setTimeout(() => {
          setView('dashboard');
        }, 1200);
      }
    }, 1100);
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      showNotification('error', 'Error', 'Please enter your registered email address.');
      return;
    }

    setForgotLoading(true);
    setTimeout(() => {
      setForgotLoading(false);
      showNotification(
        'info',
        'Reset Link Sent',
        `A password reset link has been dispatched to ${forgotEmail}. Check your inbox or spam folder.`
      );
      setForgotEmail('');
      setTimeout(() => {
        setView('signin');
      }, 2000);
    }, 1000);
  };

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail || !signupPassword || !signupPhone) {
      showNotification('error', 'Error', 'Please fill in all required registration fields.');
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      showNotification('error', 'Error', 'Passwords do not match.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      showNotification(
        'warning',
        'Verify Your Email',
        'Registration successful! A verification message was sent to your email check your (Spam folder) if not found in Inbox',
        'center'
      );
      setEmail(signupEmail);
      setView('signin');
    }, 1200);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setEmail('');
    setPassword('');
    setView('signin');
    showNotification('info', 'Signed Out', 'You have been safely signed out of your account.');
  };

  const fillDemoAccount = (type: 'valid' | 'unverified' | 'wrong') => {
    if (type === 'valid') {
      setEmail('agent@agenthub.com.ng');
      setPassword('AgentPass2026!');
      showNotification('info', 'Demo Filled', 'Credentials loaded: agent@agenthub.com.ng');
    } else if (type === 'unverified') {
      setEmail('unverified@agenthub.ng');
      setPassword('password123');
      showNotification('warning', 'Demo Filled', 'Unverified account credentials loaded');
    } else {
      setEmail('agent@agenthub.com.ng');
      setPassword('wrong');
      showNotification('error', 'Demo Filled', 'Invalid password loaded for testing error toast');
    }
  };

  return (
    <div
      style={{
        backgroundImage: 'url(/assets/img/verifyall_bg.jpg)',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
      className="min-h-screen w-full relative flex flex-col justify-between text-slate-800 antialiased selection:bg-cyan-500 selection:text-white"
    >
      {/* Dark tint overlay for pristine contrast */}
      <div className="absolute inset-0 bg-slate-950/40 pointer-events-none backdrop-blur-[1.5px]" />

      {/* Loading Overlay with authentic bouncing verifyall logo */}
      {isLoading && (
        <div
          style={{ zIndex: 999 }}
          className="fixed inset-0 flex items-center justify-center transition-all duration-300 backdrop-blur-sm bg-slate-900/50"
        >
          <div className="flex flex-col items-center bg-slate-900/85 p-8 rounded-2xl border border-sky-600/50 shadow-2xl backdrop-blur-md">
            <img
              src="/assets/img/verifyall-2.png"
              alt="Loading..."
              className="loader_img w-20 h-auto drop-shadow-2xl"
            />
            <p className="mt-4 text-xs font-bold uppercase tracking-widest text-cyan-200">
              Authenticating Credentials...
            </p>
          </div>
        </div>
      )}

      {/* Toast Notification (Balloon matching iziToast) */}
      {toast && (
        <div
          style={{ zIndex: 1000 }}
          className={`fixed transition-all ${
            toast.position === 'center'
              ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 toast-pop-center max-w-md w-[92vw]'
              : 'top-5 right-5 toast-slide-in max-w-sm w-[92vw] sm:w-96'
          }`}
        >
          <div
            className={`relative rounded-xl p-4 shadow-2xl text-white flex items-start space-x-3.5 border ${
              toast.type === 'success'
                ? 'bg-emerald-600 border-emerald-500 shadow-emerald-950/40'
                : toast.type === 'error'
                ? 'bg-rose-600 border-rose-500 shadow-rose-950/40'
                : toast.type === 'warning'
                ? 'bg-amber-500 border-amber-400 text-slate-900 shadow-amber-950/40'
                : 'bg-sky-600 border-sky-500 shadow-sky-950/40'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-white" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-white" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-slate-900" />}
              {toast.type === 'info' && <Shield className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 pr-2">
              <h4
                className={`font-bold text-sm tracking-wide ${
                  toast.type === 'warning' ? 'text-slate-950' : 'text-white'
                }`}
              >
                {toast.title}
              </h4>
              <p
                className={`text-xs mt-1 leading-relaxed ${
                  toast.type === 'warning' ? 'text-slate-900/90' : 'text-white/95'
                }`}
              >
                {toast.message}
              </p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="shrink-0 opacity-80 hover:opacity-100 transition-opacity p-1 rounded-md cursor-pointer"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center px-4 py-8 sm:px-6">
        {/* LOGGED IN AGENT PORTAL DASHBOARD */}
        {view === 'dashboard' && currentUser ? (
          <section className="w-full max-w-5xl mx-auto my-auto py-6">
            <div className="bg-sky-900/90 backdrop-blur-xl border border-sky-700/80 rounded-2xl shadow-2xl overflow-hidden text-white">
              {/* Header */}
              <div className="bg-sky-950/80 px-6 py-4 flex flex-wrap items-center justify-between border-b border-sky-800 gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-11 h-11 rounded-xl bg-white/10 p-1 border border-cyan-400/30 flex items-center justify-center">
                    <img
                      src="/assets/img/sameduhub-logo-transparent.png"
                      alt="SamEduHub"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-lg text-white">SamEduHub Portal</span>
                      <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/40 uppercase">
                        Verified Agent
                      </span>
                    </div>
                    <p className="text-xs text-cyan-300">{currentUser.email}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="bg-sky-800/80 border border-sky-700 px-3.5 py-1.5 rounded-lg flex items-center space-x-2">
                    <Wallet className="w-4 h-4 text-cyan-300" />
                    <div>
                      <div className="text-[10px] text-cyan-200 uppercase font-semibold">Wallet Balance</div>
                      <div className="text-sm font-extrabold text-white">₦78,450.00</div>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer shadow-sm"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>

              {/* Main Body */}
              <div className="p-6 space-y-6">
                {/* Welcome Card & Live VTU Terminal */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  <div className="lg:col-span-5 space-y-3">
                    <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-[11px] font-bold border border-cyan-500/30">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      <span>VTU GATEWAY SYNCHRONIZED</span>
                    </div>
                    <h2 className="text-xl font-bold text-white">
                      Welcome back, {currentUser.name}!
                    </h2>
                    <p className="text-xs sm:text-sm text-cyan-100/90 leading-relaxed">
                      Your agent terminal is active for instant MTN, Airtel, Glo & 9mobile VTU recharges, electricity tokens, and NIN verification slips.
                    </p>
                    <div className="pt-2 flex flex-wrap gap-2.5">
                      <button
                        onClick={() => showNotification('info', 'Monnify Gateway', 'Redirecting to Monnify funding portal...')}
                        className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-lg text-xs tracking-wider uppercase shadow cursor-pointer transition-all"
                      >
                        + Fund Wallet
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-7">
                    <VtuAnimation />
                  </div>
                </div>

                {/* Services Grid */}
                <div>
                  <h3 className="text-sm font-bold text-cyan-200 uppercase tracking-wider mb-3">
                    Available Agent Services
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                    {[
                      { icon: Shield, title: 'NIN Slip & Search', desc: 'Premium & Standard Slip', color: 'from-emerald-500 to-teal-600' },
                      { icon: FileText, title: 'BVN Services', desc: 'Validation & Retrieval', color: 'from-blue-500 to-indigo-600' },
                      { icon: Smartphone, title: 'Airtime & Data', desc: 'MTN, Airtel, Glo, 9mobile', color: 'from-amber-500 to-orange-600' },
                      { icon: Zap, title: 'Electricity Bills', desc: 'All Nigerian DISCOs', color: 'from-purple-500 to-pink-600' },
                      { icon: Tv, title: 'Cable TV Subs', desc: 'DStv, GOtv, Startimes', color: 'from-cyan-500 to-blue-600' },
                      { icon: CreditCard, title: 'Airtime to Cash', desc: 'Instant 85% conversion', color: 'from-rose-500 to-red-600' },
                      { icon: ExternalLink, title: 'CAC Business', desc: 'Registration & Filing', color: 'from-indigo-500 to-violet-600' },
                      { icon: RefreshCw, title: 'JAMB Pins', desc: 'DE & UTME e-PINs', color: 'from-teal-500 to-emerald-600' },
                    ].map((srv, idx) => {
                      const IconComp = srv.icon;
                      return (
                        <div
                          key={idx}
                          onClick={() => showNotification('info', srv.title, `${srv.title} service terminal ready.`)}
                          className="p-3.5 rounded-xl bg-sky-950/60 hover:bg-sky-950 border border-sky-800/80 hover:border-cyan-400/50 transition-all cursor-pointer group shadow-sm hover:shadow-cyan-500/10"
                        >
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${srv.color} flex items-center justify-center text-white mb-2 shadow`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div className="font-bold text-xs text-white group-hover:text-cyan-300 transition-colors">
                            {srv.title}
                          </div>
                          <div className="text-[11px] text-cyan-300/70 mt-0.5 truncate">
                            {srv.desc}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Back to sign in / switch toggle */}
                <div className="pt-2 flex justify-between items-center text-xs text-cyan-300 border-t border-sky-800">
                  <span>Terminal ID: AH-NG-88492</span>
                  <button
                    onClick={() => setView('signin')}
                    className="hover:underline text-white font-semibold cursor-pointer"
                  >
                    Switch back to Sign In page
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          /* AUTH SCREENS: SIGN IN / FORGOT / SIGN UP */
          <div className="w-full max-w-6xl mx-auto flex items-center justify-center my-auto">
            {layoutMode === 'split' ? (
              /* BLENDED HERO + FORM SPLIT LAYOUT */
              <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center my-auto">
                {/* Left Side: Animated VTU Terminal Showcase */}
                <div className="lg:col-span-7 flex flex-col justify-center space-y-6 text-white order-2 lg:order-1">
                  {/* Status chip */}
                  <div className="inline-flex items-center space-x-2.5 px-3.5 py-1.5 rounded-full bg-[#071b42]/85 border border-[#2588ed]/40 backdrop-blur-md self-start shadow-md shadow-[#071b42]/30">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff941f] animate-pulse shadow-[0_0_10px_rgba(255,148,31,0.55)]" />
                    <span className="text-xs font-bold text-blue-100 uppercase tracking-wider">
                      Automated VTU & Utility Technology Services
                    </span>
                  </div>

                  <div>
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
                      Automated Multi-Network{' '}
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#55adff] via-[#1680f5] to-[#ff941f]">
                        VTU & Agency Banking
                      </span>
                    </h1>
                    <div className="mt-3 h-1 w-24 rounded-full bg-gradient-to-r from-[#1680f5] via-[#ff941f] to-[#ffb54a]" />
                    <p className="mt-3 text-sm sm:text-base text-cyan-100/90 leading-relaxed max-w-xl">
                      Instant automated delivery for MTN, Airtel, Glo, 9mobile data & airtime bundles, prepaid electricity tokens, cable subscriptions, and NIN digital identity slips.
                    </p>
                  </div>

                  {/* VTU Animation Component */}
                  <VtuAnimation />
                </div>

                {/* Right Side: Exact Authentic AgentHub Form */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center order-1 lg:order-2">
                  {renderAuthCard()}
                </div>
              </div>
            ) : (
              /* CLASSIC CENTERED AUTH VIEW (Exact original layout) */
              <div className="w-full flex flex-col items-center justify-center my-auto">
                {renderAuthCard()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Demo Credentials & Quick Test Helper Floating Bar */}
      <div className="relative z-20 w-full bg-slate-950/90 backdrop-blur-md border-t border-sky-800/60 py-2.5 px-4 text-xs text-slate-300">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-white">SamEduHub:</span>
            <span className="text-cyan-200">sameduhub/sign-in</span>

            {/* Layout Mode Toggle */}
            <div className="ml-3 pl-3 border-l border-sky-800 flex items-center space-x-1.5">
              <button
                onClick={() => setLayoutMode(layoutMode === 'split' ? 'classic' : 'split')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer flex items-center space-x-1 ${
                  layoutMode === 'split'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                    : 'bg-sky-900/60 text-slate-300 border-sky-700 hover:text-white'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>{layoutMode === 'split' ? 'VTU Blended View (Active)' : 'Centered Form Only'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 text-[11px]">Quick Fill:</span>
            <button
              onClick={() => {
                setView('signin');
                fillDemoAccount('valid');
              }}
              className="px-2.5 py-1 bg-sky-800 hover:bg-sky-700 text-white rounded font-medium text-[11px] transition-colors cursor-pointer border border-sky-600"
            >
              Valid Login
            </button>
            <button
              onClick={() => {
                setView('signin');
                fillDemoAccount('unverified');
              }}
              className="px-2.5 py-1 bg-amber-600/80 hover:bg-amber-600 text-white rounded font-medium text-[11px] transition-colors cursor-pointer border border-amber-500"
            >
              Unverified Email
            </button>
            <button
              onClick={() => {
                setView('signin');
                fillDemoAccount('wrong');
              }}
              className="px-2.5 py-1 bg-rose-700/80 hover:bg-rose-700 text-white rounded font-medium text-[11px] transition-colors cursor-pointer border border-rose-600"
            >
              Wrong Password
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function renderAuthCard() {
    return (
      <>
        {/* SIGN IN VIEW */}
        {view === 'signin' && (
          <section className="w-full flex flex-col items-center justify-center">
            {/* Logo link matching original markup */}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="flex items-center mb-5 text-2xl font-semibold group focus:outline-none"
              title="SamEduHub"
            >
              <div className="rounded-2xl w-20 h-20 overflow-hidden shadow-xl bg-white/10 p-1 backdrop-blur-xs transition-transform duration-300 group-hover:scale-105">
                <img
                  src="/assets/img/sameduhub-logo-transparent.png"
                  alt="SamEduHub Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            </a>

            {/* Auth Card with original classes: bg-sky-800 border-sky-700 */}
            <div className="w-full rounded-2xl shadow-2xl border md:mt-0 sm:max-w-md xl:p-0 bg-sky-800 border-sky-700 backdrop-blur-md">
              <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold leading-tight tracking-tight text-white md:text-2xl">
                    Sign in to your account
                  </h2>
                </div>

                <form className="space-y-4 md:space-y-5" id="login_form" onSubmit={handleSignIn}>
                  {/* Email Field */}
                  <div>
                    <label
                      htmlFor="email"
                      className="block mb-2 text-sm font-medium text-white"
                    >
                      Your email
                    </label>
                    <input
                      type="email"
                      name="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="border py-2.5 px-3 sm:text-sm rounded-lg block w-full bg-white border-cyan-600 text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-inner"
                      placeholder="your@email.com"
                      required
                    />
                  </div>

                  {/* Password Field */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="password"
                        className="block text-sm font-medium text-white"
                      >
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-xs text-cyan-200 hover:text-white flex items-center space-x-1 focus:outline-none cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hide</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Show</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="border py-2.5 px-3 sm:text-sm rounded-lg block w-full bg-white border-cyan-600 text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-inner"
                        required
                      />
                    </div>
                  </div>

                  {/* Remember Me & Forgot Password Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="remember"
                          aria-describedby="remember"
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 border border-cyan-300 rounded bg-cyan-700 text-blue-600 focus:ring-2 focus:ring-primary-600 ring-offset-cyan-800 cursor-pointer"
                        />
                      </div>
                      <div className="ml-2.5 text-sm">
                        <label
                          htmlFor="remember"
                          className="text-cyan-300 cursor-pointer select-none text-xs sm:text-sm"
                        >
                          Remember me
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="text-xs sm:text-sm text-white font-bold hover:underline focus:outline-none cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full text-white bg-slate-900 hover:bg-slate-950 focus:ring-4 focus:outline-none focus:ring-blue-400/40 font-semibold rounded-lg text-sm px-5 py-3 text-center transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Signing in...' : 'Sign in'}
                  </button>

                  {/* Sign up prompt */}
                  <div className="text-center pt-1 border-t border-sky-700/60">
                    <p className="text-xs sm:text-sm font-light text-cyan-200">
                      Don’t have an account yet?{' '}
                      <button
                        type="button"
                        onClick={() => setView('signup')}
                        className="text-white font-bold hover:underline focus:outline-none cursor-pointer"
                      >
                        Sign up
                      </button>
                    </p>
                  </div>
                </form>
              </div>
            </div>
          </section>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {view === 'forgot' && (
          <section className="w-full flex flex-col items-center justify-center">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="flex items-center mb-5 text-2xl font-semibold"
            >
              <div className="rounded-2xl w-20 h-20 overflow-hidden shadow-xl bg-white/10 p-1 backdrop-blur-xs">
                <img
                  src="/assets/img/sameduhub-logo-transparent.png"
                  alt="SamEduHub Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            </a>

            <div className="w-full rounded-2xl shadow-2xl border md:mt-0 sm:max-w-md xl:p-0 bg-sky-800 border-sky-700 backdrop-blur-md">
              <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
                <div>
                  <h2 className="text-xl font-bold leading-tight tracking-tight text-white md:text-2xl">
                    Reset your password
                  </h2>
                  <p className="text-xs sm:text-sm text-cyan-200 mt-1.5 leading-relaxed">
                    Enter the email address registered with your SamEduHub account, and we’ll send you a password recovery link.
                  </p>
                </div>

                <form className="space-y-4 md:space-y-5" onSubmit={handleForgotPassword}>
                  <div>
                    <label
                      htmlFor="forgot_email"
                      className="block mb-2 text-sm font-medium text-white"
                    >
                      Your email
                    </label>
                    <input
                      type="email"
                      id="forgot_email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="border py-2.5 px-3 sm:text-sm rounded-lg block w-full bg-white border-cyan-600 text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-inner"
                      placeholder="your@email.com"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="inline-block w-full px-6 py-3 font-bold text-center text-white uppercase align-middle transition-all bg-gradient-to-tl from-blue-600 to-cyan-400 hover:from-blue-700 hover:to-cyan-500 rounded-lg cursor-pointer shadow-lg text-xs tracking-wider disabled:opacity-70 active:scale-[0.99]"
                  >
                    {forgotLoading ? 'Sending Link...' : 'Send Reset Link'}
                  </button>

                  <div className="text-center pt-2 border-t border-sky-700/60">
                    <button
                      type="button"
                      onClick={() => setView('signin')}
                      className="inline-flex items-center text-xs sm:text-sm text-cyan-200 hover:text-white font-semibold hover:underline cursor-pointer focus:outline-none"
                    >
                      <ArrowLeft className="w-4 h-4 mr-1.5" />
                      Back to Sign in
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
        )}

        {/* SIGN UP VIEW */}
        {view === 'signup' && (
          <section className="w-full flex flex-col items-center justify-center">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="flex items-center mb-5 text-2xl font-semibold"
            >
              <div className="rounded-2xl w-16 h-16 sm:w-20 sm:h-20 overflow-hidden shadow-xl bg-white/10 p-1 backdrop-blur-xs">
                <img
                  src="/assets/img/sameduhub-logo-transparent.png"
                  alt="SamEduHub Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            </a>

            <div className="w-full rounded-2xl shadow-2xl border md:mt-0 sm:max-w-md xl:p-0 bg-sky-800 border-sky-700 backdrop-blur-md">
              <div className="p-6 space-y-4 sm:p-8">
                <div>
                  <h2 className="text-xl font-bold leading-tight tracking-tight text-white md:text-2xl">
                    Create SamEduHub Account
                  </h2>
                  <p className="text-xs text-cyan-200 mt-1">
                    Join Nigeria's leading agent network for NIN, BVN, and bill payments.
                  </p>
                </div>

                <form className="space-y-3.5" onSubmit={handleSignUp}>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium text-white">Full Name</label>
                    <input
                      type="text"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="border py-2 px-3 text-sm rounded-lg block w-full bg-white border-cyan-600 text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Ibrahim Abubakar"
                      required
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5 text-xs font-medium text-white">Phone Number</label>
                    <input
                      type="tel"
                      value={signupPhone}
                      onChange={(e) => setSignupPhone(e.target.value)}
                      className="border py-2 px-3 text-sm rounded-lg block w-full bg-white border-cyan-600 text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="08012345678"
                      required
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5 text-xs font-medium text-white">Email Address</label>
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="border py-2 px-3 text-sm rounded-lg block w-full bg-white border-cyan-600 text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="agent@example.com"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1.5 text-xs font-medium text-white">Password</label>
                      <input
                        type="password"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="border py-2 px-3 text-sm rounded-lg block w-full bg-white border-cyan-600 text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1.5 text-xs font-medium text-white">Confirm</label>
                      <input
                        type="password"
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        className="border py-2 px-3 text-sm rounded-lg block w-full bg-white border-cyan-600 text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full text-white bg-slate-900 hover:bg-slate-950 font-semibold rounded-lg text-sm px-5 py-2.5 mt-2 transition-all cursor-pointer shadow-lg active:scale-[0.99]"
                  >
                    Register as Agent
                  </button>

                  <div className="text-center pt-2 border-t border-sky-700/60">
                    <p className="text-xs text-cyan-200">
                      Already registered?{' '}
                      <button
                        type="button"
                        onClick={() => setView('signin')}
                        className="text-white font-bold hover:underline cursor-pointer"
                      >
                        Sign in here
                      </button>
                    </p>
                  </div>
                </form>
              </div>
            </div>
          </section>
        )}
      </>
    );
  }
}
