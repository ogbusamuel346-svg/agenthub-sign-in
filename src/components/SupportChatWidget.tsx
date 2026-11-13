import { useEffect, useRef, useState } from 'react';
import { Bot, Headphones, MessageCircle, Send, X } from 'lucide-react';
import { apiRequest } from '../services/apiClient';

type ChatMessage = { id: number; role: 'assistant' | 'user'; text: string };

const suggestions = ['What services do you offer?', 'How do I buy data?', 'My transaction is pending'];

function answerQuestion(rawQuestion: string): string {
  const question = rawQuestion.toLowerCase();
  if (/\b(hello|hi|hey|good morning|good afternoon)\b/.test(question)) {
    return 'Hello! I’m the SamEduHub assistant. I can help with data, airtime, exam pins, electricity payments, wallets, and transaction questions.';
  }
  if (/service|offer|provide|sell/.test(question)) {
    return 'SamEduHub offers mobile data, airtime top-ups, WAEC/NECO/NABTEB/JAMB exam pins, and electricity bill payments.';
  }
  if (/data bundle|buy data|mobile data/.test(question)) {
    return 'Sign in, choose Buy Data, select your network and bundle, enter the recipient phone number, then review and confirm the purchase.';
  }
  if (/airtime|recharge|top.?up/.test(question)) {
    return 'Sign in, choose Buy Airtime, select the network, enter the phone number and amount, then review and confirm.';
  }
  if (/exam|waec|neco|nabteb|jamb|pin|scratch/.test(question)) {
    return 'Sign in and choose Exam Pins. Select the exam and pin type, review the order, and complete payment. Your purchase will appear in Transactions.';
  }
  if (/electricity|bill|meter|token/.test(question)) {
    return 'Sign in, choose Electricity Bills, select your distribution company and meter type, enter the meter number, then review and confirm the payment.';
  }
  if (/wallet|fund|balance|deposit/.test(question)) {
    return 'Sign in and open Wallet to check your balance or fund it. Successful wallet top-ups and purchases appear in Transactions.';
  }
  if (/transaction|pending|failed|not received|wrong|refund|reference/.test(question)) {
    return 'For a specific transaction, sign in and open Transactions to find its status and reference. If it is still unresolved, send support your transaction reference and the email on your account using Contact Support.';
  }
  if (/payment|card|transfer/.test(question)) {
    return 'SamEduHub supports wallet funding and the payment options shown at checkout. If a payment was debited but not reflected, contact support with your transaction reference.';
  }
  if (/account|sign.?in|login|password|register/.test(question)) {
    return 'Use Sign In or Create Account in the site menu. If you forgot your password, choose Forgot Password on the sign-in screen and follow the email link.';
  }
  if (/human|agent|support|contact|complaint/.test(question)) {
    return 'I can help with common questions here. For a staff member, use Contact Support and include your account email and transaction reference if you have one.';
  }
  return 'I don’t have a reliable answer for that yet. Please use Contact Support so the team can follow up. For transaction issues, include the transaction reference and your account email.';
}

export function SupportChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, role: 'assistant', text: 'Hi! I’m the SamEduHub assistant. Ask me about our services, payments, or your account.' },
  ]);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open]);

  const sendMessage = async (text = input) => {
    const question = text.trim();
    if (!question || sending) return;
    setInput('');
    const userMessage: ChatMessage = { id: Date.now(), role: 'user', text: question };
    const priorMessages = messages.slice(-8);
    setMessages((current) => [...current, userMessage]);
    setSending(true);
    try {
      const response = await apiRequest<{ reply: string }>('/api/cloudflare/support/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [...priorMessages, userMessage].map(({ role, text: content }) => ({ role, content })),
        }),
      });
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', text: response.reply }]);
    } catch {
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', text: `${answerQuestion(question)}\n\nI’m using basic help right now because the AI assistant is temporarily unavailable.` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[1100] font-sans">
      {open && (
        <section aria-label="SamEduHub chat assistant" className="mb-3 flex h-[min(620px,calc(100dvh-110px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-[#d7e3f4] bg-white shadow-2xl shadow-[#09295c]/20">
          <header className="flex items-center gap-3 bg-gradient-to-r from-[#082b66] to-[#155eef] px-4 py-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15"><Bot className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-extrabold">SamEduHub Assistant</p><p className="mt-0.5 text-[11px] text-blue-100">Quick help with services and orders</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-2 text-white/80 hover:bg-white/15 hover:text-white"><X className="h-4 w-4" /></button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#f5f8fd] p-4" aria-live="polite">
            <p className="mx-auto w-fit rounded-full bg-white px-3 py-1 text-[10px] text-[#6a7f9e] shadow-sm">Automated support · Don’t share passwords or verification codes</p>
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <p className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${message.role === 'user' ? 'rounded-br-md bg-[#155eef] text-white' : 'rounded-bl-md border border-[#e3eaf4] bg-white text-[#19375f] shadow-sm'}`}>{message.text}</p>
              </div>
            ))}
            <div ref={messageEndRef} />
          </div>

          {messages.length === 1 && (
            <div className="flex gap-2 overflow-x-auto border-t border-[#edf1f7] bg-white px-3 py-2.5">
              {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => sendMessage(suggestion)} className="shrink-0 rounded-full border border-[#d7e3f4] px-3 py-1.5 text-[10px] font-semibold text-[#194785] hover:border-[#155eef] hover:bg-blue-50">{suggestion}</button>)}
            </div>
          )}

          <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }} className="flex items-center gap-2 border-t border-[#e6edf6] bg-white p-3">
            <label className="sr-only" htmlFor="sameduhub-chat-message">Your question</label>
            <input id="sameduhub-chat-message" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type your question…" maxLength={1000} className="min-w-0 flex-1 rounded-full border border-[#d8e2f0] px-4 py-2.5 text-xs text-[#16345e] outline-none placeholder:text-[#8a9bb4] focus:border-[#155eef] focus:ring-2 focus:ring-[#155eef]/10" />
            <button type="submit" disabled={!input.trim() || sending} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ff7b17] text-white transition hover:bg-[#ed6905] disabled:cursor-not-allowed disabled:opacity-45">{sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send className="h-4 w-4" />}</button>
          </form>
          <footer className="flex items-center justify-between border-t border-[#f0f3f8] px-4 py-2 text-[10px] text-[#7486a1]">
            <span>Need a person?</span>
            <button type="button" onClick={() => window.dispatchEvent(new Event('sameduhub:open-support'))} className="inline-flex items-center gap-1 font-bold text-[#1554bd] hover:underline"><Headphones className="h-3 w-3" /> Contact support</button>
          </footer>
        </section>
      )}

      <button type="button" onClick={() => setOpen((current) => !current)} aria-label={open ? 'Close SamEduHub assistant' : 'Open SamEduHub assistant'} aria-expanded={open} className="ml-auto flex h-14 items-center gap-2 rounded-full bg-[#ff7b17] px-5 text-white shadow-xl shadow-orange-900/25 transition hover:-translate-y-0.5 hover:bg-[#ed6905] focus:outline-none focus:ring-4 focus:ring-orange-300">
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        <span className="text-sm font-extrabold">{open ? 'Close' : 'Ask SamEduHub'}</span>
      </button>
    </div>
  );
}
