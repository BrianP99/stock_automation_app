import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SetupWizard } from './components/SetupWizard';
import { TradingDashboard } from './components/TradingDashboard';
import { AiBriefingModal } from './components/AiBriefingModal';
import { SafetySettingsModal } from './components/SafetySettingsModal';
import { SmsPreviewModal } from './components/SmsPreviewModal';
import { TradingConfig, AiStockAnalysis } from './types';
import { Bot, ShieldCheck } from 'lucide-react';

export default function App() {
  // Application State
  const [tradingConfig, setTradingConfig] = useState<TradingConfig | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiStockAnalysis | undefined>(undefined);
  const [fontSizeClass, setFontSizeClass] = useState<string>('text-lg');
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);

  // Modals
  const [isDailyReportOpen, setIsDailyReportOpen] = useState<boolean>(false);
  const [isSafetySettingsOpen, setIsSafetySettingsOpen] = useState<boolean>(false);
  const [isSmsPreviewOpen, setIsSmsPreviewOpen] = useState<boolean>(false);

  // A trading session runs server-side (Netlify scheduled function), so on
  // load we check whether one is already active — e.g. the browser was
  // closed for a multi-day test and just got reopened — and jump straight
  // to the dashboard instead of the setup wizard.
  useEffect(() => {
    fetch('/api/session/state')
      .then((res) => (res.ok ? res.json() : { active: false }))
      .then((data) => {
        if (data.active && data.session?.config) {
          setTradingConfig(data.session.config);
        }
      })
      .catch(() => {})
      .finally(() => setIsCheckingSession(false));
  }, []);

  const handleStartTrading = (config: TradingConfig, analysis?: AiStockAnalysis) => {
    setTradingConfig(config);
    setAiAnalysis(analysis);
  };

  const handleResetSetup = () => {
    setTradingConfig(null);
  };

  const handleUpdateConfig = async (updated: Partial<TradingConfig>) => {
    if (!tradingConfig) return;
    try {
      const res = await fetch('/api/session/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-config', configUpdates: updated }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '설정을 저장하지 못했습니다.');
      setTradingConfig({ ...tradingConfig, ...updated });
    } catch (err: any) {
      alert(err.message || '설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950 antialiased">
      {/* App Header */}
      <Header
        isTradingActive={!!tradingConfig?.autoTradingEnabled}
        stockName={tradingConfig?.stock.name}
        fontSizeClass={fontSizeClass}
        setFontSizeClass={setFontSizeClass}
        onOpenDailyReport={() => setIsDailyReportOpen(true)}
        onOpenSafetySettings={() => setIsSafetySettingsOpen(true)}
        onOpenSmsPreview={() => setIsSmsPreviewOpen(true)}
        onResetSetup={handleResetSetup}
      />

      {/* Main Container */}
      <main className="flex-1 pb-16">
        {isCheckingSession ? (
          <div className="max-w-3xl mx-auto px-4 py-24 text-center">
            <div className="inline-block w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !tradingConfig ? (
          <SetupWizard onStartTrading={handleStartTrading} fontSizeClass={fontSizeClass} />
        ) : (
          <TradingDashboard
            config={tradingConfig}
            aiAnalysis={aiAnalysis}
            fontSizeClass={fontSizeClass}
            onResetSetup={handleResetSetup}
            onOpenDailyReport={() => setIsDailyReportOpen(true)}
            onOpenSmsPreview={() => setIsSmsPreviewOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-2">
          <div className="flex items-center justify-center space-x-2 text-slate-400 font-semibold text-sm">
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>AI 주식 자동매매 시스템</span>
          </div>
          <p className="max-w-2xl mx-auto leading-relaxed text-slate-400">
            * 본 시스템은 실제 주식 시장 수급 및 Gemini AI 정밀 분석 기술을 기반으로 작동하는
            시뮬레이션 및 자동 매매 가이드입니다. 투자 자산의 안전을 보장하도록 자동 손절/익절 안전장치가 가동됩니다.
          </p>
          <p className="text-slate-400 font-mono">© 2026 AI Stock Auto-Trader. All rights reserved.</p>
        </div>
      </footer>

      {/* Modals */}
      <AiBriefingModal
        isOpen={isDailyReportOpen}
        onClose={() => setIsDailyReportOpen(false)}
        config={
          tradingConfig || {
            stock: {
              symbol: '005930',
              name: '삼성전자',
              category: '국내 대형주',
              currentPrice: 72500,
              changePercent: 1.68,
              marketCap: '432조원',
              currency: 'KRW',
              description: '',
            },
            investmentAmount: 1000000,
            riskLevel: 'SAFE',
            targetProfitPercent: 3.5,
            stopLossPercent: 2.0,
            autoTradingEnabled: false,
            maxTradesPerDay: 5,
          }
        }
      />

      <SafetySettingsModal
        isOpen={isSafetySettingsOpen}
        onClose={() => setIsSafetySettingsOpen(false)}
        config={
          tradingConfig || {
            stock: {
              symbol: '005930',
              name: '삼성전자',
              category: '국내 대형주',
              currentPrice: 72500,
              changePercent: 1.68,
              marketCap: '432조원',
              currency: 'KRW',
              description: '',
            },
            investmentAmount: 1000000,
            riskLevel: 'SAFE',
            targetProfitPercent: 3.5,
            stopLossPercent: 2.0,
            autoTradingEnabled: false,
            maxTradesPerDay: 5,
          }
        }
        onUpdateConfig={handleUpdateConfig}
      />

      <SmsPreviewModal
        isOpen={isSmsPreviewOpen}
        onClose={() => setIsSmsPreviewOpen(false)}
        config={
          tradingConfig || {
            stock: {
              symbol: '005930',
              name: '삼성전자',
              category: '국내 대형주',
              currentPrice: 72500,
              changePercent: 1.68,
              marketCap: '432조원',
              currency: 'KRW',
              description: '',
            },
            investmentAmount: 1000000,
            riskLevel: 'SAFE',
            targetProfitPercent: 3.5,
            stopLossPercent: 2.0,
            autoTradingEnabled: false,
            maxTradesPerDay: 5,
          }
        }
      />
    </div>
  );
}
