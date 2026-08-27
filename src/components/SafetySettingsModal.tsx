import React, { useState } from 'react';
import { X, ShieldCheck, Activity } from 'lucide-react';
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
  const [maxTrades, setMaxTrades] = useState<number>(config.maxTradesPerDay);
  const [maxPositions, setMaxPositions] = useState<number>(config.maxConcurrentPositions);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateConfig({
      maxTradesPerDay: maxTrades,
      maxConcurrentPositions: maxPositions,
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
          {/* ATR-based exits — no user-chosen target%/stop% anymore; a flat
              percentage stopped volatile growth names out on ordinary noise
              while leaving calm stocks with a stop too loose. */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 flex items-start gap-3">
            <Activity className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <span className="font-bold text-white">손절/청산은 종목별 변동성(ATR) 기반 자동 설정</span>으로 바뀌었습니다.
              매수 시점 각 종목의 실제 변동폭을 계산해 손절선을 종목마다 다르게 잡고, 수익 구간에서는 고정 목표가
              아니라 고점 대비 하락폭으로 추적 청산합니다.
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

          {/* Max Concurrent Positions */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-2">동시 보유 종목 수</label>
            <div className="grid grid-cols-3 gap-2">
              {[3, 4, 5].map((val) => (
                <button
                  key={val}
                  onClick={() => setMaxPositions(val)}
                  className={`py-2 px-3 rounded-xl font-bold text-sm border ${
                    maxPositions === val ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {val}개
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
