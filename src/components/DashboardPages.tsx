import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileText,
  Headphones,
  Mail,
  Search,
  ShieldCheck,
  Smartphone,
  TicketCheck,
  UserRound,
  Wallet,
  Zap,
} from 'lucide-react';
import { auth } from '../firebase';
import { updateProfile } from 'firebase/auth';
import { describeApiError, getExamPurchaseHistory, getIntegrationHealth, getLiveDataPlans, getLiveElectricityProviders, getLiveExamProducts, getLiveNetworks, getTransactionDelivery, getTransactionStatus, getTransactions, purchaseAirtime, purchaseData, purchaseElectricity, purchaseExamPin, verifyElectricityCustomer, type ExamPurchaseHistoryItem, type TopupmateExamProduct, type TopupmateNetwork, type TopupmatePlan, type TopupmateUtilityProvider } from '../services/smeApi';
import { createWalletFunding, getWalletBalance, getWalletFundingStatus } from '../services/wallet';

export type DashboardPageId =
  | 'dashboard'
  | 'airtime'
  | 'data'
  | 'exam-pins'
  | 'electricity'
  | 'wallet'
  | 'transactions'
  | 'profile'
  | 'support';

interface DashboardUser {
  email: string;
  name: string;
}

interface DashboardPageProps {
  currentUser: DashboardUser;
  onNavigate: (page: DashboardPageId) => void;
  onNotify: (title: string, message: string) => void;
  onProfileUpdated: (name: string) => void;
}

type Status = { type: 'info' | 'success' | 'error'; title: string; message: string } | null;

const inputClass = 'w-full rounded-lg border border-[#d6e1f0] bg-white px-3.5 py-3 text-sm text-[#173b79] outline-none transition focus:border-[#155EEF] focus:ring-2 focus:ring-[#155EEF]/15 disabled:cursor-not-allowed disabled:bg-[#f4f7fb]';
const labelClass = 'mb-1.5 block text-xs font-bold text-[#234577]';
const pageMeta: Record<Exclude<DashboardPageId, 'dashboard'>, { title: string; description: string; icon: typeof Smartphone }> = {
  airtime: { title: 'Buy Airtime', description: 'Recharge any supported Nigerian network from your account.', icon: Smartphone },
  data: { title: 'Buy Data', description: 'Choose a live data plan and send it to a mobile number.', icon: Zap },
  'exam-pins': { title: 'Exam Pins', description: 'Purchase supported examination products and receive PINs securely.', icon: TicketCheck },
  electricity: { title: 'Electricity Bills', description: 'Pay a verified prepaid or postpaid electricity account.', icon: Zap },
  wallet: { title: 'Wallet', description: 'Review your balance, fund your wallet and see funding activity.', icon: Wallet },
  transactions: { title: 'Transaction History', description: 'Search your account activity and download available receipts.', icon: FileText },
  profile: { title: 'Profile', description: 'Manage the account details supported by your authentication provider.', icon: UserRound },
  support: { title: 'Help & Support', description: 'Contact SamEduHub or submit a complaint with a transaction reference.', icon: Headphones },
};

function StatusBanner({ status }: { status: Status }) {
  if (!status) return null;
  const styles = status.type === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : status.type === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-amber-200 bg-amber-50 text-amber-900';
  const Icon = status.type === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${styles}`} role="status">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div><strong className="block text-sm">{status.title}</strong><p className="mt-1 text-xs leading-relaxed opacity-90">{status.message}</p></div>
    </div>
  );
}

function IntegrationNotice({ capability }: { capability: string }) {
  const [message, setMessage] = useState('Checking server-side purchase readiness…');

  useEffect(() => {
    let active = true;
    getIntegrationHealth()
      .then((health) => {
        if (!active) return;
        const supplier = health.supplier;
        const blockers = [
          !health.ok ? 'Cloudflare database is unavailable' : '',
          !supplier.configured ? 'TopupMate credentials are missing' : '',
          !supplier.customerWalletConfigured ? 'Cloudflare wallet cutover is off' : '',
          !supplier.purchaseEnabled ? 'supplier purchases are disabled' : '',
          !supplier.transactionStoreConfigured ? 'durable transaction storage is unavailable' : '',
          !supplier.serverAuthConfigured ? 'secure account verification is unavailable' : '',
        ].filter(Boolean);
        setMessage(blockers.length ? `Customer-side ${capability} are disabled because ${blockers.join(', ')}. No purchase has been charged or submitted.` : 'Customer-side processing is ready.');
      })
      .catch(() => { if (active) setMessage('Cloudflare readiness could not be checked. Customer-side purchases remain disabled and no purchase has been submitted.'); });
    return () => { active = false; };
  }, [capability]);

  if (message === 'Customer-side processing is ready.') return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" />
        <div>
          <strong className="block">Customer purchases are disabled</strong>
          <p className="mt-1 text-xs leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block"><span className={labelClass}>{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-[#6c82a4]">{hint}</span>}</label>;
}

function PageFrame({ page, children, onNavigate }: { page: Exclude<DashboardPageId, 'dashboard'>; children: ReactNode; onNavigate: (page: DashboardPageId) => void }) {
  const meta = pageMeta[page];
  const Icon = meta.icon;
  return (
    <div className="space-y-5">
      <button type="button" onClick={() => onNavigate('dashboard')} className="inline-flex items-center gap-2 text-xs font-bold text-[#155EEF] hover:text-[#0e43b6]"><ArrowLeft className="h-4 w-4" />Back to dashboard</button>
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-gradient-to-r from-[#e8f2ff] to-[#deebfc] px-6 py-5">
        <div><div className="mb-2 flex items-center gap-2 text-[#155EEF]"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/80"><Icon className="h-5 w-5" /></span><span className="text-xs font-extrabold uppercase tracking-[0.14em]">SamEduHub service</span></div><h1 className="text-2xl font-extrabold tracking-tight text-[#092d70] sm:text-3xl">{meta.title}</h1><p className="mt-1 max-w-2xl text-sm text-[#456694]">{meta.description}</p></div>
        <div className="flex items-center gap-2 rounded-full border border-[#c9daf3] bg-white/70 px-3 py-2 text-[11px] font-bold text-[#234577]"><ShieldCheck className="h-4 w-4 text-[#155EEF]" />Secure account area</div>
      </div>
      {children}
    </div>
  );
}

function FormCard({ title, children, onSubmit }: { title: string; children: ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="rounded-lg border border-[#d9e5f5] bg-white p-5 shadow-sm sm:p-6"><h2 className="mb-5 text-lg font-extrabold text-[#0c3275]">{title}</h2>{children}</form>;
}

function SubmitButton({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
  return <button type="submit" disabled={disabled} className="rounded-lg bg-[#155EEF] px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0e4dcc] disabled:cursor-not-allowed disabled:opacity-60">{children}</button>;
}

function useLiveDataPlans() {
  const [plans, setPlans] = useState<TopupmatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    getLiveDataPlans()
      .then((response) => { if (active) { setPlans(response.plans); setLoadError(''); } })
      .catch((error) => { if (active) setLoadError(describeApiError(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return { plans, loading, loadError };
}

function useLiveNetworks() {
  const [networks, setNetworks] = useState<TopupmateNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    getLiveNetworks()
      .then((response) => { if (active) { setNetworks(response.networks); setLoadError(''); } })
      .catch((error) => { if (active) setLoadError(describeApiError(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return { networks, loading, loadError };
}

function validNigerianPhone(value: string) {
  return /^0\d{10}$/.test(value.replace(/[\s-]/g, ''));
}

async function downloadTransactionDelivery(reference: string, service: string) {
  const result = await getTransactionDelivery(reference);
  const heading = service === 'electricity' ? 'Electricity token' : 'Exam PIN';
  const body = [`SamEduHub ${heading}`, `Reference: ${result.reference}`, '', ...result.delivery].join('\r\n');
  const blobUrl = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `sameduhub-${service}-${reference.replace(/[^a-z0-9_-]/gi, '-')}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function networkOptionsFromPlans(plans: TopupmatePlan[]) {
  const options = new Map<string, { value: string; label: string; id: string | number }>();
  for (const plan of plans) {
    if (plan.network === null) continue;
    const value = String(plan.network);
    if (!options.has(value)) options.set(value, { value, label: plan.networkLabel, id: plan.network });
  }
  return [...options.values()];
}

function AirtimePage({ onNavigate }: DashboardPageProps) {
  const { networks, loading, loadError } = useLiveNetworks();
  const [network, setNetwork] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedNetwork = networks.find((option) => String(option.id) === network);
    if (!selectedNetwork || !selectedNetwork.available || !validNigerianPhone(phone) || !amount || Number(amount) <= 0) { setError('Select an available live provider network, enter a valid 11-digit phone number and enter a positive amount.'); return; }
    setError('');
    setSubmitting(true);
    setStatus({ type: 'info', title: 'Checking purchase readiness', message: 'The server is validating the wallet and transaction safeguards before contacting the supplier.' });
    try {
      const result = await purchaseAirtime({ network: selectedNetwork.id, phone: phone.replace(/[\s-]/g, ''), amount: Number(amount) });
      setStatus(result.status === 'successful'
        ? { type: 'success', title: 'Airtime delivered', message: result.message || `Reference ${result.reference} was confirmed by the supplier.` }
        : result.status === 'failed'
          ? { type: 'error', title: 'Airtime request failed', message: result.message || `Reference ${result.reference} failed.` }
          : { type: 'info', title: 'Airtime request pending', message: result.message || `Reference ${result.reference} is awaiting supplier confirmation.` });
    } catch (requestError) {
      setStatus({ type: 'error', title: 'Airtime request not submitted', message: describeApiError(requestError) });
    } finally { setSubmitting(false); }
  };
  return <PageFrame page="airtime" onNavigate={onNavigate}><div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]"><FormCard title="Airtime details" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><Field label="Network" hint={loading ? 'Loading live provider networks…' : loadError ? 'Live networks could not be loaded.' : 'Network IDs come from the live TopupMate network catalogue.'}><select value={network} onChange={e => setNetwork(e.target.value)} className={inputClass} disabled={loading || networks.length === 0}><option value="">{loading ? 'Loading networks…' : networks.length ? 'Select network' : 'No live networks available'}</option>{networks.map(option => <option key={String(option.id)} value={String(option.id)} disabled={!option.available}>{option.name}{!option.available ? ' — unavailable' : ''}</option>)}</select></Field><Field label="Phone number"><input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="080..." inputMode="tel" /></Field><Field label="Amount" hint="The supplier will validate the final service charge."><input value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} placeholder="Enter amount" inputMode="decimal" /></Field></div>{error && <p className="mt-4 text-xs font-semibold text-rose-600">{error}</p>}<div className="mt-5"><SubmitButton disabled={submitting || loading || networks.length === 0}>{submitting ? 'Checking…' : 'Review purchase'}</SubmitButton></div></FormCard><div className="space-y-5"><div className="rounded-lg border border-[#d9e5f5] bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-extrabold text-[#0c3275]">Purchase summary</h2><dl className="space-y-3 text-xs"><div className="flex justify-between gap-4"><dt className="text-[#6c82a4]">Network</dt><dd className="font-bold text-[#173b79]">{networks.find(option => String(option.id) === network)?.name || 'Not selected'}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#6c82a4]">Recipient</dt><dd className="font-bold text-[#173b79]">{phone || 'Not entered'}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#6c82a4]">Amount</dt><dd className="font-bold text-[#173b79]">{amount ? `₦${amount}` : 'Not entered'}</dd></div></dl><div className="mt-4 border-t border-[#edf2f8] pt-4 text-xs text-[#6c82a4]">Customer wallet balance: not connected</div></div>{loadError && <StatusBanner status={{ type: 'error', title: 'Live provider catalogue unavailable', message: loadError }} />}<IntegrationNotice capability="airtime network IDs and purchases" /></div></div><StatusBanner status={status} /></PageFrame>;
}

function DataPage({ onNavigate }: DashboardPageProps) {
  const { plans, loading, loadError } = useLiveDataPlans();
  const networks = useMemo(() => networkOptionsFromPlans(plans), [plans]);
  const [network, setNetwork] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const selectedNetwork = networks.find((option) => option.value === network);
  const visiblePlans = useMemo(() => plans.filter((item) => (!network || String(item.network) === network) && (!category || item.category === category)), [plans, network, category]);
  const categories = useMemo(() => [...new Set(plans.filter(item => !network || String(item.network) === network).map(item => item.category))], [plans, network]);
  const selectedPlan = visiblePlans.find((item) => String(item.id) === plan);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedNetwork || !validNigerianPhone(phone) || !category || !selectedPlan || selectedPlan.network === null) { setError('Select a live network and category, choose a live plan, then enter a valid 11-digit phone number.'); return; }
    setError('');
    setSubmitting(true);
    setStatus({ type: 'info', title: 'Checking purchase readiness', message: 'The server is validating the wallet and transaction safeguards before contacting the supplier.' });
    try {
      const result = await purchaseData({ network: selectedPlan.network, data_plan: selectedPlan.id, phone: phone.replace(/[\s-]/g, '') });
      setStatus({ type: 'success', title: 'Data request accepted', message: `Reference ${result.reference} is pending supplier confirmation.` });
    } catch (requestError) {
      setStatus({ type: 'error', title: 'Data request not submitted', message: describeApiError(requestError) });
    } finally { setSubmitting(false); }
  };
  return <PageFrame page="data" onNavigate={onNavigate}><div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]"><FormCard title="Choose a data plan" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><Field label="Network" hint="Values are read from the live SME data-plan response."><select value={network} onChange={e => { setNetwork(e.target.value); setCategory(''); setPlan(''); }} className={inputClass} disabled={loading || networks.length === 0}><option value="">{loading ? 'Loading networks…' : networks.length ? 'Select network' : 'No live networks available'}</option>{networks.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Phone number"><input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="080..." inputMode="tel" /></Field><Field label="Data category"><select value={category} onChange={e => { setCategory(e.target.value); setPlan(''); }} className={inputClass} disabled={!selectedNetwork || categories.length === 0}><option value="">{selectedNetwork ? 'Select category' : 'Select network first'}</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></Field><Field label="Available plans" hint={selectedPlan ? `${selectedPlan.validity}${selectedPlan.price === null ? '' : ` · ₦${selectedPlan.price.toLocaleString()}`}` : 'Only plans and IDs returned by the supplier are shown.'}><select value={plan} onChange={e => setPlan(e.target.value)} disabled={!category || visiblePlans.length === 0} className={inputClass}><option value="">{!category ? 'Select category first' : visiblePlans.length ? 'Select live plan' : 'No plans in this category'}</option>{visiblePlans.map(item => <option key={String(item.id)} value={String(item.id)}>{item.name}{item.price === null ? '' : ` — ₦${item.price.toLocaleString()}`} · {item.validity}</option>)}</select></Field></div>{error && <p className="mt-4 text-xs font-semibold text-rose-600">{error}</p>}<div className="mt-5"><SubmitButton disabled={submitting || loading || !selectedPlan}>{submitting ? 'Checking…' : 'Review purchase'}</SubmitButton></div></FormCard><div className="space-y-5"><div className="rounded-lg border border-[#d9e5f5] bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-extrabold text-[#0c3275]">Plan summary</h2><p className="text-sm text-[#6c82a4]">Live plan IDs, prices and validity are loaded from the supplier catalogue. No placeholder plan is inserted.</p><div className="mt-5 rounded-lg bg-[#f4f7fb] p-4 text-xs leading-6 text-[#587098]">Network: <strong>{selectedNetwork?.label || 'Not selected'}</strong><br />Recipient: <strong>{phone || 'Not entered'}</strong><br />Category: <strong>{category || 'Not selected'}</strong><br />Plan: <strong>{selectedPlan?.name || 'Not selected'}</strong><br />Price: <strong>{selectedPlan?.price === null || selectedPlan?.price === undefined ? 'Not provided' : `₦${selectedPlan.price.toLocaleString()}`}</strong><br />Validity: <strong>{selectedPlan?.validity || 'Not provided'}</strong></div></div>{loadError && <StatusBanner status={{ type: 'error', title: 'Live data plans unavailable', message: loadError }} />}<IntegrationNotice capability="data plans, prices, validity and purchases" /></div></div><StatusBanner status={status} /></PageFrame>;
}

function ExamPinsPage({ onNavigate }: DashboardPageProps) {
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [products, setProducts] = useState<TopupmateExamProduct[]>([]);
  const [history, setHistory] = useState<ExamPurchaseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [deliveryLoading, setDeliveryLoading] = useState('');
  const [purchaseError, setPurchaseError] = useState('');
  const [purchaseReady, setPurchaseReady] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState<Status>(null);
  const selectedProduct = products.find(item => String(item.id) === product);
  const requestedQuantity = Number(quantity);
  const validQuantity = Number.isInteger(requestedQuantity) && requestedQuantity >= 1;
  const money = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  useEffect(() => {
    let active = true;
    getLiveExamProducts()
      .then(response => { if (active) setProducts(response.products); })
      .catch(error => { if (active) setLoadError(describeApiError(error)); })
      .finally(() => { if (active) setLoading(false); });
    getIntegrationHealth().then(health => {
      if (active) setPurchaseReady(health.ok && health.supplier.purchaseEnabled && health.supplier.customerWalletConfigured && health.supplier.transactionStoreConfigured && health.supplier.serverAuthConfigured);
    }).catch(() => { if (active) setPurchaseReady(false); });
    getExamPurchaseHistory()
      .then(response => { if (active) setHistory(response.transactions.filter(item => item.service === 'exam-pin')); })
      .catch(error => { if (active) setHistoryError(describeApiError(error)); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, []);

  const submitPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProduct || !selectedProduct.available || !validQuantity) { setPurchaseError('Choose an available product and a valid quantity.'); return; }
    if (!purchaseReady) { setPurchaseError('Purchases are not enabled for this environment yet. Your wallet has not been charged.'); return; }
    setPurchaseError('');
    setPurchaseStatus(null);
    setPurchasing(true);
    try {
      const result = await purchaseExamPin({ provider: selectedProduct.id, quantity: requestedQuantity });
      setPurchaseStatus({ type: result.status === 'successful' ? 'success' : 'info', title: result.status === 'successful' ? 'Exam PIN order confirmed' : 'Exam PIN order processing', message: result.status === 'successful' ? `Reference ${result.reference}. Download delivered PINs from your purchase history when available.` : `Reference ${result.reference} is awaiting supplier confirmation. Check its status before trying again.` });
      const response = await getExamPurchaseHistory();
      setHistory(response.transactions.filter(item => item.service === 'exam-pin'));
    } catch (error) {
      setPurchaseStatus({ type: 'error', title: 'Exam PIN purchase not submitted', message: describeApiError(error) });
    } finally { setPurchasing(false); }
  };

  const downloadPins = async (item: ExamPurchaseHistoryItem) => {
    setDeliveryLoading(item.reference);
    setHistoryError('');
    try { await downloadTransactionDelivery(item.reference, 'exam-pin'); }
    catch (error) { setHistoryError(describeApiError(error)); }
    finally { setDeliveryLoading(''); }
  };

  return <PageFrame page="exam-pins" onNavigate={onNavigate}>
    <div className="grid gap-5 lg:grid-cols-[1.2fr_.9fr]">
      <FormCard title="Select examination product" onSubmit={submitPurchase}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Examination product" hint={loading ? 'Loading TopupMate products…' : 'Products and current prices come from TopupMate.'}>
            <select value={product} onChange={event => setProduct(event.target.value)} className={inputClass} disabled={loading || products.length === 0}>
              <option value="">{loading ? 'Loading products…' : products.length ? 'Select product' : 'No products available'}</option>
              {products.map(item => <option key={String(item.id)} value={String(item.id)} disabled={!item.available}>
                {item.provider} — {item.price === null ? 'Price unavailable' : money(item.price)}{!item.available ? ' — unavailable' : ''}
              </option>)}
            </select>
          </Field>
          <Field label="Quantity"><input type="number" min="1" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} className={inputClass} disabled={loading || products.length === 0} /></Field>
        </div>
        <p className="mt-4 text-xs text-[#6c82a4]">You will be charged only after the server verifies the live product price and confirms sufficient wallet balance. PINs are available to download after supplier confirmation.</p>
        {purchaseError && <p className="mt-4 text-xs font-semibold text-rose-600">{purchaseError}</p>}
        <div className="mt-5"><SubmitButton disabled={purchasing || loading || !purchaseReady || !selectedProduct || !validQuantity}>{purchasing ? 'Submitting order…' : purchaseReady ? 'Buy exam PINs' : 'Purchases unavailable'}</SubmitButton></div>
      </FormCard>
      <div className="rounded-lg border border-[#d9e5f5] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-extrabold text-[#0c3275]">Order summary</h2>
        <div className="mt-5 rounded-lg bg-[#f4f7fb] p-4 text-xs leading-6 text-[#587098]">
          Product: <strong>{selectedProduct?.provider || 'Not selected'}</strong><br />
          Unit price: <strong>{selectedProduct?.price == null ? 'Not provided' : money(selectedProduct.price)}</strong><br />
          Quantity: <strong>{validQuantity ? quantity : 'Enter a valid quantity'}</strong><br />
          Total: <strong>{selectedProduct?.price == null || !validQuantity ? 'Not provided' : money(selectedProduct.price * requestedQuantity)}</strong>
        </div>
        <p className="mt-3 text-[11px] text-[#6c82a4]">PINs can be downloaded only from completed purchases belonging to your account.</p>
      </div>
    </div>
    {loadError && <StatusBanner status={{ type: 'error', title: 'TopupMate exam catalogue unavailable', message: loadError }} />}
    <IntegrationNotice capability="exam PIN purchases and delivery" />
    <div className="rounded-lg border border-[#d9e5f5] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-extrabold text-[#0c3275]">Purchase history</h2>
      {historyLoading ? <p className="mt-4 text-xs text-[#6c82a4]">Loading history…</p> : historyError ? <p className="mt-4 text-xs font-semibold text-rose-600">{historyError}</p> : history.length ?
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs">
          <thead className="border-b border-[#edf2f8] text-[#6c82a4]"><tr>{['Product', 'Qty', 'Total', 'Status', 'Reference', 'Delivery'].map(label => <th key={label} className="px-3 py-3 font-bold">{label}</th>)}</tr></thead>
          <tbody>{history.map(item => <tr key={item.reference} className="border-b border-[#f1f5fa]">
            <td className="px-3 py-3 font-bold text-[#173b79]">{item.product?.provider || item.providerName || 'Exam product'}</td>
            <td className="px-3 py-3">{item.quantity}</td><td className="px-3 py-3">{money(item.totalAmount)}</td>
            <td className="px-3 py-3">{item.status}</td><td className="px-3 py-3 font-mono">{item.reference}</td>
            <td className="px-3 py-3">{item.hasDelivery ? <button type="button" disabled={deliveryLoading === item.reference} onClick={() => void downloadPins(item)} className="font-bold text-[#155EEF] disabled:opacity-50">{deliveryLoading === item.reference ? 'Preparing…' : 'Download PINs'}</button> : 'Awaiting delivery'}</td>
          </tr>)}</tbody>
        </table></div> : <p className="py-8 text-center text-sm text-[#6c82a4]">No exam-pin purchases yet.</p>}
      {purchaseStatus && <div className="mt-4"><StatusBanner status={purchaseStatus} /></div>}
    </div>
  </PageFrame>;
}

function ElectricityPage({ onNavigate }: DashboardPageProps) {
  const [provider, setProvider] = useState('');
  const [meterType, setMeterType] = useState('');
  const [meterNumber, setMeterNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [providers, setProviders] = useState<TopupmateUtilityProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifiedCustomer, setVerifiedCustomer] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getLiveElectricityProviders()
      .then((response) => { if (active) { setProviders(response.providers); setLoadError(''); } })
      .catch((requestError) => { if (active) setLoadError(describeApiError(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const selectedProvider = providers.find((item) => String(item.id) === provider);
  const verifyCustomer = async () => {
    if (!selectedProvider || !selectedProvider.available || !meterType || !meterNumber) { setError('Select an available live provider and meter type, then enter the meter number.'); return; }
    setError('');
    setVerifying(true);
    setVerifiedCustomer(false);
    setStatus({ type: 'info', title: 'Verifying meter', message: 'The server is checking the meter with TopupMate before payment can be submitted.' });
    try {
      await verifyElectricityCustomer({ provider: selectedProvider.id, meternumber: meterNumber.trim(), metertype: meterType as 'prepaid' | 'postpaid' });
      setVerifiedCustomer(true);
      setStatus({ type: 'success', title: 'Meter verified', message: 'TopupMate verified the meter details. You can now submit the electricity payment.' });
    } catch (requestError) {
      setStatus({ type: 'error', title: 'Meter verification failed', message: describeApiError(requestError) });
    } finally { setVerifying(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!selectedProvider || !selectedProvider.available || !meterType || !meterNumber || !amount || !validNigerianPhone(phone) || Number(amount) <= 0) { setError('Complete the live provider, meter type, meter number, phone and a positive amount.'); return; }
    if (!verifiedCustomer) { setError('Verify the meter before submitting the electricity payment.'); return; }
    setError('');
    setSubmitting(true);
    setStatus({ type: 'info', title: 'Submitting electricity payment', message: 'The authenticated payment request is being sent to TopupMate.' });
    try {
      const result = await purchaseElectricity({ provider: selectedProvider.id, metertype: meterType as 'prepaid' | 'postpaid', meternumber: meterNumber.trim(), amount: Number(amount), phone: phone.replace(/[\s-]/g, '') });
      setStatus({ type: result.status === 'successful' ? 'success' : 'info', title: result.status === 'successful' ? 'Electricity payment confirmed' : 'Electricity payment processing', message: result.status === 'successful' ? result.hasDelivery ? `Reference ${result.reference}. Download the token from transaction history.` : `Reference ${result.reference} is confirmed, but TopupMate has not returned the token yet. Check transaction history again shortly.` : `Reference ${result.reference} is awaiting supplier confirmation. Check its status before submitting again.` });
    } catch (requestError) {
      setStatus({ type: 'error', title: 'Electricity payment not submitted', message: describeApiError(requestError) });
    } finally { setSubmitting(false); }
  };
  return <PageFrame page="electricity" onNavigate={onNavigate}><div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]"><FormCard title="Meter and payment details" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><Field label="Distribution company" hint={loading ? 'Loading live TopupMate providers…' : loadError ? 'Live providers could not be loaded.' : 'Provider IDs come from the live TopupMate electricity catalogue.'}><select value={provider} onChange={e => { setProvider(e.target.value); setVerifiedCustomer(false); }} className={inputClass} disabled={loading || providers.length === 0}><option value="">{loading ? 'Loading providers…' : providers.length ? 'Select provider' : 'No live providers available'}</option>{providers.map(item => <option key={String(item.id)} value={String(item.id)} disabled={!item.available}>{item.name}{!item.available ? ' — unavailable' : ''}</option>)}</select></Field><Field label="Meter type"><select value={meterType} onChange={e => { setMeterType(e.target.value); setVerifiedCustomer(false); }} className={inputClass}><option value="">Select type</option><option value="prepaid">Prepaid</option><option value="postpaid">Postpaid</option></select></Field><Field label="Meter number"><input value={meterNumber} onChange={e => { setMeterNumber(e.target.value); setVerifiedCustomer(false); }} className={inputClass} placeholder="Enter meter number" inputMode="numeric" /></Field><Field label="Phone number"><input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="080..." inputMode="tel" /></Field><Field label="Amount"><input value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} placeholder="Enter amount" inputMode="decimal" /></Field></div><button type="button" onClick={() => void verifyCustomer()} disabled={verifying || submitting || loading || !selectedProvider} className="mt-5 rounded-lg border border-[#155EEF] px-4 py-2.5 text-xs font-extrabold text-[#155EEF] transition hover:bg-[#edf3ff] disabled:cursor-not-allowed disabled:opacity-60">{verifying ? 'Verifying…' : 'Verify customer'}</button>{error && <p className="mt-4 text-xs font-semibold text-rose-600">{error}</p>}<div className="mt-5"><SubmitButton disabled={verifying || submitting || loading || !selectedProvider || !verifiedCustomer || !amount || Number(amount) <= 0}>{submitting ? 'Sending payment…' : 'Pay electricity bill'}</SubmitButton></div></FormCard><div className="space-y-5"><div className="rounded-lg border border-[#d9e5f5] bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-extrabold text-[#0c3275]">Payment confirmation</h2><dl className="space-y-3 text-xs"><div className="flex justify-between gap-4"><dt className="text-[#6c82a4]">Provider</dt><dd className="font-bold text-[#173b79]">{selectedProvider?.name || 'Not selected'}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#6c82a4]">Meter</dt><dd className="font-bold text-[#173b79]">{meterNumber || 'Not entered'}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#6c82a4]">Customer</dt><dd className={`font-bold ${verifiedCustomer ? 'text-emerald-600' : 'text-amber-700'}`}>{verifiedCustomer ? 'Verified by TopupMate' : 'Not verified'}</dd></div></dl></div>{loadError && <StatusBanner status={{ type: 'error', title: 'Live electricity providers unavailable', message: loadError }} />}<IntegrationNotice capability="meter verification, electricity tokens and payments" /></div></div><StatusBanner status={status} /></PageFrame>;
}

function WalletPage({ onNavigate }: DashboardPageProps) {
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState('0.00');
  const [fundingRef, setFundingRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getWalletBalance().then((wallet) => setBalance(wallet.balance)).catch(() => setBalance('0.00'));
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackStatus = params.get('wallet_status');
    const callbackRef = params.get('wallet_tx_ref') || '';
    if (!callbackStatus) return;
    if (callbackRef) setFundingRef(callbackRef);
    if (callbackStatus === 'unverified') {
      setStatus({ type: 'error', title: 'Payment not verified', message: 'Paystack returned without a usable payment reference. No wallet credit was made. If you completed payment, contact support with your Paystack receipt.' });
    } else if (callbackStatus === 'pending') {
      setStatus({ type: 'info', title: 'Payment is being confirmed', message: callbackRef ? `We are checking payment ${callbackRef}. Your wallet will update only after Paystack verifies it.` : 'We are checking the payment. Your wallet will update only after Paystack verifies it.' });
    }
    params.delete('wallet_status');
    params.delete('wallet_tx_ref');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);
  useEffect(() => {
    if (!fundingRef) return;
    let active = true;
    const poll = async () => {
      try {
        const funding = await getWalletFundingStatus(fundingRef);
        if (!active) return;
        if (funding.status === 'successful') {
          setBalance((await getWalletBalance()).balance);
          setStatus({ type: 'success', title: 'Wallet funded', message: `Payment ${funding.txRef} was verified and your wallet was credited.` });
          setFundingRef('');
        } else if (funding.status === 'failed') {
          setStatus({ type: 'error', title: 'Payment not completed', message: `Payment ${funding.txRef} was not successful. No wallet credit was made.` });
          setFundingRef('');
        }
      } catch {
        // The payment can remain pending while the provider completes it.
      }
    };
    const timer = window.setInterval(poll, 4000);
    void poll();
    return () => { active = false; window.clearInterval(timer); };
  }, [fundingRef]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!amount) { setError('Enter a funding amount.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const funding = await createWalletFunding(amount);
      if (!funding.checkoutUrl) throw new Error('Paystack did not return a checkout URL.');
      // Keep the same tab so Firebase session persistence survives the payment
      // provider round-trip and the callback can reopen the wallet dashboard.
      window.location.assign(funding.checkoutUrl);
    } catch (submitError) {
      setStatus({ type: 'error', title: 'Funding could not start', message: submitError instanceof Error ? submitError.message : 'The wallet funding request could not be started.' });
    } finally { setSubmitting(false); }
  };
  return <PageFrame page="wallet" onNavigate={onNavigate}><div className="grid gap-5 lg:grid-cols-[.9fr_1.2fr]"><div className="space-y-5"><div className="rounded-lg bg-gradient-to-br from-[#155EEF] to-[#0c43b5] p-6 text-white shadow-sm"><div className="flex items-center gap-3"><Wallet className="h-7 w-7" /><span className="text-sm font-bold">Available balance</span></div><p className="mt-4 text-3xl font-extrabold">₦{balance}</p><p className="mt-2 text-xs text-blue-100">Wallet credits are added only after server-side Paystack verification.</p></div><div className="rounded-lg border border-[#d9e5f5] bg-white p-5 text-sm text-[#456694] shadow-sm"><strong className="block text-[#0c3275]">Secure Paystack funding</strong><p className="mt-1 text-xs leading-relaxed">Your payment reference is created and saved before checkout. This page waits for a verified callback or webhook before showing a credit.</p></div></div><FormCard title="Fund wallet" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><Field label="Amount"><input value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} placeholder="Enter amount" inputMode="decimal" min="1" /></Field><Field label="Payment method"><input value="Paystack Checkout" readOnly className={`${inputClass} bg-[#f4f7fb]`} /></Field></div>{error && <p className="mt-4 text-xs font-semibold text-rose-600">{error}</p>}<div className="mt-5"><SubmitButton disabled={submitting}>{submitting ? 'Starting checkout…' : 'Continue to Paystack'}</SubmitButton></div><p className="mt-4 flex items-start gap-2 text-[11px] text-[#6c82a4]"><ShieldCheck className="h-4 w-4 shrink-0 text-[#155EEF]" />Paystack receives the payment details; your account details and wallet balance are protected on our secure servers.</p></FormCard></div><StatusBanner status={status} /></PageFrame>;
}

function TransactionsPage({ onNavigate }: DashboardPageProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [transactions, setTransactions] = useState<ExamPurchaseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState('');
  const [deliveryLoading, setDeliveryLoading] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTransactions()
      .then((result) => { if (active) setTransactions(result.transactions); })
      .catch((loadError) => { if (active) setError(describeApiError(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visibleTransactions = transactions.filter((transaction) => {
    const matchesSearch = !search.trim() || `${transaction.reference} ${transaction.service} ${transaction.providerName || transaction.product?.provider || ''}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'completed' ? transaction.status === 'successful' : transaction.status === statusFilter);
    return matchesSearch && matchesStatus;
  });

  const refresh = async (reference: string) => {
    setRefreshing(reference);
    setError('');
    try {
      const currentTransaction = transactions.find(transaction => transaction.reference === reference);
      if (currentTransaction?.kind === 'wallet_funding') {
        const funding = await getWalletFundingStatus(reference);
        setTransactions((current) => current.map((transaction) => transaction.reference === reference ? {
          ...transaction,
          status: funding.status === 'successful' ? 'successful' : funding.status === 'failed' ? 'failed' : 'pending',
          updatedAt: funding.updatedAt,
          providerTransactionId: funding.providerTransactionId || null,
        } : transaction));
      } else {
        const result = await getTransactionStatus(reference);
        setTransactions((current) => current.map((transaction) => transaction.reference === reference ? result.transaction : transaction));
      }
    } catch (refreshError) {
      setError(describeApiError(refreshError));
    } finally { setRefreshing(''); }
  };

  const downloadDelivery = async (transaction: ExamPurchaseHistoryItem) => {
    setDeliveryLoading(transaction.reference);
    setError('');
    try { await downloadTransactionDelivery(transaction.reference, transaction.service || 'exam-pin'); }
    catch (downloadError) { setError(describeApiError(downloadError)); }
    finally { setDeliveryLoading(''); }
  };

  return <PageFrame page="transactions" onNavigate={onNavigate}><div className="rounded-lg border border-[#d9e5f5] bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 border-b border-[#edf2f8] pb-5 lg:flex-row lg:items-end lg:justify-between"><Field label="Search reference or service"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7890b2]" /><input value={search} onChange={e => setSearch(e.target.value)} className={`${inputClass} pl-9`} placeholder="Search transactions" /></div></Field><Field label="Status"><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputClass}><option value="all">All statuses</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option></select></Field></div>{error && <p className="mt-4 text-xs font-semibold text-rose-600">{error}</p>}{loading ? <div className="py-14 text-center text-sm text-[#6c82a4]">Loading transaction history…</div> : visibleTransactions.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-[#edf2f8] text-[#6c82a4]"><tr><th className="px-3 py-3 font-bold">Service</th><th className="px-3 py-3 font-bold">Amount</th><th className="px-3 py-3 font-bold">Status</th><th className="px-3 py-3 font-bold">Reference</th><th className="px-3 py-3 font-bold">Action</th></tr></thead><tbody>{visibleTransactions.map(transaction => <tr key={transaction.reference} className="border-b border-[#f1f5fa] last:border-0"><td className="px-3 py-3 font-bold text-[#173b79]">{transaction.kind === 'wallet_funding' ? 'Wallet top-up' : transaction.service === 'electricity' ? 'Electricity token' : transaction.product?.provider || transaction.providerName || 'Exam PIN'}</td><td className="px-3 py-3 text-[#456694]">₦{transaction.totalAmount.toLocaleString()}</td><td className={`px-3 py-3 font-bold ${transaction.status === 'successful' ? 'text-emerald-600' : transaction.status === 'failed' ? 'text-rose-600' : 'text-amber-700'}`}>{transaction.kind === 'wallet_funding' && transaction.status === 'successful' ? 'Credited' : transaction.status}</td><td className="px-3 py-3 font-mono text-[10px] text-[#456694]">{transaction.reference}</td><td className="px-3 py-3">{transaction.hasDelivery ? <button type="button" onClick={() => void downloadDelivery(transaction)} disabled={deliveryLoading === transaction.reference} className="font-bold text-[#155EEF] hover:underline disabled:opacity-50">{deliveryLoading === transaction.reference ? 'Preparing…' : transaction.service === 'electricity' ? 'Download token' : 'Download PINs'}</button> : (transaction.status === 'pending' || transaction.status === 'processing' || (transaction.service === 'electricity' && transaction.status === 'successful')) ? <button type="button" onClick={() => void refresh(transaction.reference)} disabled={refreshing === transaction.reference} className="font-bold text-[#155EEF] hover:underline disabled:opacity-50">{refreshing === transaction.reference ? 'Checking…' : transaction.service === 'electricity' && transaction.status === 'successful' ? 'Check token' : 'Check status'}</button> : <span className="text-[#9aaecb]">Final</span>}</td></tr>)}</tbody></table></div> : <div className="flex flex-col items-center justify-center py-14 text-center"><FileText className="h-12 w-12 text-[#9bb5df]" /><h2 className="mt-4 text-lg font-extrabold text-[#0c3275]">No transactions found</h2><p className="mt-2 max-w-md text-sm text-[#6c82a4]">Your authenticated wallet top-ups and service purchases are shown here. No rows or statuses are fabricated.</p><div className="mt-5 flex flex-wrap justify-center gap-3"><button type="button" onClick={() => onNavigate('wallet')} className="rounded-lg bg-[#155EEF] px-4 py-2.5 text-xs font-extrabold text-white">Open wallet</button><button type="button" onClick={() => onNavigate('support')} className="rounded-lg border border-[#155EEF] px-4 py-2.5 text-xs font-extrabold text-[#155EEF]">Contact support</button></div></div>}</div></PageFrame>;
}

function ProfilePage({ currentUser, onNavigate, onProfileUpdated }: DashboardPageProps) {
  const [name, setName] = useState(currentUser.name);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  const verified = auth?.currentUser?.emailVerified ?? false;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) { setStatus({ type: 'error', title: 'Name required', message: 'Enter a display name before saving.' }); return; }
    if (!auth?.currentUser) { setStatus({ type: 'info', title: 'Profile update unavailable', message: 'Your session has expired. Please sign in again.' }); return; }
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name.trim() });
      onProfileUpdated(name.trim());
      setStatus({ type: 'success', title: 'Profile updated', message: 'Your display name has been saved.' });
    } catch (error) {
      setStatus({ type: 'error', title: 'Profile update failed', message: 'We could not save your profile change. Please try again.' });
    } finally { setSaving(false); }
  };
  return <PageFrame page="profile" onNavigate={onNavigate}><div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><FormCard title="Account details" onSubmit={submit}><div className="grid gap-4"><Field label="Display name"><input value={name} onChange={e => setName(e.target.value)} className={inputClass} /></Field><Field label="Email address" hint="To change your email address, please contact support."><input value={currentUser.email} readOnly className={inputClass} /></Field></div><div className="mt-5"><SubmitButton disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</SubmitButton></div></FormCard><div className="rounded-lg border border-[#d9e5f5] bg-white p-5 shadow-sm"><h2 className="text-lg font-extrabold text-[#0c3275]">Account status</h2><div className="mt-5 space-y-4 text-sm"><div className="flex items-center justify-between border-b border-[#edf2f8] pb-3"><span className="text-[#6c82a4]">Authentication</span><span className="font-bold text-emerald-600">Secure sign-in active</span></div><div className="flex items-center justify-between border-b border-[#edf2f8] pb-3"><span className="text-[#6c82a4]">Email verification</span><span className={`font-bold ${verified ? 'text-emerald-600' : 'text-amber-700'}`}>{verified ? 'Verified' : 'Not verified'}</span></div><div className="flex items-center justify-between"><span className="text-[#6c82a4]">Account email</span><span className="max-w-[190px] truncate font-bold text-[#173b79]">{currentUser.email}</span></div></div></div></div><StatusBanner status={status} /></PageFrame>;
}

function SupportPage({ onNavigate }: DashboardPageProps) {
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reference.trim() || !message.trim()) { setStatus({ type: 'error', title: 'Complete the complaint form', message: 'Add a transaction reference and describe the issue before submitting.' }); return; }
    setStatus({ type: 'info', title: 'Complaint not submitted', message: 'The support/complaints endpoint is not configured in this project. Your message was not sent or stored.' });
  };
  return <PageFrame page="support" onNavigate={onNavigate}><div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><div className="space-y-5"><div className="rounded-lg border border-[#d9e5f5] bg-white p-5 shadow-sm"><h2 className="text-lg font-extrabold text-[#0c3275]">Contact options</h2><div className="mt-5 space-y-3"><a href="mailto:support@sameduhub.com" className="flex items-center gap-3 rounded-lg border border-[#edf2f8] p-3 text-sm font-bold text-[#173b79] transition hover:border-[#9bbcf5] hover:text-[#155EEF]"><Mail className="h-5 w-5 text-[#155EEF]" />support@sameduhub.com<ChevronRight className="ml-auto h-4 w-4" /></a><a href="mailto:support@sameduhub.com?subject=SamEduHub%20support" className="flex items-center gap-3 rounded-lg border border-[#edf2f8] p-3 text-sm font-bold text-[#173b79] transition hover:border-[#9bbcf5] hover:text-[#155EEF]"><Headphones className="h-5 w-5 text-[#155EEF]" />Email customer support<ChevronRight className="ml-auto h-4 w-4" /></a></div></div><IntegrationNotice capability="support tickets and complaint submission" /></div><FormCard title="Submit a complaint" onSubmit={submit}><Field label="Transaction reference" hint="Required so support can locate the relevant transaction after the endpoint is connected."><input value={reference} onChange={e => setReference(e.target.value)} className={inputClass} placeholder="Enter reference" /></Field><div className="mt-4"><Field label="Complaint details"><textarea value={message} onChange={e => setMessage(e.target.value)} className={`${inputClass} min-h-[150px] resize-y`} placeholder="Describe the issue" /></Field></div><div className="mt-5"><SubmitButton>Submit complaint</SubmitButton></div></FormCard></div><StatusBanner status={status} /></PageFrame>;
}

export function DashboardPageContent(props: DashboardPageProps & { page: Exclude<DashboardPageId, 'dashboard'> }) {
  switch (props.page) {
    case 'airtime': return <AirtimePage {...props} />;
    case 'data': return <DataPage {...props} />;
    case 'exam-pins': return <ExamPinsPage {...props} />;
    case 'electricity': return <ElectricityPage {...props} />;
    case 'wallet': return <WalletPage {...props} />;
    case 'transactions': return <TransactionsPage {...props} />;
    case 'profile': return <ProfilePage {...props} />;
    case 'support': return <SupportPage {...props} />;
  }
}
