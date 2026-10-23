import type { InputHTMLAttributes, ReactNode } from 'react';

const INPUT_CLASS =
  'w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-slate-300 shadow-sm';

interface AuthBrandProps {
  className?: string;
}

export function AuthBrand({ className = 'mb-6' }: AuthBrandProps) {
  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <img src="/assets/img/sameduhub-logo-transparent.png" alt="SamEduHub" className="w-10 h-10 object-contain" />
      <span className="text-xl font-bold">
        <span className="text-slate-800">Sam</span>
        <span style={{ color: '#1a3fbd' }}>EduHub</span>
      </span>
    </div>
  );
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  icon: ReactNode;
  endAdornment?: ReactNode;
}

export function AuthField({ icon, endAdornment, className = '', ...inputProps }: AuthFieldProps) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
      <input {...inputProps} className={`${INPUT_CLASS} ${className}`} />
      {endAdornment}
    </div>
  );
}

interface AuthSubmitButtonProps {
  id: string;
  isLoading: boolean;
  loadingLabel: string;
  children: ReactNode;
  className?: string;
}

export function AuthSubmitButton({ id, isLoading, loadingLabel, children, className = '' }: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={isLoading}
      id={id}
      className={`w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed ${className}`}
      style={{ background: 'linear-gradient(135deg, #1a3fbd 0%, #2563eb 100%)' }}
    >
      {isLoading ? loadingLabel : children}
    </button>
  );
}

export function AuthDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs text-slate-400 font-medium">or</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

interface GoogleAuthButtonProps {
  id: string;
  label: string;
  onClick: () => void;
}

export function GoogleAuthButton({ id, label, onClick }: GoogleAuthButtonProps) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      className="w-full py-3.5 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm flex items-center justify-center space-x-2.5 transition-all cursor-pointer shadow-sm hover:shadow"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

interface AuthTermsProps {
  action: string;
  className?: string;
}

export function AuthTerms({ action, className = '' }: AuthTermsProps) {
  return (
    <p className={`text-center text-xs text-slate-400 ${className}`}>
      By {action}, you agree to our{' '}
      <a href="#" className="text-blue-600 hover:underline font-medium">Terms &amp; Conditions</a>{' '}and{' '}
      <a href="#" className="text-blue-600 hover:underline font-medium">Privacy Policy</a>
    </p>
  );
}
