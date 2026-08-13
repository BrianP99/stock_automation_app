import React, { useState } from 'react';
import { X, ShieldCheck, AlertTriangle, Check, Sliders } from 'lucide-react';
import { TradingConfig } from '../types';

interface SafetySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TradingConfig;
  onUpdateConfig: (updated: Partial<TradingConfig>) => void;
}

export const SafetySettingsModal: React.FC<SafetySettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
}) => {
  const [stopLoss, setStopLoss] = useState<number>(config.stopLossPercent);
  const [targetProfit, setTargetProfit] = useState<number>(config.targetProfitPercent);
  const [maxTrades, setMaxTrades] = useState<number>(config.maxTradesPerDay);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateConfig({
      stopLossPercent: stopLoss,
      targetProfitPercent: targetProfit,
      maxTradesPerDay: maxTrades,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-2xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">안전 매매 가드레일 설정</h3>
            <p className="text-xs text-slate-400">원금 손실 방지를 위한 자동 차단 옵션입니다.</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Target Profit */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-2">
              목표 익절 수익률 (% 달성 시 매도)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[3.0, 5.0, 7.5].map((val) => (
                <button
                  key={val}
                  onClick={() => setTargetProfit(val)}
                  className={`py-2 px-3 rounded-xl font-bold text-sm border ${
                    targetProfit === val
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  +{val}%
                </button>
              ))}
            </div>
          </div>

          {/* Stop Loss */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-2">
              자동 손절 한도 (% 손실 시 차단)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[2.0, 3.0, 5.0].map((val) => (
                <button
                  key={val}
                  onClick={() => setStopLoss(val)}
                  className={`py-2 px-3 rounded-xl font-bold text-sm border ${
                    stopLoss === val
                      ? 'bg-red-500 text-white border-red-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  -{val}%
                </button>
              ))}
            </div>
          </div>

          {/* Max Daily Trades */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-2">
              일일 최대 자동매매 횟수
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[3, 5, 10].map((val) => (
                <button
                  key={val}
                  onClick={() => setMaxTrades(val)}
                  className={`py-2 px-3 rounded-xl font-bold text-sm border ${
                    maxTrades === val
                      ? 'bg-teal-500 text-slate-950 border-teal-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {val}회 제한
                </button>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
          >
            설정 저장하기
          </button>
        </div>
      </div>
    </div>
  );
};
