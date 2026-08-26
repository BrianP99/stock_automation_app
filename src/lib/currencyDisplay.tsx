import React, { createContext, useContext, useEffect, useState } from 'react';

export type CurrencyMode = 'KRW' | 'USD';

interface CurrencyDisplayContextValue {
  mode: CurrencyMode;
  setMode: (mode: CurrencyMode) => void;
}

const CurrencyDisplayContext = createContext<CurrencyDisplayContextValue>({
  mode: 'KRW',
  setMode: () => {},
});

const STORAGE_KEY = 'currencyDisplayMode';

export const CurrencyDisplayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<CurrencyMode>(() => {
    if (typeof window === 'undefined') return 'KRW';
    return window.localStorage.getItem(STORAGE_KEY) === 'USD' ? 'USD' : 'KRW';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage unavailable (private mode etc.) — not worth failing over.
    }
  }, [mode]);

  return <CurrencyDisplayContext.Provider value={{ mode, setMode }}>{children}</CurrencyDisplayContext.Provider>;
};

export const useCurrencyDisplay = () => useContext(CurrencyDisplayContext);

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 한국 주식은 항상 원화로, 미국 주식은 선택된 모드(원화/달러)로 표시. */
export function formatStockPrice(nativeAmount: number, krwAmount: number, currency: 'KRW' | 'USD', mode: CurrencyMode): string {
  if (currency === 'KRW' || mode === 'KRW') {
    return `${Math.round(krwAmount).toLocaleString('ko-KR')}원`;
  }
  return usdFormatter.format(nativeAmount);
}

/** $/원 토글 — 한국 주식만 보유 중이면 의미가 없어 렌더하지 않는 쪽에서 훅으로 판단. */
export const CurrencyToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { mode, setMode } = useCurrencyDisplay();
  return (
    <div className={`flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700 text-xs text-slate-300 ${className || ''}`}>
      <span className="px-2 text-slate-400 font-medium hidden sm:inline">미국주식</span>
      <button
        onClick={() => setMode('KRW')}
        className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
          mode === 'KRW' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'hover:text-white'
        }`}
        title="미국 주식을 원화로 표시"
      >
        원
      </button>
      <button
        onClick={() => setMode('USD')}
        className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
          mode === 'USD' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'hover:text-white'
        }`}
        title="미국 주식을 달러로 표시"
      >
        $
      </button>
    </div>
  );
};
