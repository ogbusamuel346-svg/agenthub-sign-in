import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  GraduationCap,
  Headphones,
  Home,
  LogOut,
  Menu,
  Radio,
  ReceiptText,
  Smartphone,
  UserRound,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { DashboardPageContent, type DashboardPageId } from './DashboardPages';
import { getWalletBalance } from '../services/wallet';
import { getTransactions, type ExamPurchaseHistoryItem } from '../services/smeApi';

interface DashboardUser {
  email: string;
  name: string;
}

interface UserDashboardProps {
  currentUser: DashboardUser;
  onLogout: () => void;
  onHome: () => void;
  onNotify: (title: string, message: string) => void;
  onProfileUpdated: (name: string) => void;
}

const sidebarItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'data', label: 'Buy Data', icon: Radio },
  { id: 'airtime', label: 'Buy Airtime', icon: Smartphone },
  { id: 'exam-pins', label: 'Exam Pins', icon: GraduationCap },
  { id: 'electricity', label: 'Electricity Bills', icon: Zap },
  { id: 'transactions', label: 'Transactions', icon: ReceiptText },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'support', label: 'Help & Support', icon: Headphones },
] as const;

const serviceCards = [
  { id: 'data', title: 'Buy Data', subtitle: 'Get data bundles', icon: Database, tone: 'blue' },
  { id: 'airtime', title: 'Buy Airtime', subtitle: 'Recharge now', icon: Smartphone, tone: 'orange' },
  { id: 'exam-pins', title: 'Exam Pins', subtitle: 'Get exam pins', icon: GraduationCap, tone: 'blue' },
  { id: 'electricity', title: 'Electricity Bills', subtitle: 'Pay your bills', icon: Zap, tone: 'orange' },
] as const;

const quickLinks = [
  { id: 'transactions', label: 'View Transaction History', icon: ReceiptText },
  { id: 'wallet', label: 'Manage Wallet', icon: Wallet },
  { id: 'profile', label: 'Update Profile', icon: UserRound },
  { id: 'support', label: 'Customer Support', icon: Headphones },
] as const;

const toneClasses = {
  blue: 'bg-[#e7f0ff] text-[#1559d6]',
  orange: 'bg-[#fff0e3] text-[#ff7617]',
} as const;

export function UserDashboard({ currentUser, onLogout, onHome, onNotify, onProfileUpdated }: UserDashboardProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<DashboardPageId>('dashboard');
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [recentTransactions, setRecentTransactions] = useState<ExamPurchaseHistoryItem[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const firstName = currentUser.name.trim().split(/\s+/)[0] || 'Samuel';
  const avatarLetter = firstName.charAt(0).toUpperCase();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('wallet_status')) setActivePage('wallet');
  }, []);

  useEffect(() => {
    let active = true;
    setWalletLoading(true);
    getWalletBalance()
      .then((wallet) => { if (active) setWalletBalance(wallet.balance); })
      .catch(() => { if (active) setWalletBalance(null); })
      .finally(() => { if (active) setWalletLoading(false); });
    return () => { active = false; };
  }, [currentUser.email]);

  useEffect(() => {
    let active = true;
    setTransactionsLoading(true);
    getTransactions()
      .then((result) => { if (active) setRecentTransactions(result.transactions.slice(0, 3)); })
      .catch(() => { if (active) setRecentTransactions([]); })
      .finally(() => { if (active) setTransactionsLoading(false); });
    return () => { active = false; };
  }, [currentUser.email]);

  const handleSidebarClick = (page: DashboardPageId) => {
    setSidebarOpen(false);
    setActivePage(page);
  };

  const handleServiceClick = (page: DashboardPageId) => {
    setActivePage(page);
  };

  return (
    <div className="min-h-screen bg-[#f4f8ff] text-[#0b2b69]">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-[#031a45]/45 lg:hidden"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[234px] flex-col bg-gradient-to-b from-[#062b66] to-[#06204c] text-white shadow-xl transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[66px] items-center border-b border-white/10 px-7">
          <img src="/assets/img/sameduhub-logo-transparent.png" alt="SamEduHub" className="h-10 w-10 object-contain" />
          <span className="ml-2 text-[19px] font-extrabold tracking-tight">
            <span className="text-white">Sam</span><span className="text-[#ff7b1a]">EduHub</span>
          </span>
          <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" className="ml-auto rounded p-1 text-white/60 hover:bg-white/10 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-4">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.label}
                onClick={() => handleSidebarClick(item.id)}
                className={`flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left text-[13px] font-medium transition-colors ${activePage === item.id ? 'bg-[#1764e9] text-white shadow-lg shadow-blue-950/20' : 'text-blue-100/90 hover:bg-white/10 hover:text-white'}`}
              >
                <Icon className="h-[20px] w-[20px] shrink-0" strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mx-4 mb-5 rounded-lg border border-blue-300/40 bg-[#0c397d]/80 p-4 shadow-inner">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-bold text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/30">
              <Headphones className="h-4 w-4" />
            </div>
            <span>Need Help?</span>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-blue-100/80">Our support team is here for you. Get quick assistance whenever you need it.</p>
          <button type="button" onClick={() => onNotify('Contact Support', 'Our support team will be with you shortly.')} className="w-full rounded-full bg-[#1463ee] px-3 py-2 text-[11px] font-bold text-white shadow-md transition hover:bg-[#2b76f5]">
            Contact Support
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[234px]">
        <header className="flex h-[66px] items-center justify-between border-b border-[#e4ebf5] bg-white px-5 shadow-sm sm:px-7">
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="rounded-md p-1.5 text-[#123b84] hover:bg-[#edf3ff] lg:hidden">
            <Menu className="h-6 w-6" />
          </button>
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="hidden rounded-md p-1.5 text-[#123b84] hover:bg-[#edf3ff] lg:block">
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-4 sm:gap-7">
            <button type="button" onClick={() => onNotify('Notifications', 'You have no new notifications.')} aria-label="Notifications" className="relative rounded-full p-1.5 text-[#0b3b8e] hover:bg-[#edf3ff]">
              <Bell className="h-5 w-5" strokeWidth={1.8} />
              <span className="absolute right-1 top-0 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>
            <button type="button" onClick={() => setActivePage('profile')} className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-[#f3f7ff]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0b4197] text-sm font-bold text-white">{avatarLetter}</span>
              <span className="hidden max-w-[130px] truncate text-[12px] font-bold text-[#092c6e] sm:inline">{currentUser.name}</span>
              <ChevronDown className="hidden h-4 w-4 text-[#123b84] sm:block" />
            </button>
            <button type="button" onClick={onLogout} aria-label="Sign out" title="Sign out" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold text-[#52709d] transition hover:bg-rose-50 hover:text-[#e65353] sm:px-2.5 sm:text-xs">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1000px] space-y-5 px-4 py-6 sm:px-6 lg:px-7">
          {activePage === 'dashboard' ? (
            <>
          <section className="relative overflow-hidden rounded-lg bg-gradient-to-r from-[#e8f2ff] to-[#deebfc] px-6 py-5 sm:px-7">
            <div className="relative z-10">
              <h1 className="text-[25px] font-extrabold tracking-tight text-[#092d70] sm:text-[28px]">Welcome back, {firstName} <span aria-hidden="true">👋</span></h1>
              <p className="mt-1 text-[14px] text-[#456694]">Access all your digital services in one place. Fast, secure and convenient.</p>
            </div>
            <div className="pointer-events-none absolute right-8 top-3 hidden rotate-[-5deg] text-right font-serif text-[24px] font-bold italic leading-tight text-[#092d70] sm:block">
              <div>Stay Connected</div><div>Keep Moving</div>
              <div className="ml-7 mt-[-2px] h-1 w-28 rotate-[-4deg] rounded-full bg-[#ff7414]" />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.62fr_repeat(4,1fr)]">
            <div className="relative flex min-h-[154px] flex-col justify-between overflow-hidden rounded-lg bg-gradient-to-br from-[#1465ed] to-[#0d4dbd] p-5 text-white shadow-sm">
              <div className="absolute -right-5 -top-8 h-32 w-32 rounded-full border border-white/10" />
                <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/10"><Wallet className="h-6 w-6" /></div>
                  <div><p className="text-[13px] font-bold">Wallet Balance</p><p className="mt-1 text-[24px] font-extrabold leading-none">{walletLoading ? 'Loading…' : walletBalance === null ? 'Unavailable' : `₦${walletBalance}`}</p></div>
                </div>
                <button type="button" onClick={() => setActivePage('wallet')} aria-label="Open wallet" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"><ArrowRight className="h-4 w-4" /></button>
              </div>
              <button type="button" onClick={() => setActivePage('wallet')} className="w-fit rounded-full bg-[#ff7b17] px-5 py-2 text-[12px] font-extrabold text-white shadow-md transition hover:bg-[#ff922f]">Fund Wallet</button>
            </div>

            {serviceCards.map((service) => {
              const Icon = service.icon;
              return (
                <button type="button" key={service.title} onClick={() => handleServiceClick(service.id)} className="group flex min-h-[154px] flex-col items-center justify-center rounded-lg border border-[#d9e5f5] bg-white p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#9bbcf5] hover:shadow-md">
                  <span className={`mb-3 flex h-[58px] w-[58px] items-center justify-center rounded-full ${toneClasses[service.tone]}`}><Icon className="h-7 w-7" strokeWidth={1.8} /></span>
                  <span className="text-[13px] font-extrabold text-[#0b2e70]">{service.title}</span>
                  <span className="mt-1 text-[11px] text-[#6680a7]">{service.subtitle}</span>
                </button>
              );
            })}
          </section>

          <section className="relative min-h-[202px] overflow-hidden rounded-lg bg-gradient-to-r from-[#e7f1ff] to-[#dceafe] px-7 py-8 sm:px-8">
            <div className="relative z-10 max-w-[390px]">
              <h2 className="text-[27px] font-extrabold tracking-tight text-[#0b3275]">Fast. Easy. Reliable.</h2>
              <p className="mt-2 max-w-[350px] text-[14px] leading-relaxed text-[#456694]">Top up your phone, buy data, pay bills and get exam pins with just a few clicks.</p>
              <button type="button" onClick={() => setActivePage('data')} className="mt-4 inline-flex items-center gap-3 rounded-full bg-[#ff7a16] px-6 py-3 text-[12px] font-extrabold text-white shadow-md transition hover:bg-[#ff922e]">Explore Services <ArrowRight className="h-4 w-4" /></button>
            </div>
            <div className="pointer-events-none absolute -right-1 bottom-[-80px] hidden h-[265px] w-[410px] rotate-[-8deg] rounded-[38%] bg-[#1463df] opacity-95 lg:block" />
            <div className="pointer-events-none absolute right-[95px] bottom-[-108px] hidden h-[260px] w-[115px] rotate-[11deg] rounded-[22px] bg-[#ff8618] lg:block" />
            <img src="/assets/img/phone-mockup.jpg" alt="SamEduHub mobile app" className="pointer-events-none absolute bottom-[-48px] right-12 hidden h-[245px] w-[158px] rotate-[3deg] rounded-[25px] object-cover object-top shadow-2xl lg:block" />
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.8fr_1fr]">
            <div className="overflow-hidden rounded-lg border border-[#d9e5f5] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#edf2f8] px-5 py-4">
                <h2 className="text-[17px] font-extrabold text-[#0c3275]">Recent Transactions</h2>
                <button type="button" onClick={() => setActivePage('transactions')} className="flex items-center gap-1 text-[11px] font-bold text-[#155bd0] hover:text-[#0b3d98]">View All <ArrowRight className="h-3.5 w-3.5" /></button>
              </div>
              <div className="px-5 pb-5">
                {transactionsLoading ? <div className="mt-3 flex min-h-[150px] items-center justify-center rounded-lg bg-[#f4f7fb] px-5 text-center text-xs text-[#6c82a4]">Loading transaction history…</div> : recentTransactions.length ? <div className="mt-3 divide-y divide-[#edf2f8] rounded-lg border border-[#edf2f8]">{recentTransactions.map(transaction => <div key={transaction.reference} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><p className="truncate text-xs font-extrabold text-[#173b79]">{transaction.kind === 'wallet_funding' ? 'Wallet top-up' : transaction.product?.provider || transaction.providerName || 'Exam PIN'}</p><p className="mt-1 truncate font-mono text-[10px] text-[#7890b2]">{transaction.reference}</p></div><span className={`shrink-0 text-[11px] font-bold ${transaction.status === 'successful' ? 'text-emerald-600' : transaction.status === 'failed' ? 'text-rose-600' : 'text-amber-700'}`}>{transaction.kind === 'wallet_funding' && transaction.status === 'successful' ? 'Credited' : transaction.status}</span></div>)}</div> : <div className="mt-3 flex min-h-[150px] flex-col items-center justify-center rounded-lg bg-[#f4f7fb] px-5 text-center"><FileText className="h-9 w-9 text-[#9bb5df]" /><p className="mt-3 text-sm font-bold text-[#234577]">No transactions yet</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-[#6c82a4]">Your authenticated purchases and wallet top-ups will appear here.</p><button type="button" onClick={() => setActivePage('transactions')} className="mt-3 text-xs font-extrabold text-[#155EEF] hover:underline">Open transaction history</button></div>}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-lg border border-[#d9e5f5] bg-white px-5 py-4 shadow-sm">
                <h2 className="mb-3 text-[17px] font-extrabold text-[#0c3275]">Quick Links</h2>
                <div className="divide-y divide-[#edf2f8] border-t border-[#e5edf8]">
                  {quickLinks.map((link) => {
                    const Icon = link.icon;
                    return <button type="button" key={link.label} onClick={() => setActivePage(link.id)} className="flex w-full items-center justify-between py-3 text-left text-[11px] font-semibold text-[#173b79] hover:text-[#1560dc]"><span className="flex items-center gap-4"><Icon className="h-5 w-5 text-[#0b3f91]" strokeWidth={1.8} />{link.label}</span><ChevronRight className="h-4 w-4" /></button>;
                  })}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-[#0e4eb8] to-[#073b91] px-5 py-5 text-white shadow-sm">
                <div className="relative z-10 max-w-[190px]">
                  <h2 className="text-[19px] font-extrabold leading-tight">Your Essential<br />Digital Services<br />Start Here.</h2>
                  <p className="mt-3 text-[10px] leading-relaxed text-blue-100">Create your SamEduHub account and explore our available digital services.</p>
                  <button type="button" onClick={() => onNotify('Get Started', 'Choose a service to get started.')} className="mt-4 rounded-full bg-[#ff7a16] px-5 py-2.5 text-[11px] font-extrabold text-white hover:bg-[#ff922e]">Get Started!</button>
                </div>
                <div className="absolute -right-8 top-8 h-24 w-24 rotate-[-25deg] rounded-full bg-[#ff8618]" />
                <div className="absolute right-5 top-9 h-24 w-14 rotate-[28deg] rounded-lg bg-[#e9f2ff]/80 shadow-xl" />
                <Smartphone className="absolute right-8 top-11 h-20 w-10 rotate-[20deg] text-[#0b438f]" />
              </div>
            </div>
          </section>
            </>
          ) : (
            <DashboardPageContent
              page={activePage}
              currentUser={currentUser}
              onNavigate={setActivePage}
              onNotify={onNotify}
              onProfileUpdated={onProfileUpdated}
            />
          )}
        </main>

        <footer className="mt-2 border-t border-[#e1eaf5] bg-white px-6 py-6 sm:px-8">
          <div className="mx-auto grid max-w-[1000px] gap-6 text-[10px] text-[#5b7399] sm:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div><div className="flex items-center gap-2"><img src="/assets/img/sameduhub-logo-transparent.png" alt="SamEduHub" className="h-9 w-9 object-contain" /><span className="text-[18px] font-extrabold"><span className="text-[#173c83]">Sam</span><span className="text-[#ff7517]">EduHub</span></span></div><p className="mt-3 max-w-[190px] leading-relaxed">Your trusted partner for data, airtime, exam pins and more.</p></div>
            <div><h3 className="mb-3 font-extrabold text-[#0c3275]">Quick Links</h3><div className="space-y-2"><button type="button" onClick={onHome} className="block hover:text-[#1262dc]">Home</button><button type="button" onClick={() => setActivePage('data')} className="block hover:text-[#1262dc]">Services</button><button type="button" onClick={onLogout} className="block hover:text-[#1262dc]">Sign In</button><button type="button" onClick={onLogout} className="block hover:text-[#1262dc]">Sign Up</button></div></div>
            <div><h3 className="mb-3 font-extrabold text-[#0c3275]">Our Services</h3><div className="space-y-2"><button type="button" onClick={() => handleServiceClick('data')} className="block hover:text-[#1262dc]">Buy Data</button><button type="button" onClick={() => handleServiceClick('airtime')} className="block hover:text-[#1262dc]">Buy Airtime</button><button type="button" onClick={() => handleServiceClick('exam-pins')} className="block hover:text-[#1262dc]">Exam Pins</button><button type="button" onClick={() => handleServiceClick('electricity')} className="block hover:text-[#1262dc]">Electricity Bills</button></div></div>
            <div><h3 className="mb-3 font-extrabold text-[#0c3275]">Support</h3><div className="space-y-2"><button type="button" onClick={() => onNotify('Help & Support', 'Our support team will be with you shortly.')} className="flex items-center gap-2 hover:text-[#1262dc]"><Headphones className="h-3.5 w-3.5" />Help &amp; Support</button><button type="button" onClick={() => onNotify('Contact Us', 'Our support team will be with you shortly.')} className="flex items-center gap-2 hover:text-[#1262dc]"><Smartphone className="h-3.5 w-3.5" />Contact Us</button></div><div className="mt-5 flex items-center gap-3"><button type="button" onClick={() => onNotify('Privacy Policy', 'Privacy policy is available for review.')} className="hover:text-[#1262dc]">Privacy Policy</button><span>|</span><button type="button" onClick={() => onNotify('Terms & Conditions', 'Terms and conditions are available for review.')} className="hover:text-[#1262dc]">Terms &amp; Conditions</button></div></div>
          </div>
          <div className="mx-auto mt-6 max-w-[1000px] border-t border-[#edf2f8] pt-4 text-[10px] text-[#6e84a5]">© 2025 SamEduHub. All rights reserved.</div>
        </footer>
      </div>
    </div>
  );
}
