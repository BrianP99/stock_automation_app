import React, { useState } from 'react';
import { TradingConfig } from '../types';
import { PRESET_AMOUNTS } from '../data/popularStocks';
import { ShieldCheck, Sparkles, Play, ArrowRight, Bot, TrendingUp, Ruler, Anchor, ChevronLeft, ChevronRight } from 'lucide-react';

interface SetupWizardProps {
  onStartTrading: (config: TradingConfig) => void;
  fontSizeClass: string;
}

interface MethodologyItem {
  term: string;
  desc: string;
}

interface MethodologyPage {
  heading: string;
  items: MethodologyItem[];
}

// AI 판단 기준 — every term the AI actually uses, each with a plain-language
// explanation, split into 3 short pages instead of one long scroll.
const METHODOLOGY_PAGES: MethodologyPage[] = [
  {
    heading: '무엇을, 언제 살까',
    items: [
      { term: '감시 대상', desc: '국내외 우량주 약 200개를 5분마다 재스캔해요 (레버리지·인버스 제외).' },
      {
        term: '골든크로스',
        desc: '최근 5일 평균가가 20일 평균가를 위로 뚫는 순간이에요. "흐름이 방금 상승으로 바뀌었다"는 뜻이라 매수 후보로 봐요.',
      },
      {
        term: 'RSI · 과열/침체 지표',
        desc: '최근 며칠간 얼마나 급하게 오르내렸는지 0~100 숫자로 나타내요. 70 넘으면 "너무 급하게 올랐다", 30 밑이면 "너무 급하게 빠졌다"는 신호예요.',
      },
    ],
  },
  {
    heading: '진짜 신호인지 확인',
    items: [
      {
        term: '200일선 · 장기 추세 필터',
        desc: '최근 200일(약 10개월) 평균가예요. 주가가 이 선보다 낮으면, 골든크로스가 떠도 가짜 신호일 수 있어서 매수를 보류해요.',
      },
      { term: '거래량 확인', desc: '평소보다 사고파는 사람이 확 늘었을 때 나온 신호는 더 믿을 만해서, 신뢰도 점수를 더 얹어줘요.' },
      {
        term: 'ATR · 변동성 지표',
        desc: '이 종목이 하루에 보통 얼마나 오르내리는지 나타내는 숫자예요. 성장주는 크고 대형주는 작아요. 아래 손절선·청산·투자금 배분이 전부 이 숫자 기준이에요.',
      },
    ],
  },
  {
    heading: '돈은 어떻게 지킬까',
    items: [
      {
        term: '자동 손절선 (진입가 − ATR×2)',
        desc: '산 가격에서 평소 변동폭의 2배만큼 떨어지면 자동으로 팔아요. 종목마다 폭이 달라서 정상적인 등락에 억울하게 팔리지 않아요.',
      },
      {
        term: '트레일링 청산 (고점 − ATR×2.5)',
        desc: '목표가에 닿아도 무조건 안 팔아요. 최고가에서 ATR의 2.5배만큼 빠질 때 팔아서, 더 오를 기회를 열어둬요.',
      },
      {
        term: '투자금 배분 & 안전장치',
        desc: '손절당해도 전체 자산의 1%만 잃도록 종목마다 사는 금액을 다르게 정해요. 하루 매매 횟수 제한, 언제든 일시정지·긴급 매도도 가능해요.',
      },
    ],
  },
];

export const SetupWizard: React.FC<SetupWizardProps> = ({ onStartTrading, fontSizeClass }) => {
  const [investmentAmount, setInvestmentAmount] = useState<number>(1000000);
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState<number>(4);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [methodologyPage, setMethodologyPage] = useState<number>(0);

  const handleStart = async () => {
    const config: TradingConfig = {
      investmentAmount,
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
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-3xl px-6 py-5 sm:px-8 sm:py-6 text-white border border-slate-700 shadow-xl mb-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-sm font-semibold border border-emerald-500/30 mb-2.5">
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>완전 자동 AI 매매</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white mb-1.5">
            종목 고민은 이제 그만 — <span className="text-emerald-400">AI가 다 골라드려요</span>
          </h2>
          <p className="text-slate-300 leading-relaxed text-sm max-w-2xl">
            국내외 우량주 약 200개를 5분마다 확인해서 정해진 규칙대로만 사고팝니다. 투자금과 종목 수만 정해주시면 끝!
          </p>
        </div>
      </div>

      {/* Below lg: single narrow column (phone/tablet). At lg+: form column + a
          right rail that fills the space a fixed-width form would otherwise
          leave empty on wide desktop screens. */}
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start">
      <div className="space-y-5">
        {/* STEP 1 + 2, side by side on desktop so this fits in one screen. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* STEP 1: Investment Amount */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-2.5 mb-4">
              <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center shadow-md shadow-emerald-600/20">
                1
              </span>
              <h3 className="text-lg font-bold text-slate-900">투자 금액</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setInvestmentAmount(preset.value)}
                  className={`py-2.5 px-2 rounded-xl font-bold text-sm text-center border-2 whitespace-nowrap break-keep transition-all ${
                    investmentAmount === preset.value
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-600 shrink-0">직접 입력</span>
              <div className="relative flex-1 max-w-[160px]">
                <input
                  type="text"
                  inputMode="numeric"
                  value={investmentAmount.toLocaleString('ko-KR')}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/[^0-9]/g, '');
                    setInvestmentAmount(Number(digitsOnly) || 0);
                  }}
                  onBlur={() => setInvestmentAmount((v) => Math.max(100000, v))}
                  className="w-full text-right font-black text-base text-emerald-700 bg-white border border-slate-300 rounded-lg py-1.5 pl-2 pr-8 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 pointer-events-none">원</span>
              </div>
            </div>
          </div>

          {/* STEP 2: Max Concurrent Positions */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-2.5 mb-4">
              <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center shadow-md shadow-emerald-600/20">
                2
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">동시 보유 종목 수</h3>
                <p className="text-xs text-slate-500">투자금을 몇 종목에 나눠 담을지</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxConcurrentPositions(n)}
                  className={`py-3.5 rounded-xl font-black text-base border-2 transition-all ${
                    maxConcurrentPositions === n
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {n}개
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
              종목 수가 많을수록 한 종목당 들어가는 돈은 줄어서, 한 종목이 흔들려도 전체 충격은 작아져요.
            </p>
          </div>
        </div>

        {/* Beginner-friendly explainer for the ATR-based auto exit — no risk-profile
            picker anymore; a flat stop% for every stock either cut growth names
            out on ordinary noise or left calm stocks with a stop too loose. */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl p-5 sm:p-6 border border-emerald-200">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-3">손절선, AI가 종목마다 다르게 그어요</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white/70 rounded-2xl p-3.5 flex gap-2.5">
              <Ruler className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 leading-relaxed">
                <b>왜?</b> 잘 출렁이는 성장주와 잔잔한 대형주를 똑같은 기준(예: -2%)으로 자르면, 성장주는 정상적으로
                움직였을 뿐인데 억울하게 팔려버려요.
              </p>
            </div>
            <div className="bg-white/70 rounded-2xl p-3.5 flex gap-2.5">
              <Anchor className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 leading-relaxed">
                <b>그래서</b> 매수할 때 그 종목이 평소 하루에 얼마나 움직이는지(변동성) 계산해서, 종목마다 손절선을
                다르게 잡아요.
              </p>
            </div>
            <div className="bg-white/70 rounded-2xl p-3.5 flex gap-2.5">
              <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 leading-relaxed">
                <b>오를 때는</b> 목표가에 닿았다고 무조건 팔지 않아요. 최고점에서 일정 폭 이상 빠질 때까지 기다렸다가
                팔아서, 더 오를 기회를 열어둬요.
              </p>
            </div>
          </div>
        </div>

        {/* Info card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center space-x-3 text-slate-600 text-sm">
          <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0" />
          <span>매수는 전부 AI 규칙으로만 결정돼요. 마음 바뀌면 언제든 일시정지하거나 전량 매도할 수 있습니다.</span>
        </div>

        {/* START BUTTON */}
        <div className="pt-1">
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
                <span>{investmentAmount.toLocaleString('ko-KR')}원 AI 완전 자동매매 시작하기</span>
                <ArrowRight className="w-6 h-6" />
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-500 mt-3">
            * 서버에서 5분마다 자동으로 매매를 확인하며, 언제든지 일시정지 및 전량 매도 후 원금 회수가 가능합니다.
          </p>
        </div>
      </div>

      {/* Desktop-only right rail — hidden below lg so phones/tablets are unaffected.
          A fixed-height, paginated card (was one long scrolling list) so the
          whole setup screen fits without scrolling — 3 short pages instead
          of 9 items stacked end to end. */}
      <aside className="hidden lg:block lg:sticky lg:top-6">
        <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800 shadow-xl h-[700px] flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h4 className="font-bold text-base">AI 판단 기준</h4>
          </div>
          <p className="text-xs text-slate-400 mb-4">지금 이 시스템이 실제로 쓰는 기준을 쉽게 풀어서 설명해요.</p>

          <div className="flex-1 min-h-0">
            <div className="text-emerald-300 font-bold text-sm mb-3 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[11px]">
                {methodologyPage + 1}
              </span>
              {METHODOLOGY_PAGES[methodologyPage].heading}
            </div>
            <dl className="space-y-4 text-[13px]">
              {METHODOLOGY_PAGES[methodologyPage].items.map((item) => (
                <div key={item.term}>
                  <dt className="text-white font-bold mb-1">{item.term}</dt>
                  <dd className="text-slate-300 leading-relaxed">{item.desc}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Page nav */}
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-800">
            <button
              onClick={() => setMethodologyPage((p) => Math.max(0, p - 1))}
              disabled={methodologyPage === 0}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 transition-colors"
              title="이전"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5">
              {METHODOLOGY_PAGES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setMethodologyPage(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === methodologyPage ? 'w-5 bg-emerald-400' : 'w-1.5 bg-slate-700 hover:bg-slate-600'
                  }`}
                  title={`${i + 1}페이지`}
                />
              ))}
            </div>
            <button
              onClick={() => setMethodologyPage((p) => Math.min(METHODOLOGY_PAGES.length - 1, p + 1))}
              disabled={methodologyPage === METHODOLOGY_PAGES.length - 1}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 transition-colors"
              title="다음"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
      </div>
    </div>
  );
};
