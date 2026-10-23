import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  ArrowLeft,
  Smartphone,
  Shield,
  Zap,
  Sparkles,
  Database,
  Key,
  Home,
  Mail,
  LockKeyhole,
  UserRound,
  Phone
} from 'lucide-react';
import { UserDashboard } from './components/UserDashboard';
import { LandingPage } from './components/LandingPage';
import {
  AuthBrand,
  AuthDivider,
  AuthField,
  AuthSubmitButton,
  AuthTerms,
  GoogleAuthButton,
} from './components/AuthUI';
import { auth, isFirebaseConfigured, firebaseConfig, firebaseInitializationErrorCode } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

interface ToastData {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  position?: 'topRight' | 'center';
}

class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  state = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, errorMessage: error instanceof Error ? error.message : 'Unknown render error' };
  }

  componentDidCatch(error: unknown) {
    console.error('Dashboard render error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f8ff] px-5 py-12">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-7 text-center shadow-xl">
          <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-xl font-extrabold text-[#0c3275]">Dashboard could not be displayed</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#587098]">A dashboard component encountered an error. Your account is still signed in; reload the page to try again.</p>
          {this.state.errorMessage && <p className="mt-3 break-words rounded-lg bg-rose-50 px-3 py-2 text-left text-xs text-rose-700">Diagnostic: {this.state.errorMessage}</p>}
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-[#155EEF] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#0e4dcc]">Reload dashboard</button>
        </div>
      </div>
    );
  }
}

export default function App() {
  const [view, setView] = useState<'landing' | 'signin' | 'forgot' | 'signup' | 'dashboard'>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const [showFirebaseModal, setShowFirebaseModal] = useState(false);
  const firebaseAuthReady = Boolean(auth);

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
  const [authReady, setAuthReady] = useState(!Boolean(auth));

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const firebaseIdToken = firebaseUser.getIdToken();
        void firebaseIdToken.then((token) => fetch('/api/cloudflare/profile', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })).catch(() => undefined);
        setCurrentUser({
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Agent Partner'),
        });
        setView('dashboard');
      } else {
        setCurrentUser(null);
        setView((previousView) => previousView === 'dashboard' ? 'landing' : previousView);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

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

  const notifyEmailVerification = (
    title: string,
    message = 'A verification message was sent to your email check your (Spam folder) if not found in Inbox'
  ) => showNotification('warning', title, message, 'center');

  const completePasswordReset = (address: string) => {
    showNotification(
      'info',
      'Reset Link Sent',
      `A password reset link has been dispatched to ${address}. Check your inbox or spam folder.`
    );
    setForgotEmail('');
    setTimeout(() => setView('signin'), 2000);
  };

  const completeSignUp = (address: string) => {
    notifyEmailVerification(
      'Verify Your Email',
      'Registration successful! A verification message was sent to your email check your (Spam folder) if not found in Inbox'
    );
    setEmail(address);
    setView('signin');
  };

  const handleSelectService = (serviceKey: 'data' | 'airtime' | 'exam-pins' | 'electricity') => {
    const serviceLabels: Record<string, string> = {
      data: 'Mobile Data',
      airtime: 'Airtime VTU',
      'exam-pins': 'Exam Pins',
      electricity: 'Electricity Payments',
    };
    const label = serviceLabels[serviceKey] || 'Digital Services';
    if (currentUser) {
      setView('dashboard');
      showNotification('info', label, `Redirecting to ${label} terminal...`);
    } else {
      setView('signin');
      showNotification('info', label, `Please sign in or create an account to access ${label}.`);
    }
  };

  const getFirebaseErrorMessage = (err: any): string => {
    const code = err?.code || '';
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password combination. Please try again.';
      case 'auth/email-already-in-use':
        return 'This email address is already registered. Please sign in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Access to this account is temporarily disabled due to many failed attempts. Please reset your password or try again later.';
      case 'auth/network-request-failed':
        return 'Network connection error. Please verify your internet connection.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in popup was closed before completion.';
      default:
        return err?.message || 'An error occurred during authentication. Please try again.';
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showNotification('error', 'Error', 'Please enter your email and password');
      return;
    }

    setIsLoading(true);

    if (isFirebaseConfigured && !auth) {
      setIsLoading(false);
      showNotification('error', 'Firebase Unavailable', `Firebase Auth could not initialize${firebaseInitializationErrorCode ? ` (${firebaseInitializationErrorCode})` : ''}.`);
      return;
    }

    if (isFirebaseConfigured && auth) {
      try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const displayName = user.displayName || email.split('@')[0];
        setCurrentUser({ email: user.email || email, name: displayName });

        if (!user.emailVerified) {
          notifyEmailVerification('Verify Your Email');
        } else {
          showNotification('success', 'Welcome', 'Login Successfully');
        }

        setView('dashboard');
      } catch (err: any) {
        showNotification('error', 'Authentication Failed', getFirebaseErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    } else {
      // Fallback preview mode when Firebase keys have not yet been placed into .env.local
      setTimeout(() => {
        setIsLoading(false);

        if (email.toLowerCase() === 'unverified@agenthub.ng') {
          notifyEmailVerification('Verify Your Email');
        } else if (password === 'wrong' || password.length < 4) {
          showNotification('error', 'Error', 'Invalid email or password combination. Please try again.');
        } else {
          const userName = email.split('@')[0].replace(/[._]/g, ' ');
          const formattedName = userName.charAt(0).toUpperCase() + userName.slice(1);
          setCurrentUser({ email, name: formattedName || 'Agent Partner' });

          showNotification('success', 'Welcome', 'Login Successfully');

           setView('dashboard');
        }
      }, 1100);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      showNotification('error', 'Error', 'Please enter your registered email address.');
      return;
    }

    setForgotLoading(true);

    if (isFirebaseConfigured && auth) {
      try {
        await sendPasswordResetEmail(auth, forgotEmail);
        completePasswordReset(forgotEmail);
      } catch (err: any) {
        showNotification('error', 'Error', getFirebaseErrorMessage(err));
      } finally {
        setForgotLoading(false);
      }
    } else {
      setTimeout(() => {
        setForgotLoading(false);
        completePasswordReset(forgotEmail);
      }, 1000);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail || !signupPassword || !signupPhone) {
      showNotification('error', 'Error', 'Please fill in all required registration fields.');
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      showNotification('error', 'Error', 'Passwords do not match.');
      return;
    }
    if (signupPassword.length < 6) {
      showNotification('error', 'Error', 'Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);

    if (isFirebaseConfigured && !auth) {
      setIsLoading(false);
      showNotification('error', 'Firebase Unavailable', `Firebase Auth could not initialize${firebaseInitializationErrorCode ? ` (${firebaseInitializationErrorCode})` : ''}.`);
      return;
    }

    if (isFirebaseConfigured && auth) {
      try {
        await setPersistence(auth, browserSessionPersistence);
        const userCredential = await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
        if (signupName) {
          await updateProfile(userCredential.user, { displayName: signupName });
        }
        await sendEmailVerification(userCredential.user);

        completeSignUp(signupEmail);
      } catch (err: any) {
        showNotification('error', 'Registration Failed', getFirebaseErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    } else {
      setTimeout(() => {
        setIsLoading(false);
        completeSignUp(signupEmail);
      }, 1200);
    }
  };

  const handleLogout = async () => {
    if (isFirebaseConfigured && auth) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error('Firebase sign out error:', err);
      }
    }
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

  const renderToast = () => {
    if (!toast) return null;
    return (
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
    );
  };

  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f8ff] text-sm font-semibold text-[#234577]">Checking your account…</div>;
  }

  const renderFirebaseModal = () => {
    if (!showFirebaseModal) return null;
    return (
      <div
        style={{ zIndex: 1100 }}
        className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
      >
        <div className="w-full max-w-xl bg-slate-900 border border-sky-700/80 rounded-2xl shadow-2xl p-6 text-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-sky-800">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Firebase Configuration</h3>
                <p className="text-xs text-cyan-200">Connect your Firebase Authentication project</p>
              </div>
            </div>
            <button
              onClick={() => setShowFirebaseModal(false)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className={`p-3.5 rounded-xl border flex items-start space-x-3 ${
              firebaseAuthReady
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-950/50 border-amber-500/40 text-amber-200'
            }`}>
              {firebaseAuthReady ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold text-sm">
                  {firebaseAuthReady
                    ? 'Firebase SDK is initialized and connected!'
                    : 'Firebase credentials not yet provided'}
                </p>
                <p className="mt-1 leading-relaxed opacity-90">
                  {firebaseAuthReady
                    ? `Project ID: "${firebaseConfig.projectId}". Logins and sign-ups connect to your live Firebase Auth.`
                    : 'The project is ready! Simply paste your Firebase web config keys into .env.local to enable real sign-in, registration, and password recovery.'}
                </p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-sky-900 space-y-2">
              <span className="font-bold text-cyan-300 uppercase tracking-wider text-[11px] block">
                Quick Setup Steps:
              </span>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                <li>Open <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold">Firebase Console</a> and select your project.</li>
                <li>Click <strong>Project Settings (Gear icon)</strong> &gt; <strong>General</strong> &gt; <strong>Your apps</strong> &gt; <strong>Web App (&lt;/&gt;)</strong>.</li>
                <li>In Firebase Console, ensure <strong>Authentication &gt; Sign-in method &gt; Email/Password</strong> is enabled.</li>
                <li>Open <code className="text-cyan-300 bg-sky-950 px-1.5 py-0.5 rounded">.env.local</code> in your project root and paste the values.</li>
              </ol>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-sky-900 font-mono text-[11px] text-cyan-200 overflow-x-auto">
              <div className="text-slate-400"># Located in .env.local:</div>
              <div>VITE_FIREBASE_API_KEY="{firebaseConfig.apiKey ? '••••••••' : ''}"</div>
              <div>VITE_FIREBASE_AUTH_DOMAIN="{firebaseConfig.authDomain || ''}"</div>
              <div>VITE_FIREBASE_PROJECT_ID="{firebaseConfig.projectId || ''}"</div>
              <div>VITE_FIREBASE_APP_ID="{firebaseConfig.appId || ''}"</div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setShowFirebaseModal(false)}
              className="px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white rounded-lg font-semibold text-xs cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 1. PUBLIC LANDING PAGE VIEW
  if (view === 'landing') {
    return (
      <>
        {renderToast()}
        <LandingPage
          onSignIn={() => setView('signin')}
          onSignUp={() => setView('signup')}
          onSelectService={handleSelectService}
          isFirebaseConfigured={firebaseAuthReady}
          onOpenFirebaseModal={() => setShowFirebaseModal(true)}
        />
        {renderFirebaseModal()}
      </>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col text-slate-800 antialiased selection:bg-blue-500 selection:text-white" style={{ fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif" }}>

      {/* Loading Overlay */}
      {isLoading && (
        <div
          style={{ zIndex: 999 }}
          className="fixed inset-0 flex items-center justify-center transition-all duration-300 backdrop-blur-sm bg-slate-900/60"
        >
          <div className="flex flex-col items-center bg-white p-8 rounded-2xl border border-blue-100 shadow-2xl">
            <img
              src="/assets/img/sameduhub-logo-transparent.png"
              alt="Loading..."
              className="loader_img w-16 h-auto drop-shadow-xl"
            />
            <p className="mt-4 text-xs font-bold uppercase tracking-widest text-blue-700">
              Authenticating...
            </p>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {renderToast()}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* DASHBOARD VIEW */}
        {view === 'dashboard' && currentUser ? (
          <DashboardErrorBoundary>
            <UserDashboard
              currentUser={currentUser}
              onLogout={handleLogout}
              onHome={() => setView('landing')}
              onNotify={(title, message) => showNotification('info', title, message)}
              onProfileUpdated={(name) => setCurrentUser((user) => user ? { ...user, name } : user)}
            />
          </DashboardErrorBoundary>
        ) : (
          /* ============================================================
             AUTH SCREENS — NEW SPLIT PANEL DESIGN (matches reference)
             ============================================================ */
          <div className="flex-1 flex flex-col lg:flex-row min-h-screen">

            {/* ── LEFT PANEL: Dark Blue Branding ── */}
            <div
              className="relative lg:w-[48%] xl:w-[45%] flex-shrink-0 flex flex-col justify-between overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #0d2b8e 0%, #1a3fbd 40%, #1253d4 70%, #0b2070 100%)' }}
            >
              {/* Background blobs */}
              <div className="absolute top-[-80px] right-[-60px] w-72 h-72 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #3b7fff 0%, transparent 70%)' }} />
              <div className="absolute bottom-[-60px] left-[-40px] w-64 h-64 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #ff7b00 0%, transparent 70%)' }} />
              <div className="absolute top-[40%] left-[-30px] w-48 h-48 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #60a5fa 0%, transparent 70%)' }} />

              <div className="relative z-10 p-8 lg:p-10 flex flex-col h-full">
                {/* Logo + Nav */}
                <div className="flex items-center justify-between">
                  <button onClick={() => setView('landing')} className="flex items-center space-x-3 group cursor-pointer">
                    <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center group-hover:bg-white/25 transition-all">
                      <img src="/assets/img/sameduhub-logo-transparent.png" alt="SamEduHub" className="w-7 h-7 object-contain" />
                    </div>
                    <div>
                      <span className="font-bold text-white text-lg"><span className="text-white">Sam</span><span className="text-[#ff9c2a]">EduHub</span></span>
                      <p className="text-[10px] text-blue-200 -mt-0.5">Data • Airtime • Exam Pins • Bills</p>
                    </div>
                  </button>
                </div>

                {/* Hero copy */}
                <div className="mt-10 mb-6">
                  <h1 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight tracking-tight">
                    Your Digital Services
                  </h1>
                  <h2 className="text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight" style={{ color: '#ff9c2a' }}>
                    Made Simple.
                  </h2>
                  <p className="mt-4 text-sm text-blue-200 leading-relaxed max-w-sm">
                    Buy data bundles, recharge airtime, pay electricity bills and get examination pins — all in one place.
                  </p>
                </div>

                {/* Feature list */}
                <div className="space-y-4 mb-8">
                  {[
                    { icon: Database, label: 'Buy Data', sub: 'Stay connected always', color: '#2563eb' },
                    { icon: Smartphone, label: 'Buy Airtime', sub: 'Recharge your line', color: '#f97316' },
                    { icon: Sparkles, label: 'Exam Pins', sub: 'Get examination pins', color: '#2563eb' },
                    { icon: Zap, label: 'Electricity Bills', sub: 'Pay your bills with ease', color: '#2563eb' },
                  ].map((f, i) => {
                    const FIcon = f.icon;
                    return (
                      <div key={i} className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border border-white/20" style={{ background: 'rgba(255,255,255,0.12)' }}>
                          <FIcon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm">{f.label}</div>
                          <div className="text-blue-200 text-xs">{f.sub}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Phone mockup */}
                <div className="flex-1 flex items-end justify-center">
                  <div className="relative w-full max-w-xs">
                    <img
                      src="/assets/img/phone-mockup.jpg"
                      alt="SamEduHub App"
                      className="w-full object-contain drop-shadow-2xl"
                      style={{ maxHeight: '340px', borderRadius: '16px' }}
                    />
                  </div>
                </div>

                {/* Tagline */}
                <div className="mt-6">
                  <p className="text-white/90 italic font-semibold text-lg" style={{ fontFamily: 'Georgia, serif' }}>
                    Simple. Convenient.
                  </p>
                  <p className="text-white/90 italic font-semibold text-lg" style={{ fontFamily: 'Georgia, serif' }}>
                    Built for you.
                  </p>
                  <div className="mt-2 h-0.5 w-24 rounded-full" style={{ background: '#ff9c2a' }} />
                </div>
              </div>
            </div>

            {/* ── RIGHT PANEL: Auth Form ── */}
            <div className="flex-1 bg-white flex flex-col">
              {/* Top bar: Already have account */}
              <div className="flex items-center justify-end px-8 py-5 border-b border-slate-100">
                {view === 'signup' ? (
                  <>
                    <span className="text-sm text-slate-500 mr-3">Already have an account?</span>
                    <button
                      onClick={() => setView('signin')}
                      className="px-5 py-2 rounded-lg border-2 border-blue-600 text-blue-600 font-semibold text-sm hover:bg-blue-600 hover:text-white transition-all cursor-pointer"
                    >
                      Sign In
                    </button>
                  </>
                ) : view === 'signin' ? (
                  <>
                    <span className="text-sm text-slate-500 mr-3">Don't have an account?</span>
                    <button
                      onClick={() => setView('signup')}
                      className="px-5 py-2 rounded-lg border-2 border-blue-600 text-blue-600 font-semibold text-sm hover:bg-blue-600 hover:text-white transition-all cursor-pointer"
                    >
                      Sign Up
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-slate-500 mr-3">Remember your password?</span>
                    <button
                      onClick={() => setView('signin')}
                      className="px-5 py-2 rounded-lg border-2 border-blue-600 text-blue-600 font-semibold text-sm hover:bg-blue-600 hover:text-white transition-all cursor-pointer"
                    >
                      Sign In
                    </button>
                  </>
                )}
              </div>

              {/* Form area */}
              <div className="flex-1 flex items-center justify-center px-6 py-8 overflow-y-auto">
                <div className="w-full max-w-md">
                  {renderAuthCard()}
                </div>
              </div>

              {/* Developer footer bar */}
              <div className="border-t border-slate-100 bg-slate-50 py-2.5 px-6 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold text-slate-600">SamEduHub</span>
                  <span className="text-slate-400">sameduhub/sign-in</span>
                  <button
                    onClick={() => setShowFirebaseModal(true)}
                    className={`ml-2 inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                      firebaseAuthReady
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                        : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    <Database className="w-3 h-3" />
                    <span>{firebaseAuthReady ? 'Firebase: Connected' : 'Firebase: Setup'}</span>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={() => setView('landing')} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-medium cursor-pointer flex items-center space-x-1">
                    <Home className="w-3 h-3" /><span>Home</span>
                  </button>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-500">Quick Fill:</span>
                  <button onClick={() => { setView('signin'); fillDemoAccount('valid'); }} className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px] font-medium cursor-pointer">Valid</button>
                  <button onClick={() => { setView('signin'); fillDemoAccount('unverified'); }} className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded text-[11px] font-medium cursor-pointer">Unverified</button>
                  <button onClick={() => { setView('signin'); fillDemoAccount('wrong'); }} className="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded text-[11px] font-medium cursor-pointer">Wrong Pwd</button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Firebase Credentials Modal */}
      {renderFirebaseModal()}
    </div>
  );

  function renderAuthCard() {
    return (
      <>
        {/* ═══════════════ SIGN IN ═══════════════ */}
        {view === 'signin' && (
          <div className="w-full">
            <AuthBrand />

            <h2 className="text-2xl font-extrabold text-slate-900 mb-1">Welcome Back!</h2>
            <p className="text-sm text-slate-500 mb-7">Sign in to your SamEduHub account to continue.</p>

            <form id="login_form" onSubmit={handleSignIn} className="space-y-4">
              <AuthField
                type="email"
                id="signin_email"
                name="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email Address"
                icon={<Mail className="w-[18px] h-[18px]" />}
                required
              />

              <AuthField
                type={showPassword ? 'text' : 'password'}
                id="signin_password"
                name="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="pr-12"
                icon={<LockKeyhole className="w-[18px] h-[18px]" />}
                endAdornment={(
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer" tabIndex={-1}>
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                )}
                required
              />

              {/* Remember & Forgot */}
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input id="remember" type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer" />
                  <span className="text-sm text-slate-600">Remember me</span>
                </label>
                <button type="button" onClick={() => setView('forgot')} className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer">Forgot password?</button>
              </div>

              <AuthSubmitButton id="signin_submit" isLoading={isLoading} loadingLabel="Signing in...">
                Sign In
              </AuthSubmitButton>
              <AuthDivider className="my-1" />
              <GoogleAuthButton id="google_signin" label="Continue with Google" onClick={() => showNotification('info', 'Google Sign-In', 'Google OAuth coming soon!')} />
              <AuthTerms action="signing in" className="mt-2" />
            </form>
          </div>
        )}

        {/* ═══════════════ FORGOT PASSWORD ═══════════════ */}
        {view === 'forgot' && (
          <div className="w-full">
            <AuthBrand />

            <h2 className="text-2xl font-extrabold text-slate-900 mb-1">Reset Password</h2>
            <p className="text-sm text-slate-500 mb-7">
              Enter your registered email and we'll send you a password reset link.
            </p>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <AuthField
                type="email"
                id="forgot_email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                placeholder="Email Address"
                icon={<Mail className="w-[18px] h-[18px]" />}
                required
              />

              <AuthSubmitButton id="forgot_submit" isLoading={forgotLoading} loadingLabel="Sending Link...">
                Send Reset Link
              </AuthSubmitButton>

              <button type="button" onClick={() => setView('signin')} className="w-full flex items-center justify-center space-x-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer py-1">
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Sign In</span>
              </button>
            </form>
          </div>
        )}

        {/* ═══════════════ SIGN UP ═══════════════ */}
        {view === 'signup' && (
          <div className="w-full">
            <AuthBrand className="mb-5" />

            <h2 className="text-2xl font-extrabold text-slate-900 mb-1">Create Your Account</h2>
            <p className="text-sm text-slate-500 mb-6">
              Join SamEduHub and enjoy fast, secure and convenient access to all our digital services.
            </p>

            <form onSubmit={handleSignUp} className="space-y-4">
              <AuthField
                type="text"
                id="signup_name"
                value={signupName}
                onChange={e => setSignupName(e.target.value)}
                placeholder="Full Name"
                icon={<UserRound className="w-[18px] h-[18px]" />}
                required
              />
              <AuthField
                type="email"
                id="signup_email"
                value={signupEmail}
                onChange={e => setSignupEmail(e.target.value)}
                placeholder="Email Address"
                icon={<Mail className="w-[18px] h-[18px]" />}
                required
              />
              <AuthField
                type="tel"
                id="signup_phone"
                value={signupPhone}
                onChange={e => setSignupPhone(e.target.value)}
                placeholder="Phone Number"
                icon={<Phone className="w-[18px] h-[18px]" />}
                required
              />
              <AuthField
                type="password"
                id="signup_password"
                value={signupPassword}
                onChange={e => setSignupPassword(e.target.value)}
                placeholder="Password"
                icon={<LockKeyhole className="w-[18px] h-[18px]" />}
                required
              />
              <AuthField
                type="password"
                id="signup_confirm"
                value={signupConfirmPassword}
                onChange={e => setSignupConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                icon={<LockKeyhole className="w-[18px] h-[18px]" />}
                required
              />

              <AuthSubmitButton id="signup_submit" isLoading={isLoading} loadingLabel="Creating Account" className="mt-1">
                Create Account
              </AuthSubmitButton>
              <AuthDivider />
              <GoogleAuthButton id="google_signup" label="Continue with Google" onClick={() => showNotification('info', 'Google Sign-Up', 'Google OAuth coming soon!')} />
              <AuthTerms action="creating an account" />
            </form>
          </div>
        )}
      </>
    );
  }
}
