import React from 'react';
import { Bot, Volume2, Sparkles, FileText, Settings, ShieldCheck, Zap } from 'lucide-react';
import { CurrencyToggle } from '../lib/currencyDisplay';

interface HeaderProps {
  showCurrencyToggle?: boolean;
  onOpenDailyReport: () => void;
  onOpenSafetySettings: () => void;
  onOpenSmsPreview: () => void;
  onResetSetup: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  showCurrencyToggle,
  onOpenDailyReport,
  onOpenSafetySettings,
  onOpenSmsPreview,
  onResetSetup,
}) => {
  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & App Title */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={onResetSetup}>
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-500/20">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-xl sm:text-2xl text-white tracking-tight">
                <span className="text-emerald-400">AI 주식 자동매매</span>
              </h1>
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                안전 모드
              </span>
            </div>
            <p className="text-xs text-slate-400">
투자금만 설정하면 AI가 종목 선정부터 매매까지 전부 알아서 합니다
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {showCurrencyToggle && <CurrencyToggle />}

          {/* Action Header Buttons */}
          <button
            onClick={onOpenDailyReport}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 px-3 py-2 rounded-xl text-sm font-semibold border border-amber-500/30 transition-all shadow-sm"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>AI 일일 보고서</span>
          </button>

          <button
            onClick={onOpenSmsPreview}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 px-3 py-2 rounded-xl text-sm font-semibold border border-teal-500/30 transition-all shadow-sm"
            title="디스코드 알림 로그"
          >
            <Zap className="w-4 h-4 text-teal-400" />
            <span className="hidden md:inline">알림 로그</span>
          </button>

          <button
            onClick={onOpenSafetySettings}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
            title="안전 장치 설정"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
