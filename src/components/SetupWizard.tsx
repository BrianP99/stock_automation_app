import React, { useState } from 'react';
import { RiskLevel, TradingConfig } from '../types';
import { PRESET_AMOUNTS } from '../data/popularStocks';
import { ShieldCheck, Sparkles, Play, ArrowRight, Bot, Globe2 } from 'lucide-react';

interface SetupWizardProps {
  onStartTrading: (config: TradingConfig) => void;
  fontSizeClass: string;
}

const RISK_PRESETS: Record<RiskLevel, { targetProfit: number; stopLoss: number }> = {
  SAFE: { targetProfit: 3.5, stopLoss: 2.0 },
  BALANCED: { targetProfit: 5.0, stopLoss: 3.0 },
  AGGRESSIVE: { targetProfit: 7.5, stopLoss: 4.5 },
};

export const SetupWizard: React.FC<SetupWizardProps> = ({ onStartTrading, fontSizeClass }) => {
  const [investmentAmount, setInvestmentAmount] = useState<number>(1000000);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('SAFE');
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState<number>(4);
  const [isStarting, setIsStarting] = useState<boolean>(false);

  const handleStart = async () => {
    const preset = RISK_PRESETS[riskLevel];
    const config: TradingConfig = {
      investmentAmount,
      riskLevel,
      targetProfitPercent: preset.targetProfit,
      stopLossPercent: preset.stopLoss,
      autoTradingEnabled: true,
      maxTradesPerDay: 10,
      maxConcurrentPositions,
    };

    setIsStarting(true);
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || '자동매매 세션을 시작하지 못했습니다.');
      onStartTrading(config);
    } catch (err: any) {
      alert(err.message || '자동매매 세션을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className={`max-w-6xl mx-auto px-4 py-6 ${fontSizeClass}`}>
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white border border-slate-700 shadow-xl mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-sm font-semibold border border-emerald-500/30 mb-3">
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>완전 자동 AI 매매</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            종목 선택은 필요 없습니다 — <span className="text-emerald-400">AI가 직접</span> 고릅니다
          </h2>
          <p className="text-slate-300 leading-relaxed max-w-xl">
            <Globe2 className="w-4 h-4 inline mr-1 mb-0.5" />
            국내(코스피·코스닥)와 미국(나스닥·S&P500)의 대장주·유망주 약 200개 종목을 5분마다 스캔하여, 이동평균선·RSI 등
            기술적 지표로 매수/매도 타이밍을 감정 없이 규칙 기반으로 판단합니다. 투자금과 위험 성향만 정해주세요.
          </p>
        </div>
      </div>

      {/* Below lg: single narrow column (phone/tablet). At lg+: form column + a
          right rail that fills the space a fixed-width form would otherwise
          leave empty on wide desktop screens. */}
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8 lg:items-start">
      <div className="max-w-3xl space-y-8">
        {/* STEP 1: Investment Amount */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-6">
            <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center text-lg shadow-md shadow-emerald-600/20">
              1
            </span>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900">투자 금액</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-5">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setInvestmentAmount(preset.value)}
                className={`py-3 px-4 rounded-2xl font-bold text-center border-2 transition-all ${
                  investmentAmount === preset.value
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-600/20 scale-105'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-slate-700 shrink-0">직접 입력 금액</span>
            <div className="relative flex-1 max-w-xs">
              <input
                type="number"
                step="100000"
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(Math.max(100000, Number(e.target.value)))}
                className="w-full text-right font-black text-xl text-emerald-700 bg-white border border-slate-300 rounded-xl py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-sm font-bold text-slate-500 pointer-events-none">원</span>
            </div>
          </div>
        </div>

        {/* STEP 2: Risk Level */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-6">
            <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center text-lg shadow-md shadow-emerald-600/20">
              2
            </span>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">투자 성향</h3>
              <p className="text-sm text-slate-500">AI가 종목별로 이 목표 수익/손절선 범위 내에서만 매매합니다.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(
              [
                { level: 'SAFE' as const, emoji: '🛡️', badge: '추천 (가장 안전)', title: '안정 수익형', desc: '원금 보존을 최우선으로, 짧고 확실한 수익을 챙깁니다.' },
                { level: 'BALANCED' as const, emoji: '⚖️', badge: '표준 추세', title: '균형 추세형', desc: '수익과 손실 방지의 균형을 유지합니다.' },
                { level: 'AGGRESSIVE' as const, emoji: '🚀', badge: '적극 트레이딩', title: '적극 성장형', desc: '변동성이 클 때 적극적으로 이익 창출을 도모합니다.' },
              ]
            ).map((opt) => (
              <button
                key={opt.level}
                onClick={() => setRiskLevel(opt.level)}
                className={`p-5 rounded-2xl border-2 text-left transition-all ${
                  riskLevel === opt.level ? 'bg-emerald-50 border-emerald-500 shadow-md ring-2 ring-emerald-500/20' : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">{opt.badge}</span>
                </div>
                <h4 className="text-lg font-bold text-slate-900">{opt.title}</h4>
                <p className="text-xs text-slate-600 mt-1">{opt.desc}</p>
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex justify-between text-xs font-bold">
                  <span className="text-emerald-700">종목별 목표 익절: +{RISK_PRESETS[opt.level].targetProfit}%</span>
                  <span className="text-slate-500">손절: -{RISK_PRESETS[opt.level].stopLoss}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* STEP 3: Max Concurrent Positions */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-6">
            <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center text-lg shadow-md shadow-emerald-600/20">
              3
            </span>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">동시 보유 종목 수</h3>
              <p className="text-sm text-slate-500">투자금을 몇 개 종목으로 나눠서 분산 투자할지 정해주세요.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setMaxConcurrentPositions(n)}
                className={`py-4 rounded-2xl font-black text-lg border-2 transition-all ${
                  maxConcurrentPositions === n ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg scale-105' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {n}개 종목
              </button>
            ))}
          </div>
        </div>

        {/* Info card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center space-x-3 text-slate-600 text-sm">
          <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0" />
          <span>
            매수는 100% AI 규칙 기반 판단으로만 이루어집니다. 원하시면 언제든 전체 일시정지, 전량 매도, 또는 특정 종목만 긴급
            매도할 수 있습니다.
          </span>
        </div>

        {/* START BUTTON */}
        <div className="pt-2">
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="w-full py-5 px-8 rounded-3xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xl sm:text-2xl shadow-xl shadow-emerald-500/25 transition-all transform hover:-translate-y-1 active:translate-y-0 flex items-center justify-center space-x-3 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {isStarting ? (
              <>
                <div className="w-6 h-6 border-3 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>자동매매 세션을 시작하는 중...</span>
              </>
            ) : (
              <>
                <Play className="w-7 h-7 fill-slate-950" />
                <span>{investmentAmount.toLocaleString()}원 AI 완전 자동매매 시작하기</span>
                <ArrowRight className="w-6 h-6" />
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-500 mt-3">
            * 서버에서 5분마다 자동으로 매매를 확인하며, 언제든지 일시정지 및 전량 매도 후 원금 회수가 가능합니다.
          </p>
        </div>
      </div>

      {/* Desktop-only right rail — hidden below lg so phones/tablets are unaffected. */}
      <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-6 gap-4">
        <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h4 className="font-bold text-lg">AI 스캔 시스템</h4>
          </div>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">감시 대상</dt>
              <dd className="text-slate-200 leading-relaxed">
                코스피·코스닥 대장주 + 나스닥·S&P500 대장주, 약 200개 종목 (단일 종목·비레버리지)
              </dd>
            </div>
            <div>
              <dt className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">판단 지표</dt>
              <dd className="text-slate-200 leading-relaxed">5·20일 이동평균선, RSI(14), 골든크로스·데드크로스</dd>
            </div>
            <div>
              <dt className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">스캔 주기</dt>
              <dd className="text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                5분마다 전체 재스캔
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            안전장치
          </h4>
          <ul className="space-y-2 text-sm text-slate-600">
            <li>· 종목별 개별 손절/익절 (전체 포트폴리오 손익 아님)</li>
            <li>· 일일 최대 매매 횟수 제한</li>
            <li>· 언제든 일시정지 / 특정 종목 긴급 매도</li>
          </ul>
        </div>
      </aside>
      </div>
    </div>
  );
};
