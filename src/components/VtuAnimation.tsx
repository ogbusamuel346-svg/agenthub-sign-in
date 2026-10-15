import { useState, useEffect } from 'react';
import {
  Smartphone,
  Zap,
  Wifi,
  CheckCircle2,
  Tv,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  UserRound
} from 'lucide-react';

interface VtuTransaction {
  id: string;
  type: 'airtime' | 'data' | 'electricity' | 'cable' | 'cash';
  network: 'MTN' | 'Airtel' | 'Glo' | '9mobile' | 'IKEDC' | 'DStv';
  recipient: string;
  amount: string;
  status: 'Completed' | 'Delivered' | 'Active';
  time: string;
  badgeColor: string;
}

const SAMPLE_TRANSACTIONS: VtuTransaction[] = [
  {
    id: 'TX-901',
    type: 'data',
    network: 'MTN',
    recipient: '0803 291 4820',
    amount: '10GB (₦2,800)',
    status: 'Delivered',
    time: 'Just now',
    badgeColor: 'bg-amber-400 text-slate-950',
  },
  {
    id: 'TX-902',
    type: 'airtime',
    network: 'Airtel',
    recipient: '0802 819 3301',
    amount: '₦2,500 VTU',
    status: 'Completed',
    time: '3s ago',
    badgeColor: 'bg-rose-500 text-white',
  },
  {
    id: 'TX-903',
    type: 'electricity',
    network: 'IKEDC',
    recipient: 'Meter: 4509-2819',
    amount: '₦6,000 Token',
    status: 'Completed',
    time: '8s ago',
    badgeColor: 'bg-emerald-500 text-white',
  },
  {
    id: 'TX-904',
    type: 'data',
    network: 'Glo',
    recipient: '0805 771 9024',
    amount: '7.5GB (₦1,850)',
    status: 'Delivered',
    time: '14s ago',
    badgeColor: 'bg-green-600 text-white',
  },
  {
    id: 'TX-905',
    type: 'cable',
    network: 'DStv',
    recipient: 'IUC: 10492810',
    amount: 'Compact (₦15,700)',
    status: 'Active',
    time: '21s ago',
    badgeColor: 'bg-cyan-500 text-slate-950',
  },
];

export function VtuAnimation() {
  const [activeTab, setActiveTab] = useState<'MTN' | 'Airtel' | 'Glo' | '9mobile'>('MTN');
  const [currentTxIndex, setCurrentTxIndex] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSuccess, setSimSuccess] = useState(false);

  // Cycle transactions smoothly
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTxIndex((prev) => (prev + 1) % SAMPLE_TRANSACTIONS.length);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  const triggerInstantRecharge = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimSuccess(false);

    setTimeout(() => {
      setIsSimulating(false);
      setSimSuccess(true);
      setTimeout(() => setSimSuccess(false), 2500);
    }, 1000);
  };

  const activeTx = SAMPLE_TRANSACTIONS[currentTxIndex];

  return (
    <div className="relative w-full rounded-2xl bg-gradient-to-b from-sky-950/80 via-slate-900/90 to-sky-950/90 border border-cyan-500/35 p-5 sm:p-6 backdrop-blur-xl shadow-2xl overflow-hidden group">
      {/* Background ambient lighting */}
      <div className="absolute -top-20 -left-20 w-56 h-56 bg-[#1680f5]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-[#0d3f96]/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#ff941f]/[0.06] rounded-full blur-2xl pointer-events-none" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#ff941f] to-transparent opacity-90" />

      {/* Top Header Row with Live Network Telemetry */}
      <div className="flex items-center justify-between pb-4 border-b border-sky-800/80">
        <div className="flex items-center space-x-2.5">
          <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-[#1680f5]/20 border border-[#55adff]/40 text-blue-200">
            <Zap className="w-4 h-4 text-[#55adff]" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#ff941f] animate-ping" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-white flex items-center space-x-1.5">
              <span>SamEduHub VTU Engine</span>
              <span className="bg-[#ff941f]/15 text-[#ffb45e] text-[9px] font-bold px-1.5 py-0.2 rounded border border-[#ff941f]/35 uppercase">
                Instant 0.8s
              </span>
            </h3>
            <p className="text-[11px] text-cyan-300/80">Direct Multi-Network Telco Gateway</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-sky-900/60 border border-sky-700/60 px-2.5 py-1 rounded-full text-[11px] text-cyan-200">
          <Wifi className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>API: 18ms</span>
        </div>
      </div>

      <div className="customer-delight-scene mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 rounded-xl border border-[#2588ed]/20 bg-gradient-to-r from-[#071b42]/90 via-sky-900/55 to-[#47290f]/30 p-3 sm:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] sm:gap-4 sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="customer-avatar relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#55adff]/30 bg-gradient-to-br from-[#1680f5]/25 to-[#ff941f]/10 text-blue-100 shadow-inner shadow-blue-200/5">
            <UserRound className="h-6 w-6 stroke-[1.6]" aria-hidden="true" />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-sky-950 bg-[#ff941f]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300/80">Customer experience</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-white">Fast service. Peace of mind.</p>
          </div>
        </div>

        <div className="customer-flow relative hidden h-px bg-cyan-100/10 sm:block" aria-hidden="true">
          <span className="customer-flow-pulse" />
          <ArrowRight className="absolute -right-1 -top-2 h-4 w-4 text-cyan-200/60" />
        </div>

        <div className="customer-delivery-card col-span-2 flex min-w-0 items-center gap-3 rounded-lg border border-emerald-300/15 bg-slate-950/45 px-3 py-2.5 sm:col-span-1">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">Data bundle delivered</p>
            <p className="mt-0.5 text-[10px] text-cyan-100/65">MTN · 10 GB · Just now</p>
          </div>
          <CheckCircle2 className="customer-delivery-check h-4 w-4 shrink-0 text-emerald-300" />
        </div>
      </div>

      {/* Centerpiece: Animated Interactive VTU Phone / Terminal */}
      <div className="my-5 relative flex flex-col md:flex-row items-center justify-between gap-5">
        {/* Mobile Terminal Card */}
        <div className="w-full md:w-64 bg-slate-950/90 rounded-2xl border-2 border-cyan-500/40 p-4 shadow-2xl relative overflow-hidden shrink-0">
          {/* Signal wave top bar */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 pb-2 mb-2 border-b border-slate-800">
            <span className="font-mono text-cyan-300">SamEduHub 5G</span>
            <div className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>99% Battery</span>
            </div>
          </div>

          {/* Virtual Wallet Screen in Phone */}
          <div className="bg-gradient-to-br from-sky-900/60 to-blue-950/80 rounded-xl p-3 border border-cyan-500/30 mb-3 relative overflow-hidden">
            <div className="text-[10px] uppercase font-bold text-cyan-200/80 flex items-center justify-between">
              <span>Agent VTU Wallet</span>
              <span className="text-emerald-400 text-[10px] font-bold">Auto-Settled</span>
            </div>
            <div className="text-xl font-black text-white mt-1 tracking-tight flex items-baseline space-x-1">
              <span>₦148,920.00</span>
              <span className="text-[10px] text-cyan-300 font-normal">NGN</span>
            </div>
            {/* Animated subtle charging bar */}
            <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
              <div className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full w-4/5 animate-pulse" />
            </div>
          </div>

          {/* Network Selection Buttons */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase text-slate-300 flex items-center justify-between">
              <span>Select Telco</span>
              <span className="text-cyan-400 text-[10px]">Instant 2.5% Bonus</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { name: 'MTN', color: 'bg-amber-400 text-slate-950 hover:bg-amber-300', activeRing: 'ring-2 ring-amber-300' },
                { name: 'Airtel', color: 'bg-red-500 text-white hover:bg-red-400', activeRing: 'ring-2 ring-red-300' },
                { name: 'Glo', color: 'bg-emerald-600 text-white hover:bg-emerald-500', activeRing: 'ring-2 ring-emerald-300' },
                { name: '9mobile', color: 'bg-lime-500 text-slate-950 hover:bg-lime-400', activeRing: 'ring-2 ring-lime-300' },
              ].map((net) => (
                <button
                  key={net.name}
                  type="button"
                  onClick={() => setActiveTab(net.name as any)}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-black uppercase text-center transition-all cursor-pointer shadow ${net.color} ${
                    activeTab === net.name ? `${net.activeRing} scale-105 shadow-md` : 'opacity-85'
                  }`}
                >
                  {net.name}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Simulation Button */}
          <button
            onClick={triggerInstantRecharge}
            disabled={isSimulating}
            className={`w-full mt-3 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all shadow-lg cursor-pointer ${
              simSuccess
                ? 'bg-emerald-500 text-slate-950 font-black'
                : isSimulating
                ? 'bg-sky-800 text-cyan-200 animate-pulse'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 active:scale-98'
            }`}
          >
            {simSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Recharged! +₦75 Comm.</span>
              </>
            ) : isSimulating ? (
              <>
                <Zap className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                <span>Dispatching VTU...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-slate-950" />
                <span>Test Top-Up Dispatch</span>
              </>
            )}
          </button>
        </div>

        {/* Live Stream / Network Activity Feed */}
        <div className="flex-1 space-y-3 w-full">
          {/* Active Broadcast Badge */}
          <div className="bg-sky-900/40 border border-sky-700/60 rounded-xl p-3.5 relative overflow-hidden backdrop-blur-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-cyan-200 uppercase tracking-wide flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span>Live Feed</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">{activeTx.time}</span>
            </div>

            <div className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-lg border border-sky-800/80">
              <div className="flex items-center space-x-2.5">
                <span className={`px-2 py-0.5 rounded font-black text-[10px] uppercase shadow-sm ${activeTx.badgeColor}`}>
                  {activeTx.network}
                </span>
                <div>
                  <div className="font-bold text-xs text-white">{activeTx.recipient}</div>
                  <div className="text-[10px] text-cyan-300">{activeTx.amount}</div>
                </div>
              </div>
              <div className="flex items-center space-x-1 text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{activeTx.status}</span>
              </div>
            </div>
          </div>

          {/* VTU Channels Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-sky-950/70 border border-sky-800/80 p-2.5 rounded-xl flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-400/30">
                <Smartphone className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold text-white text-[11px]">Airtime & Data</div>
                <div className="text-[10px] text-cyan-300/80">All 4 GSM Networks</div>
              </div>
            </div>

            <div className="bg-sky-950/70 border border-sky-800/80 p-2.5 rounded-xl flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-400/30">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold text-white text-[11px]">Electricity DISCOs</div>
                <div className="text-[10px] text-cyan-300/80">Instant Token Gen</div>
              </div>
            </div>

            <div className="bg-sky-950/70 border border-sky-800/80 p-2.5 rounded-xl flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0 border border-cyan-400/30">
                <Tv className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold text-white text-[11px]">Cable TV Sub</div>
                <div className="text-[10px] text-cyan-300/80">DStv, GOtv, StarTimes</div>
              </div>
            </div>

            <div className="bg-sky-950/70 border border-sky-800/80 p-2.5 rounded-xl flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0 border border-rose-400/30">
                <CreditCard className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold text-white text-[11px]">Airtime To Cash</div>
                <div className="text-[10px] text-cyan-300/80">Instant 85% Cashout</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom KPI Banner */}
      <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-sky-800/70 text-center">
        <div className="bg-sky-950/60 border border-sky-800/70 py-2 px-1 rounded-xl">
          <div className="text-[11px] text-cyan-300 font-extrabold">99.98%</div>
          <div className="text-[10px] text-cyan-200/70">Delivery Rate</div>
        </div>
        <div className="bg-sky-950/60 border border-sky-800/70 py-2 px-1 rounded-xl">
          <div className="text-[11px] text-emerald-400 font-extrabold">&lt; 0.8 sec</div>
          <div className="text-[10px] text-cyan-200/70">Top-Up Speed</div>
        </div>
        <div className="bg-sky-950/60 border border-sky-800/70 py-2 px-1 rounded-xl">
          <div className="text-[11px] text-amber-300 font-extrabold">Auto 2.5%</div>
          <div className="text-[10px] text-cyan-200/70">Agent Commission</div>
        </div>
      </div>
    </div>
  );
}
