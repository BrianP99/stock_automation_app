import React, { useState, useEffect } from 'react';
import { Stock, RiskLevel, TradingConfig, AiStockAnalysis } from '../types';
import { POPULAR_STOCKS, PRESET_AMOUNTS } from '../data/popularStocks';
import {
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Search,
  DollarSign,
  AlertCircle,
  Play,
  ArrowRight,
  HelpCircle,
  Bot,
  Zap,
} from 'lucide-react';

interface SetupWizardProps {
  onStartTrading: (config: TradingConfig, aiAnalysis?: AiStockAnalysis) => void;
  fontSizeClass: string;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onStartTrading, fontSizeClass }) => {
  // Wizard States
  const [selectedStock, setSelectedStock] = useState<Stock>(POPULAR_STOCKS[0]); // Default 삼성전자
  const [customStockName, setCustomStockName] = useState<string>('');
  const [investmentAmount, setInvestmentAmount] = useState<number>(1000000); // Default 1,000,000 KRW
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('SAFE');
  const [customTargetProfit, setCustomTargetProfit] = useState<number>(4.0);
  const [customStopLoss, setCustomStopLoss] = useState<number>(2.5);

  // Gemini AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<AiStockAnalysis | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredStocks = POPULAR_STOCKS.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle Gemini AI Stock Analysis Fetch
  const handleFetchAiAnalysis = async (stock: Stock, amount: number, risk: RiskLevel) => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      const res = await fetch('/api/analyze-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockName: stock.name,
          investmentAmount: amount,
          riskLevel: risk,
        }),
      });
      const data: AiStockAnalysis = await res.json();
      setAiAnalysis(data);
      if (data.recommendedTargetProfit) setCustomTargetProfit(data.recommendedTargetProfit);
      if (data.recommendedStopLoss) setCustomStopLoss(data.recommendedStopLoss);
    } catch (err) {
      console.error('Failed to analyze stock:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Run AI Analysis when stock changes
  useEffect(() => {
    handleFetchAiAnalysis(selectedStock, investmentAmount, riskLevel);
  }, [selectedStock.symbol, riskLevel]);

  const handleStart = () => {
    const config: TradingConfig = {
      stock: selectedStock,
      investmentAmount: investmentAmount,
      riskLevel: riskLevel,
      targetProfitPercent: customTargetProfit,
      stopLossPercent: customStopLoss,
      autoTradingEnabled: true,
      maxTradesPerDay: 5,
    };

    onStartTrading(config, aiAnalysis || undefined);
  };

  return (
    <div className={`max-w-5xl mx-auto px-4 py-6 ${fontSizeClass}`}>
      {/* Father Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white border border-slate-700 shadow-xl mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-sm font-semibold border border-emerald-500/30 mb-3">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>아버지를 위한 1분 초간단 AI 세팅</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
              투자하실 <span className="text-emerald-400">종목</span>과{' '}
              <span className="text-teal-300">투자 금액</span>만 선택해 주세요
            </h2>
            <p className="text-slate-300 leading-relaxed max-w-2xl">
              어려운 그래프와 기술 분석은 이제 끝! 최첨단 AI가 실시간으로 수급을 감시하고
              손실은 줄이고 수익은 꼭 챙기는 안전 매매를 실행합니다.
            </p>
          </div>

          <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-2xl p-4 flex items-center space-x-3 text-slate-200 text-sm shadow-inner shrink-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-amber-300">자동 손절 안전장치</div>
              <div className="text-xs text-slate-400">설정한 손실폭 달성 시 즉시 거래 중단</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Wizard Form Container */}
      <div className="space-y-8">
        {/* STEP 1: Stock Selection */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-6">
            <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center text-lg shadow-md shadow-emerald-600/20">
              1
            </span>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                자동매매할 종목을 선택해 주세요
              </h3>
              <p className="text-sm text-slate-500">
                대한민국 국민주부터 글로벌 AI 대표주까지 자유롭게 선택하실 수 있습니다.
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative mb-5">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="종목명 또는 코드 검색 (예: 삼성전자, SK하이닉스, Tesla...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Popular Stock Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {filteredStocks.map((stock) => {
              const isSelected = selectedStock.symbol === stock.symbol;
              return (
                <button
                  key={stock.symbol}
                  onClick={() => setSelectedStock(stock)}
                  className={`p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between relative group ${
                    isSelected
                      ? 'bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 text-emerald-600">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  )}

                  <div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      {stock.category}
                    </span>
                    <h4 className="text-lg font-extrabold text-slate-900 mt-2">{stock.name}</h4>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{stock.symbol}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                    <span className="text-sm font-bold text-slate-800">
                      {stock.currentPrice.toLocaleString()}원
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        stock.changePercent >= 0 ? 'text-red-500' : 'text-blue-500'
                      }`}
                    >
                      {stock.changePercent >= 0 ? '+' : ''}
                      {stock.changePercent}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 2: Investment Amount */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-6">
            <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center text-lg shadow-md shadow-emerald-600/20">
              2
            </span>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                투자하실 금액을 선택해 주세요
              </h3>
              <p className="text-sm text-slate-500">
                원하시는 투자금을 누르시거나 직접 입력하실 수 있습니다.
              </p>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-5">
            {PRESET_AMOUNTS.map((preset) => {
              const isSelected = investmentAmount === preset.value;
              return (
                <button
                  key={preset.value}
                  onClick={() => setInvestmentAmount(preset.value)}
                  className={`py-3 px-4 rounded-2xl font-bold text-center border-2 transition-all ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-600/20 scale-105'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom Amount Input Box */}
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
              <span className="absolute right-3 top-2.5 text-sm font-bold text-slate-500 pointer-events-none">
                원
              </span>
            </div>
          </div>
        </div>

        {/* STEP 3: Risk Level & Strategy Preset */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-6">
            <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center text-lg shadow-md shadow-emerald-600/20">
              3
            </span>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                투자 성향을 선택해 주세요
              </h3>
              <p className="text-sm text-slate-500">
                AI가 설정된 목표 수익과 손절선 범위 내에서만 안전하게 거래합니다.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Safe */}
            <button
              onClick={() => setRiskLevel('SAFE')}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${
                riskLevel === 'SAFE'
                  ? 'bg-emerald-50 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">🛡️</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  추천 (가장 안전)
                </span>
              </div>
              <h4 className="text-lg font-bold text-slate-900">안정 수익형</h4>
              <p className="text-xs text-slate-600 mt-1">
                원금 보존을 최우선으로, 적은 변동성에서 짧고 확실한 수익을 챙깁니다.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-200/60 flex justify-between text-xs font-bold">
                <span className="text-emerald-700">목표 익절: +3.5%</span>
                <span className="text-slate-500">안전 손절: -2.0%</span>
              </div>
            </button>

            {/* Balanced */}
            <button
              onClick={() => setRiskLevel('BALANCED')}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${
                riskLevel === 'BALANCED'
                  ? 'bg-teal-50 border-teal-500 shadow-md ring-2 ring-teal-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">⚖️</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-teal-100 text-teal-800">
                  표준 추세
                </span>
              </div>
              <h4 className="text-lg font-bold text-slate-900">균형 추세형</h4>
              <p className="text-xs text-slate-600 mt-1">
                상승 추세를 타고 안정적인 수익과 손실 방지의 균형을 유지합니다.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-200/60 flex justify-between text-xs font-bold">
                <span className="text-teal-700">목표 익절: +5.0%</span>
                <span className="text-slate-500">안전 손절: -3.0%</span>
              </div>
            </button>

            {/* Aggressive */}
            <button
              onClick={() => setRiskLevel('AGGRESSIVE')}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${
                riskLevel === 'AGGRESSIVE'
                  ? 'bg-amber-50 border-amber-500 shadow-md ring-2 ring-amber-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">🚀</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                  적극 트레이딩
                </span>
              </div>
              <h4 className="text-lg font-bold text-slate-900">적극 성장형</h4>
              <p className="text-xs text-slate-600 mt-1">
                주가 움직임이 클 때 적극적으로 이익 창출을 도모합니다.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-200/60 flex justify-between text-xs font-bold">
                <span className="text-amber-700">목표 익절: +7.5%</span>
                <span className="text-slate-500">안전 손절: -4.5%</span>
              </div>
            </button>
          </div>
        </div>

        {/* Gemini AI Strategy Blueprint Card */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl relative">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Bot className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>Gemini AI 종목 분석 진단</span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    실시간 AI
                  </span>
                </h4>
                <p className="text-xs text-slate-400">
                  선택하신 <strong className="text-emerald-300">{selectedStock.name}</strong>에
                  대한 AI 매매 진단 리포트입니다.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleFetchAiAnalysis(selectedStock, investmentAmount, riskLevel)}
              disabled={isAnalyzing}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-xl text-slate-300 border border-slate-700 transition-colors flex items-center space-x-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isAnalyzing ? '분석 중...' : '다시 분석하기'}</span>
            </button>
          </div>

          {isAnalyzing ? (
            <div className="py-12 text-center space-y-3">
              <div className="inline-block w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-300">
                AI가 {selectedStock.name}의 실시간 수급과 차트 패턴을 정밀 분석 중입니다...
              </p>
            </div>
          ) : aiAnalysis ? (
            <div className="space-y-4">
              {/* Father Advice Bubble */}
              <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-2xl p-4 flex items-start space-x-3">
                <div className="text-2xl mt-0.5">💬</div>
                <div>
                  <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
                    아버지께 올리는 AI 조언
                  </h5>
                  <p className="text-sm sm:text-base text-emerald-100 font-medium leading-relaxed">
                    "{aiAnalysis.fatherFriendlyAdvice}"
                  </p>
                </div>
              </div>

              {/* Grid Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5">
                  <span className="text-xs text-slate-400 font-medium">추정 시장 동향</span>
                  <div className="text-base font-bold text-white mt-1">
                    {aiAnalysis.marketTrend}
                  </div>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5">
                  <span className="text-xs text-slate-400 font-medium">AI 감시 매수 신호</span>
                  <div className="text-xs font-bold text-emerald-300 mt-1 truncate">
                    {aiAnalysis.keyBuySignals?.[0] || '이동평균선 우상향 골든크로스'}
                  </div>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5">
                  <span className="text-xs text-slate-400 font-medium">주의 위험요소</span>
                  <div className="text-xs font-bold text-amber-300 mt-1 truncate">
                    {aiAnalysis.riskFactor}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              종목을 선택하시면 AI가 맞춤형 매매 전략을 분석해 드립니다.
            </p>
          )}
        </div>

        {/* FINAL BIG START BUTTON */}
        <div className="pt-2">
          <button
            onClick={handleStart}
            className="w-full py-5 px-8 rounded-3xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xl sm:text-2xl shadow-xl shadow-emerald-500/25 transition-all transform hover:-translate-y-1 active:translate-y-0 flex items-center justify-center space-x-3"
          >
            <Play className="w-7 h-7 fill-slate-950" />
            <span>
              {selectedStock.name} {investmentAmount.toLocaleString()}원 AI 자동매매 시작하기
            </span>
            <ArrowRight className="w-6 h-6" />
          </button>
          <p className="text-center text-xs text-slate-500 mt-3">
            * 언제든지 일시정지 및 전량 매도 후 원금 회수가 가능합니다.
          </p>
        </div>
      </div>
    </div>
  );
};
