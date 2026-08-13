import React from 'react';
import { X, MessageSquare, Zap, CheckCheck } from 'lucide-react';
import { TradingConfig } from '../types';

interface SmsPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TradingConfig;
}

export const SmsPreviewModal: React.FC<SmsPreviewModalProps> = ({
  isOpen,
  onClose,
  config,
}) => {
  if (!isOpen) return null;

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
          <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">아버지 안심 문자/알림톡</h3>
            <p className="text-xs text-slate-400">
              AI 체결 시 아버지 휴대전화로 전송되는 실제 알림 예시입니다.
            </p>
          </div>
        </div>

        {/* KakaoTalk Style Message Box */}
        <div className="bg-amber-100/90 text-slate-900 rounded-2xl p-4 space-y-3 font-sans shadow-inner">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 border-b border-amber-200 pb-2">
            <span>[AI 주식 자동매매 알림톡]</span>
            <span className="text-amber-800 font-mono">오전 10:15</span>
          </div>

          <div className="space-y-1.5 text-sm">
            <p className="font-extrabold text-slate-900 text-base">
              📢 {config.stock.name} AI 매수 체결 안내
            </p>
            <p className="text-slate-700">
              아버지, AI 비서가 <strong className="text-amber-900">{config.stock.name}</strong> 10주를
              평균가 <strong className="text-amber-900">{config.stock.currentPrice.toLocaleString()}원</strong>에
              안전하게 분할 매수하였습니다.
            </p>
            <div className="bg-amber-200/60 p-2 rounded-xl text-xs text-amber-950 font-medium">
              💡 체결 사유: 이동평균선 상향 돌파 및 외국인 수급 유입 감지
            </div>
          </div>

          <div className="pt-2 border-t border-amber-200 text-xs text-slate-600 flex items-center justify-between font-semibold">
            <span>알림 수신: 아버지 휴대전화</span>
            <span className="flex items-center text-emerald-700">
              <CheckCheck className="w-4 h-4 mr-0.5" /> 연동 완료
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 py-3.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-base rounded-2xl transition-colors shadow-lg"
        >
          확인 완료
        </button>
      </div>
    </div>
  );
};
