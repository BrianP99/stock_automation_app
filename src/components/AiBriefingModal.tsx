import React, { useState, useEffect } from 'react';
import { Volume2, X, Sparkles, FileText, CheckCircle, ShieldCheck } from 'lucide-react';
import { PortfolioState, TradingConfig } from '../types';

interface AiBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TradingConfig;
  portfolio?: PortfolioState;
}

export const AiBriefingModal: React.FC<AiBriefingModalProps> = ({
  isOpen,
  onClose,
  config,
  portfolio,
}) => {
  const [briefing, setBriefing] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetchDailyBriefing();
    }
  }, [isOpen]);

  const fetchDailyBriefing = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/daily-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockName: config.stock.name,
          totalReturnAmount: portfolio?.totalPnL || 0,
          totalReturnPercent: portfolio?.totalPnLPercent || 0,
          tradesCount: portfolio?.todayTradesCount || 1,
          winRate: portfolio?.todayTradesCount
            ? Math.round((portfolio.winCount / portfolio.todayTradesCount) * 100)
            : 100,
        }),
      });
      const data = await res.json();
      setBriefing(data);
    } catch (err) {
      console.error('Failed to fetch daily briefing:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeakAudio = () => {
    if (!briefing || !('speechSynthesis' in window)) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    const fullText = `${briefing.title || '오늘의 AI 자동매매 리포트'}. ${briefing.summaryText || ''}. ${
      briefing.summaryLetter || ''
    }. ${briefing.tomorrowPreview || ''}`;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = 'ko-KR';
    utterance.rate = 0.9;
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    window.speechSynthesis.speak(utterance);
    setIsPlayingAudio(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-10 h-10 rounded-2xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Title */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              AI 자동매매 리포트
            </span>
            <h3 className="text-2xl font-black text-white">
              오늘의 AI 매매 요약
            </h3>
          </div>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="py-16 text-center space-y-4">
            <div className="inline-block w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-300 font-medium">
              Gemini AI가 정성스럽게 오늘의 보고서를 작성 중입니다...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-800/80 rounded-2xl p-4 border border-slate-700/80">
              <div>
                <span className="text-xs text-slate-400 font-medium">대상 종목</span>
                <div className="text-base font-bold text-white mt-0.5">{config.stock.name}</div>
              </div>
              <div>
                <span className="text-xs text-slate-400 font-medium">오늘 손익</span>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    (portfolio?.totalPnL || 0) >= 0 ? 'text-red-400' : 'text-blue-400'
                  }`}
                >
                  {(portfolio?.totalPnL || 0) >= 0 ? '+' : ''}
                  {Math.round(portfolio?.totalPnL || 0).toLocaleString()}원 (
                  {portfolio?.totalPnLPercent || 0}%)
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-xs text-slate-400 font-medium">자동매매 실행</span>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  총 {portfolio?.todayTradesCount || 1}회 체결
                </div>
              </div>
            </div>

            {/* AI Summary Box */}
            <div className="bg-slate-800/50 border border-amber-500/30 rounded-2xl p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                <span className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>오늘의 핵심 요약</span>
                </span>
                <button
                  onClick={handleSpeakAudio}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    isPlayingAudio
                      ? 'bg-amber-500 text-slate-950 shadow-md animate-pulse'
                      : 'bg-slate-700 hover:bg-slate-600 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isPlayingAudio ? '음성 재생 중 (클릭시 정지)' : '📢 음성으로 듣기'}</span>
                </button>
              </div>

              <p className="text-base sm:text-lg text-slate-200 font-medium leading-relaxed italic pt-1">
                "{briefing?.summaryLetter}"
              </p>
            </div>

            {/* Tomorrow Plan */}
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 flex items-start space-x-3">
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
                  내일의 AI 매매 방향
                </h5>
                <p className="text-sm text-emerald-200 font-medium">
                  {briefing?.tomorrowPreview}
                </p>
              </div>
            </div>

            {/* Confirm Close Button */}
            <button
              onClick={onClose}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg rounded-2xl shadow-lg shadow-emerald-500/20 transition-all"
            >
              보고서 확인 완료
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
