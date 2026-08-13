import React from 'react';
import { Bot, Volume2, Sparkles, FileText, Settings, ShieldCheck, Zap } from 'lucide-react';

interface HeaderProps {
  isTradingActive: boolean;
  stockName?: string;
  fontSizeClass: string;
  setFontSizeClass: (size: string) => void;
  onOpenDailyReport: () => void;
  onOpenSafetySettings: () => void;
  onOpenSmsPreview: () => void;
  onResetSetup: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isTradingActive,
  stockName,
  fontSizeClass,
  setFontSizeClass,
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
              종목과 투자금만 설정하면 AI가 알아서 매매해 드립니다
            </p>
          </div>
        </div>

        {/* Status Badge & Senior Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Active Status Badge */}
          {isTradingActive ? (
            <div className="flex items-center space-x-2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-xl text-sm font-semibold animate-pulse shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
              <span>AI 자동매매 가동 중 {stockName ? `(${stockName})` : ''}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700 text-slate-400 px-3 py-1.5 rounded-xl text-sm font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
              <span>설정 대기 중</span>
            </div>
          )}

          {/* Font Size Selector for Senior Sight */}
          <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700 text-xs text-slate-300">
            <span className="px-2 text-slate-400 font-medium">글자크기</span>
            <button
              onClick={() => setFontSizeClass('text-base')}
              className={`px-2 py-1 rounded-lg font-bold transition-colors ${
                fontSizeClass === 'text-base' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'hover:text-white'
              }`}
              title="보통 크기"
            >
              보통
            </button>
            <button
              onClick={() => setFontSizeClass('text-lg')}
              className={`px-2 py-1 rounded-lg font-bold transition-colors ${
                fontSizeClass === 'text-lg' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'hover:text-white'
              }`}
              title="크게"
            >
              크게
            </button>
            <button
              onClick={() => setFontSizeClass('text-xl')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                fontSizeClass === 'text-xl' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'hover:text-white'
              }`}
              title="아주 크게"
            >
              아주 크게
            </button>
          </div>

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
            title="문자 알림 미리보기"
          >
            <Zap className="w-4 h-4 text-teal-400" />
            <span className="hidden md:inline">알림 문자</span>
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
