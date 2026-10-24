import React, { useState } from 'react';
import {
  Smartphone,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  CreditCard,
  Send,
  Globe,
  Play,
  Check,
  FileText,
} from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
  onSelectService: (serviceKey: 'data' | 'airtime' | 'exam-pins' | 'electricity') => void;
}

const SERVICE_BY_TAB = {
  airtime: 'airtime',
  data: 'data',
  exam: 'exam-pins',
  electricity: 'electricity',
} as const;

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
  onSignUp,
  onSelectService,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedServiceTab, setSelectedServiceTab] = useState<'airtime' | 'data' | 'exam' | 'electricity'>('airtime');
  const [recipientInput, setRecipientInput] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState('MTN');
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | 'refund' | null>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactReference, setContactReference] = useState('');
  const [contactComplaint, setContactComplaint] = useState('');
  const [contactWebsite, setContactWebsite] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSubmitNotice, setContactSubmitNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const openContactModal = () => {
    setContactSubmitNotice(null);
    setContactModalOpen(true);
  };

  const submitContactComplaint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContactSubmitting(true);
    setContactSubmitNotice(null);
    try {
      const response = await fetch('/api/cloudflare/support/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: contactEmail.trim(),
          reference: contactReference.trim(),
          message: contactComplaint.trim(),
          website: contactWebsite,
        }),
      });
      const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(result?.error?.message || 'We could not send your complaint. Please try again later.');
      setContactSubmitNotice({ type: 'success', message: 'Your complaint has been sent to support. We’ll reply to your email.' });
      setContactReference('');
      setContactComplaint('');
      setContactWebsite('');
    } catch (error) {
      setContactSubmitNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'We could not send your complaint. Please try again later.',
      });
    } finally {
      setContactSubmitting(false);
    }
  };

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSelectService(SERVICE_BY_TAB[selectedServiceTab]);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans selection:bg-[#ff9c2a] selection:text-white">
      {/* TOP ANNOUNCEMENT STRIP */}
      <div className="bg-[#0d2b8e] text-slate-300 text-xs py-2 px-4 border-b border-[#ff9c2a]/20">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#ff9c2a] animate-pulse" />
            <span className="font-medium text-slate-200">
              SamEduHub — Fast & Secure Mobile Reloads, Data & Utility Services
            </span>
          </div>

          <div className="flex items-center space-x-3 text-[11px]">
            <button
              onClick={openContactModal}
              className="text-[#ffbd70] hover:underline cursor-pointer"
            >
              24/7 Helpdesk
            </button>
          </div>
        </div>
      </div>

      {/* 1. HEADER / NAVBAR (Matching TSD reference mockup) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#e2e8f0]/70 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo */}
          <div
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#0d2b8e] p-2 flex items-center justify-center text-[#ff9c2a] font-black text-xl shadow-sm transition-transform group-hover:scale-105">
              <span>S</span>
            </div>
            <div className="flex items-baseline space-x-0.5">
              <span className="text-2xl font-black tracking-tight text-[#0f172a]">SamEduHub</span>
              <span className="text-[#ff9c2a] text-xl font-black">)</span>
              <span className="text-[#1a3fbd] text-xl font-black">)</span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-8 text-sm font-semibold text-[#0f172a]">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:text-[#1a3fbd] transition-colors cursor-pointer font-bold"
            >
              Home
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="hover:text-[#1a3fbd] transition-colors cursor-pointer text-[#475569]"
            >
              How it works
            </button>
            <button
              onClick={() => scrollToSection('promotions')}
              className="hover:text-[#1a3fbd] transition-colors cursor-pointer text-[#475569]"
            >
              Promotions
            </button>
            <button
              onClick={() => scrollToSection('services')}
              className="hover:text-[#1a3fbd] transition-colors cursor-pointer text-[#475569]"
            >
              Services
            </button>
            <button
              onClick={openContactModal}
              className="hover:text-[#1a3fbd] transition-colors cursor-pointer text-[#475569]"
            >
              Contact
            </button>
          </nav>

          {/* Right Action Group */}
          <div className="hidden sm:flex items-center space-x-5">
            {/* Country / Language Selector */}
            <div className="flex items-center space-x-1.5 text-xs font-bold text-[#0f172a] cursor-pointer hover:opacity-80">
              <span>🇳🇬 Nigeria</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </div>

            {/* Log in */}
            <button
              onClick={onSignIn}
              className="text-sm font-bold text-[#0f172a] hover:text-[#1a3fbd] transition-colors cursor-pointer px-2"
            >
              Log in
            </button>

            {/* Lime Register Pill Button (matching reference) */}
            <button
              onClick={onSignUp}
              className="px-6 py-2.5 bg-[#ff9c2a] hover:bg-[#f18a18] text-[#0b2070] text-sm font-black rounded-full shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-95"
            >
              Register
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-[#0f172a] hover:bg-[#eff6ff] transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-[#e2e8f0] px-5 py-6 space-y-4 shadow-xl">
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left font-bold text-lg text-[#0f172a]"
            >
              Home
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="block w-full text-left font-semibold text-base text-[#475569]"
            >
              How it works
            </button>
            <button
              onClick={() => scrollToSection('promotions')}
              className="block w-full text-left font-semibold text-base text-[#475569]"
            >
              Promotions
            </button>
            <button
              onClick={() => scrollToSection('services')}
              className="block w-full text-left font-semibold text-base text-[#475569]"
            >
              Services
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                openContactModal();
              }}
              className="block w-full text-left font-semibold text-base text-[#475569]"
            >
              Contact Support
            </button>
            <div className="pt-4 border-t border-[#e2e8f0] flex flex-col gap-3">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSignIn();
                }}
                className="w-full py-3 text-center font-bold text-[#0f172a] bg-[#eff6ff] rounded-full"
              >
                Log in
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSignUp();
                }}
                className="w-full py-3 text-center font-black text-[#0b2070] bg-[#ff9c2a] rounded-full shadow"
              >
                Register
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION (Exact visual layout matching reference screenshot) */}
      <section className="pt-8 pb-16 lg:pt-14 lg:pb-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Heading, Subtitle, Quick Reload Input, 100% Safe */}
            <div className="lg:col-span-7 space-y-7">
              {/* Main Headline with curved lime brush stroke underneath */}
              <div className="space-y-1">
                <div className="relative inline-block">
                  <h1 className="text-4xl sm:text-6xl lg:text-[68px] font-black tracking-tight text-[#0f172a] leading-[1.08]">
                    Send Mobile
                  </h1>
                  {/* Hand-drawn lime stroke curve under "Send Mobile" */}
                  <svg
                    className="absolute -bottom-2 left-0 w-full h-4 sm:h-5 text-[#ff9c2a] pointer-events-none"
                    viewBox="0 0 280 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M3 14C55 5 180 3 277 15"
                      stroke="#ff9c2a"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h1 className="text-4xl sm:text-6xl lg:text-[68px] font-black tracking-tight text-[#0f172a] leading-[1.08] block">
                  Reloads Anywhere
                </h1>
                <h1 className="text-4xl sm:text-6xl lg:text-[68px] font-black tracking-tight text-[#0f172a] leading-[1.08] block">
                  in Africa
                </h1>
              </div>

              {/* Subtitle */}
              <p className="text-sm sm:text-base text-[#64748B] max-w-lg leading-relaxed">
                Top up any mobile phone in Africa from anywhere - keep your loved ones connected with our fast and secure reload service.
              </p>

              {/* Reload Form Box (matching dark rounded pill widget in screenshot) */}
              <div className="space-y-3 pt-2">
                <p className="text-xs font-bold text-[#0f172a] tracking-wide">
                  Who are you sending this Top-Up?
                </p>

                {/* Service Selector Tabs */}
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  {[
                    { key: 'airtime', label: 'Airtime VTU' },
                    { key: 'data', label: 'Data Bundles' },
                    { key: 'exam', label: 'Exam Pins' },
                    { key: 'electricity', label: 'Electricity' },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setSelectedServiceTab(t.key as any)}
                      className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                        selectedServiceTab === t.key
                          ? 'bg-[#0d2b8e] text-[#ff9c2a] shadow-sm'
                          : 'bg-[#eff6ff] text-[#475569] hover:bg-[#dbeafe]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleQuickSubmit} className="max-w-md">
                  <div className="bg-[#0f172a] rounded-full p-1.5 pl-5 flex items-center shadow-lg border border-slate-800">
                    {/* Network / Provider Badge */}
                    <div className="flex items-center space-x-1.5 pr-3 border-r border-slate-700 text-xs font-bold text-[#ff9c2a]">
                      <select
                        value={selectedNetwork}
                        onChange={(e) => setSelectedNetwork(e.target.value)}
                        className="bg-transparent text-white font-bold outline-none cursor-pointer text-xs"
                      >
                        <option value="MTN" className="bg-slate-900 text-white">MTN Nigeria</option>
                        <option value="Airtel" className="bg-slate-900 text-white">Airtel</option>
                        <option value="Glo" className="bg-slate-900 text-white">Glo Mobile</option>
                        <option value="9mobile" className="bg-slate-900 text-white">9mobile</option>
                      </select>
                    </div>

                    <input
                      type="text"
                      value={recipientInput}
                      onChange={(e) => setRecipientInput(e.target.value)}
                      placeholder={
                        selectedServiceTab === 'electricity'
                          ? 'Enter Meter Number'
                          : selectedServiceTab === 'exam'
                          ? 'Select Body (WAEC/JAMB)'
                          : 'Enter Phone Number'
                      }
                      className="flex-1 bg-transparent text-white placeholder-slate-400 text-xs sm:text-sm px-3 outline-none"
                    />

                    <button
                      type="submit"
                      className="w-10 h-10 rounded-full bg-[#ff9c2a] hover:bg-[#f18a18] text-[#0b2070] flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer"
                      title="Proceed to Top-up"
                    >
                      <ArrowRight className="w-4 h-4 font-bold" />
                    </button>
                  </div>
                </form>
              </div>

              {/* 100% Safe Trust Badge with Avatars (Exact match from screenshot) */}
              <div className="pt-2 flex items-center space-x-4">
                <div>
                  <h4 className="font-extrabold text-[#0f172a] text-sm tracking-tight">100% Safe</h4>
                  <p className="text-[11px] text-[#64748B]">Secure your peace of mind</p>
                </div>

                {/* Overlapping user circles */}
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full border-2 border-[#F8FAFC] bg-[#0d2b8e] text-[#ff9c2a] flex items-center justify-center font-bold text-xs overflow-hidden">
                    <img src="/assets/img/hero-woman.jpg" alt="User 1" className="w-full h-full object-cover" />
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-[#F8FAFC] bg-slate-800 text-white flex items-center justify-center font-bold text-xs overflow-hidden">
                    <img src="/assets/img/indoor-lifestyle.jpg" alt="User 2" className="w-full h-full object-cover" />
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-[#F8FAFC] bg-[#ff9c2a] text-[#0b2070] flex items-center justify-center font-bold text-xs overflow-hidden">
                    <img src="/assets/img/student-banner.jpg" alt="User 3" className="w-full h-full object-cover" />
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-[#F8FAFC] bg-[#0d2b8e] text-[#ff9c2a] flex items-center justify-center font-black text-[10px]">
                    ✓
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Large Rounded Portrait Image (matching reference screenshot) */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative w-full max-w-[420px] aspect-[3/4] rounded-[36px] overflow-hidden shadow-2xl border-4 border-white bg-slate-900 group">
                <img
                  src="/assets/img/hero-woman.jpg"
                  alt="Young smiling African woman holding smartphone"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />

                {/* Subtle floating badge */}
                <div className="absolute bottom-5 left-5 right-5 bg-black/60 backdrop-blur-md border border-white/20 p-3.5 rounded-2xl text-white flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff9c2a] animate-ping" />
                    <span className="text-xs font-bold">Instant Automated Delivery</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-[#ff9c2a] tracking-wider">
                    VTU Live
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. RECHARGE IN 3 EASY STEPS (Exact match from reference screenshot) */}
      <section id="how-it-works" className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Centered Heading with hand-drawn lime highlight curve */}
          <div className="text-center mb-14">
            <div className="relative inline-block">
              <h2 className="text-3xl sm:text-5xl font-black text-[#0f172a] tracking-tight">
                Recharge In 3 Easy Steps
              </h2>
              {/* Hand-drawn lime stroke under "3 Easy Steps" */}
              <svg
                className="absolute -bottom-2 left-1/4 w-1/2 h-3 text-[#ff9c2a] pointer-events-none"
                viewBox="0 0 160 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 10C40 3 120 2 158 10"
                  stroke="#ff9c2a"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          {/* 3 Step Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Step Card 1 */}
            <div className="bg-[#f8fafc] rounded-[26px] p-8 sm:p-9 space-y-5 border border-[#e2e8f0] transition-transform duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-full bg-[#0d2b8e] text-[#ff9c2a] flex items-center justify-center shadow-md">
                <Smartphone className="w-6 h-6 stroke-[2.2]" />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#0f172a] leading-snug">
                Log in and enter a phone number
              </h3>
              <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                Confirm the verification email to activate your account
              </p>
            </div>

            {/* Step Card 2 */}
            <div className="bg-[#f8fafc] rounded-[26px] p-8 sm:p-9 space-y-5 border border-[#e2e8f0] transition-transform duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-full bg-[#0d2b8e] text-[#ff9c2a] flex items-center justify-center shadow-md">
                <FileText className="w-6 h-6 stroke-[2.2]" />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#0f172a] leading-snug">
                Choose the amount to load
              </h3>
              <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                Fill out your contact number and pick a recharge amount
              </p>
            </div>

            {/* Step Card 3 */}
            <div className="bg-[#f8fafc] rounded-[26px] p-8 sm:p-9 space-y-5 border border-[#e2e8f0] transition-transform duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-full bg-[#0d2b8e] text-[#ff9c2a] flex items-center justify-center shadow-md">
                <CreditCard className="w-6 h-6 stroke-[2.2]" />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#0f172a] leading-snug">
                Confirm your payment and get the credit in seconds
              </h3>
              <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                Choose to pay with a bank account, debit card, or credit card
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. VIDEO BANNER / HOW IT WORKS SHOWCASE (Matching top banner in reference image) */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <p className="text-center text-xs sm:text-sm font-semibold text-[#64748B] max-w-xl mx-auto leading-relaxed">
            Using SamEduHub is easy, Just register on our website, connect your payment source and you can start recharging phone credits – right away!
          </p>

          <div className="relative rounded-[32px] overflow-hidden shadow-2xl border-4 border-white aspect-[16/9] group cursor-pointer bg-slate-900"
               onClick={() => setVideoModalOpen(true)}>
            <img
              src="/assets/img/student-banner.jpg"
              alt="Student using phone in campus"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            {/* Play Button Overlay */}
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#0f172a]/80 backdrop-blur-md border-2 border-[#ff9c2a] text-[#ff9c2a] flex items-center justify-center shadow-2xl transition-transform group-hover:scale-110">
                <Play className="w-7 h-7 fill-[#ff9c2a] ml-1" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. DEEP FOREST GREEN FEATURE SECTION ("Stay connected to friends and family") */}
      <section id="services" className="py-20 sm:py-28 bg-gradient-to-br from-[#0d2b8e] via-[#1a3fbd] to-[#0b2070] text-white overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Left Column: Portrait Photo with Neon Lime Border (Exact from reference) */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative w-full max-w-[380px] aspect-[3/4] rounded-[36px] overflow-hidden border-4 border-[#ff9c2a] shadow-2xl bg-slate-900 group">
                <img
                  src="/assets/img/indoor-lifestyle.jpg"
                  alt="Person relaxed on couch with phone"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
            </div>

            {/* Right Column: Heading & 3 Feature Points */}
            <div className="lg:col-span-7 space-y-8">
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.15]">
                Stay connected to friends and family, wherever you are.
              </h2>

              <div className="space-y-6 pt-2">
                {/* Feature 1 */}
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-full bg-[#1253d4] border border-[#55adff] text-[#ff9c2a] flex items-center justify-center shrink-0 mt-0.5">
                    <Send className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">
                      Connect with your close ones
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-lg">
                      Give airtime to your loved ones and stay connected to them. Just enter their number and the given amount.
                    </p>
                  </div>
                </div>

                {/* Feature 2 */}
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-full bg-[#1253d4] border border-[#55adff] text-[#ff9c2a] flex items-center justify-center shrink-0 mt-0.5">
                    <Globe className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">
                      Get it any place, at any time
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-lg">
                      You can get your mobile credit refill at any time of the day, anywhere in the World.
                    </p>
                  </div>
                </div>

                {/* Feature 3 */}
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-full bg-[#1253d4] border border-[#55adff] text-[#ff9c2a] flex items-center justify-center shrink-0 mt-0.5">
                    <CreditCard className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">
                      Pay fair price
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-lg">
                      Pay the fairest price for the service and keep more for the next meeting in person.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action shortcuts to core SamEduHub services */}
              <div className="pt-4 flex flex-wrap gap-2.5">
                <button
                  onClick={() => onSelectService('data')}
                  className="px-4 py-2 rounded-full bg-[#1253d4] hover:bg-[#ff9c2a] hover:text-[#0b2070] text-xs font-bold transition-colors cursor-pointer border border-[#55adff]"
                >
                  Buy Mobile Data
                </button>
                <button
                  onClick={() => onSelectService('airtime')}
                  className="px-4 py-2 rounded-full bg-[#1253d4] hover:bg-[#ff9c2a] hover:text-[#0b2070] text-xs font-bold transition-colors cursor-pointer border border-[#55adff]"
                >
                  Buy Airtime
                </button>
                <button
                  onClick={() => onSelectService('exam-pins')}
                  className="px-4 py-2 rounded-full bg-[#1253d4] hover:bg-[#ff9c2a] hover:text-[#0b2070] text-xs font-bold transition-colors cursor-pointer border border-[#55adff]"
                >
                  Exam Pins (WAEC/JAMB)
                </button>
                <button
                  onClick={() => onSelectService('electricity')}
                  className="px-4 py-2 rounded-full bg-[#1253d4] hover:bg-[#ff9c2a] hover:text-[#0b2070] text-xs font-bold transition-colors cursor-pointer border border-[#55adff]"
                >
                  Pay Electricity
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. PROMOTIONAL DISCOUNT BANNER (Exact match from reference bottom banner) */}
      <section id="promotions" className="py-16 sm:py-20 bg-[#0b2070] text-white text-center relative overflow-hidden">
        {/* Subtle geometric line watermark circles */}
        <div className="absolute inset-0 pointer-events-none opacity-10 flex items-center justify-center">
          <div className="w-[600px] h-[600px] rounded-full border border-[#ff9c2a]" />
          <div className="w-[850px] h-[850px] rounded-full border border-[#ff9c2a] absolute" />
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-6">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Get 10% OFF on your first transaction.
            <br />
            Redeem your coupon now !
          </h2>

          <div>
            <button
              onClick={onSignUp}
              className="px-8 py-3.5 bg-[#ff9c2a] hover:bg-[#f18a18] text-[#0b2070] font-black rounded-full shadow-lg shadow-[#ff9c2a]/20 transition-all cursor-pointer active:scale-95 text-sm sm:text-base"
            >
              Get Started Now — Register Free
            </button>
          </div>
        </div>
      </section>

      {/* 7. FAQ ACCORDION SECTION (Compact & Accessible) */}
      <section className="py-16 sm:py-20 bg-white border-t border-[#e2e8f0]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h3 className="text-2xl sm:text-3xl font-black text-[#0f172a]">
              Frequently Asked Questions
            </h3>
            <p className="text-xs sm:text-sm text-[#64748B] mt-2">
              Everything you need to know about our reload platform
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                q: 'What is SamEduHub?',
                a: 'SamEduHub is a secure Nigerian digital services platform providing instant virtual top-up (VTU), mobile data bundles, educational exam scratch pins (WAEC, NECO, JAMB), and electricity bill payments.'
              },
              {
                q: 'How fast are mobile reloads and data bundles delivered?',
                a: 'Deliveries are automated and processed in seconds directly with telecommunication gateways (MTN, Airtel, Glo, 9mobile).'
              },
              {
                q: 'Can I purchase examination pins online?',
                a: 'Yes, WAEC, NECO, NABTEB, and JAMB registration/result checker tokens are generated immediately upon payment.'
              },
              {
                q: 'Which payment methods are accepted?',
                a: 'You can pay via instant bank transfer, debit/credit cards (Visa, Mastercard, Verve), or by pre-funding your account wallet.'
              }
            ].map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="bg-[#f8fafc] rounded-2xl border border-[#e2e8f0] overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full px-6 py-4 text-left font-bold text-sm sm:text-base text-[#0f172a] flex items-center justify-between cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className={`w-4 h-4 text-[#1a3fbd] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-4 text-xs sm:text-sm text-[#64748B] leading-relaxed border-t border-[#e2e8f0]/60 pt-2">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8. FOOTER (Exact structure from reference mockup) */}
      <footer className="bg-[#0b2070] text-slate-300 text-xs sm:text-sm border-t border-[#1e40af]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
            {/* Left brand column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black text-white tracking-tight">SamEduHub</span>
                <span className="text-[#ff9c2a] text-xl font-black">)</span>
                <span className="text-[#55adff] text-xl font-black">)</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                Quick, easy, and reliable mobile credit and digital reloads for you, your family, and friends back home.
              </p>
              <div className="pt-2 text-xs text-slate-400">
                Support: <span className="text-[#ffbd70]">support@sameduhub.com</span>
              </div>
            </div>

            {/* Column 2: About & Support */}
            <div className="space-y-2.5">
              <ul className="space-y-2 text-xs">
                <li>
                  <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="hover:text-white transition-colors cursor-pointer">
                    About us
                  </button>
                </li>
                <li>
                  <button onClick={openContactModal} className="hover:text-white transition-colors cursor-pointer">
                    Contact us
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('services')} className="hover:text-white transition-colors cursor-pointer">
                    Operators
                  </button>
                </li>
                <li>
                  <button onClick={onSignUp} className="hover:text-white transition-colors cursor-pointer">
                    Partner
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Legal & Terms */}
            <div className="space-y-2.5">
              <ul className="space-y-2 text-xs">
                <li>
                  <button onClick={() => setLegalModal('terms')} className="hover:text-white transition-colors cursor-pointer">
                    Terms & Conditions
                  </button>
                </li>
                <li>
                  <button onClick={() => setLegalModal('refund')} className="hover:text-white transition-colors cursor-pointer">
                    Refund policy
                  </button>
                </li>
                <li>
                  <button onClick={() => setLegalModal('privacy')} className="hover:text-white transition-colors cursor-pointer">
                    Privacy & Cookies
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('promotions')} className="hover:text-white transition-colors cursor-pointer">
                    Promotions
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 4: Quick Sign In / Registration */}
            <div className="space-y-2.5">
              <div className="font-bold text-white text-xs mb-2">Account Portal</div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={onSignIn}
                  className="px-4 py-2 bg-[#1253d4] hover:bg-[#1a3fbd] text-white rounded-lg text-xs font-bold text-center cursor-pointer transition-colors"
                >
                  Log In to Account
                </button>
                <button
                  onClick={onSignUp}
                  className="px-4 py-2 bg-[#ff9c2a] hover:bg-[#f18a18] text-[#0b2070] rounded-lg text-xs font-black text-center cursor-pointer transition-colors"
                >
                  Register Free
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Card / Copyright row */}
          <div className="mt-12 pt-8 border-t border-[#1e40af] flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
            <div>
              © {new Date().getFullYear()} SamEduHub. All rights reserved.
            </div>

            {/* Payment Brand Icons (Visa, Mastercard, Verve) */}
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-white text-blue-900 font-extrabold text-[10px] tracking-wider">
                VISA
              </span>
              <span className="px-2 py-0.5 rounded bg-white text-red-600 font-bold text-[10px]">
                ●● Mastercard
              </span>
              <span className="px-2 py-0.5 rounded bg-white text-emerald-700 font-bold text-[10px]">
                VERVE
              </span>
              <span className="px-2 py-0.5 rounded bg-white text-blue-600 font-bold text-[10px]">
                SECURE
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* 9. VIDEO MODAL */}
      {videoModalOpen && (
        <div
          style={{ zIndex: 1200 }}
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-2xl bg-[#0d2b8e] border border-[#ff9c2a]/40 rounded-3xl p-6 text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e40af]">
              <div className="flex items-center space-x-2">
                <Play className="w-5 h-5 text-[#ff9c2a]" />
                <h3 className="text-lg font-bold">How SamEduHub Works</h3>
              </div>
              <button
                onClick={() => setVideoModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video bg-black/50 rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#ff9c2a] text-[#0b2070] flex items-center justify-center shadow-lg">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <div>
                <h4 className="text-lg font-bold">Fast & Automated Reloads in 3 Easy Steps</h4>
                <p className="text-xs text-slate-300 max-w-md mx-auto mt-1">
                  1. Enter phone number &bull; 2. Select amount & network &bull; 3. Confirm payment with instant credit dispatch.
                </p>
              </div>
              <button
                onClick={() => {
                  setVideoModalOpen(false);
                  onSignUp();
                }}
                className="px-6 py-2.5 bg-[#ff9c2a] hover:bg-[#f18a18] text-[#0b2070] font-black rounded-full text-xs cursor-pointer"
              >
                Get Started Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. LEGAL MODAL (Terms / Privacy / Refund) */}
      {legalModal && (
        <div
          style={{ zIndex: 1200 }}
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl p-6 sm:p-8 text-[#0f172a] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-xl font-black text-[#0f172a]">
                {legalModal === 'privacy'
                  ? 'Privacy & Cookies Policy'
                  : legalModal === 'refund'
                  ? 'Refund & Cancellation Policy'
                  : 'Terms and Conditions'}
              </h3>
              <button
                onClick={() => setLegalModal(null)}
                className="p-1 rounded-md text-slate-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs sm:text-sm text-[#64748B] space-y-3 leading-relaxed">
              <p>
                <strong>1. Service Overview:</strong> SamEduHub provides real-time virtual top-up, data bundle fulfillment, examination scratch card serials, and utility token delivery across supported providers in Nigeria.
              </p>
              <p>
                <strong>2. Instant Execution:</strong> All confirmed transactions are dispatched automatically to upstream telecommunication and utility gateways. Please verify your recipient numbers before proceeding.
              </p>
              <p>
                <strong>3. Refund Terms:</strong> If a transaction cannot be fulfilled due to upstream provider downtime, the charged amount is immediately returned to your SamEduHub wallet balance.
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setLegalModal(null)}
                className="px-5 py-2 bg-[#1a3fbd] hover:bg-[#0d2b8e] text-white rounded-full font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. CONTACT MODAL */}
      {contactModalOpen && (
        <div
          style={{ zIndex: 1200 }}
          className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="my-auto w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 sm:p-7 text-[#0f172a] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-[#0d2b8e] text-[#ff9c2a] flex items-center justify-center font-bold">
                  S
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#0f172a]">Contact Support</h3>
                  <p className="text-xs text-[#64748B]">Tell us what happened and we’ll help.</p>
                </div>
              </div>
              <button
                onClick={() => setContactModalOpen(false)}
                aria-label="Close contact support"
                className="p-1 rounded-md text-slate-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitContactComplaint} className="space-y-4">
              <input
                type="text"
                name="website"
                value={contactWebsite}
                onChange={(event) => setContactWebsite(event.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[10000px] h-px w-px opacity-0"
              />
              <label className="block text-sm font-semibold text-[#173b79]">
                Your email
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="mt-1.5 w-full rounded-xl border border-[#d9e5f5] px-4 py-3 text-sm font-normal text-[#0f172a] outline-none focus:border-[#1a3fbd] focus:ring-2 focus:ring-[#1a3fbd]/15"
                />
              </label>
              <label className="block text-sm font-semibold text-[#173b79]">
                Transaction reference <span className="font-normal text-[#64748B]">(optional)</span>
                <input
                  type="text"
                  value={contactReference}
                  onChange={(event) => setContactReference(event.target.value)}
                  placeholder="Add this if your complaint is about a transaction"
                  className="mt-1.5 w-full rounded-xl border border-[#d9e5f5] px-4 py-3 text-sm font-normal text-[#0f172a] outline-none focus:border-[#1a3fbd] focus:ring-2 focus:ring-[#1a3fbd]/15"
                />
              </label>
              <label className="block text-sm font-semibold text-[#173b79]">
                Complaint details
                <textarea
                  required
                  minLength={10}
                  rows={5}
                  value={contactComplaint}
                  onChange={(event) => setContactComplaint(event.target.value)}
                  placeholder="Describe the issue and what you need help with"
                  className="mt-1.5 w-full resize-y rounded-xl border border-[#d9e5f5] px-4 py-3 text-sm font-normal text-[#0f172a] outline-none focus:border-[#1a3fbd] focus:ring-2 focus:ring-[#1a3fbd]/15"
                />
              </label>
              {contactSubmitNotice && (
                <p role="status" className={contactSubmitNotice.type === 'success' ? 'rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800' : 'rounded-xl bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800'}>
                  {contactSubmitNotice.message}
                </p>
              )}
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-[#64748B]">A support reply will go to your email.</span>
                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="rounded-full bg-[#1a3fbd] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0d2b8e]"
                >
                  {contactSubmitting ? 'Sending…' : 'Send complaint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
