import React, { useEffect, useState } from 'react';
import { X, Bell, CheckCircle2, XCircle, Send } from 'lucide-react';
import { NotificationLogEntry } from '../types';

interface SmsPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** 알림 로그 — 실제로 디스코드에 전송된(또는 실패한) 매수/매도·요약 알림 내역. */
export const SmsPreviewModal: React.FC<SmsPreviewModalProps> = ({ isOpen, onClose }) => {
  const [log, setLog] = useState<NotificationLogEntry[]>([]);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<'ok' | 'fail' | null>(null);

  const fetchLog = () => {
    setIsLoading(true);
    fetch('/api/session/state')
      .then((res) => (res.ok ? res.json() : { active: false }))
      .then((data) => {
        setIsActive(!!data.active);
        setLog(data.active ? data.session?.notificationLog ?? [] : []);
      })
      .catch(() => {
        setIsActive(false);
        setLog([]);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      setSendResult(null);
      fetchLog();
    }
  }, [isOpen]);

  const handleSendSummary = async () => {
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/session/notify-summary', { method: 'POST' });
      const body = await res.json();
      setSendResult(res.ok ? 'ok' : 'fail');
      setLog(body.session?.notificationLog ?? []);
    } catch {
      setSendResult('fail');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative max-h-[85vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-2xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">알림 로그</h3>
            <p className="text-xs text-slate-400">매수/매도 체결 시 디스코드로 전송된 알림 내역입니다.</p>
          </div>
        </div>

        <button
          onClick={handleSendSummary}
          disabled={!isActive || isSending}
          className="w-full mb-4 py-3 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white font-bold text-sm rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />
          {isSending ? '전송 중...' : '지금 포트폴리오 요약 보내기'}
        </button>

        {sendResult === 'ok' && (
          <p className="text-xs text-emerald-400 text-center -mt-2 mb-3">디스코드로 요약을 전송했습니다.</p>
        )}
        {sendResult === 'fail' && (
          <p className="text-xs text-red-400 text-center -mt-2 mb-3">전송에 실패했습니다. 웹훅 설정을 확인해주세요.</p>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="inline-block w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !isActive ? (
            <p className="text-sm text-slate-500 text-center py-12">진행 중인 자동매매 세션이 없습니다.</p>
          ) : log.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">아직 전송된 알림이 없습니다.</p>
          ) : (
            log.map((entry) => (
              <div
                key={entry.id}
                className={`p-3.5 rounded-2xl border ${
                  entry.ok ? 'bg-slate-800/60 border-slate-700' : 'bg-red-950/40 border-red-500/30'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="flex items-center gap-1.5">
                    {entry.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <span className={entry.ok ? 'text-slate-200' : 'text-red-300'}>{entry.title}</span>
                  </span>
                  <span className="text-slate-500 font-mono">{new Date(entry.timestamp).toLocaleTimeString('ko-KR')}</span>
                </div>
                <p className="text-xs text-slate-400">{entry.detail}</p>
                {!entry.ok && entry.error && (
                  <p className="text-[11px] text-red-400/80 mt-1 truncate" title={entry.error}>
                    오류: {entry.error}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-base rounded-2xl transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  );
};
