import { useState } from 'react';
import { Award, CalendarClock, CheckCircle2, EyeOff, X } from 'lucide-react';
import type { VocabCard } from '../types/vocab';
import { LevelRing } from './LevelRing';

interface Level6ConfigModalProps {
  card: VocabCard;
  isGraduation?: boolean;
  onSave: (cardId: string, options: { noReview: boolean; reviewDays?: number }) => void;
  onClose: () => void;
}

const PRESET_DAYS = [8, 14, 30, 60];

export function Level6ConfigModal({
  card,
  isGraduation = false,
  onSave,
  onClose,
}: Level6ConfigModalProps) {
  const [mode, setMode] = useState<'schedule' | 'no_review'>(
    card.srs.noReview ? 'no_review' : 'schedule'
  );
  const [days, setDays] = useState<number>(card.srs.level6ReviewDays || 8);

  const handleConfirm = () => {
    if (mode === 'no_review') {
      onSave(card.id, { noReview: true });
    } else {
      const clamped = Math.max(1, Math.min(365, Math.round(Number(days) || 8)));
      onSave(card.id, { noReview: false, reviewDays: clamped });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="level6-modal-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Award className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h3 id="level6-modal-title" className="text-lg font-extrabold leading-snug">
                {isGraduation
                  ? 'Chúc mừng! Đạt Cấp độ 6 — Nhớ sâu'
                  : 'Tùy chỉnh lịch ôn Cấp độ 6 — Nhớ sâu'}
              </h3>
              <p className="text-xs text-blue-100 mt-0.5">
                Chọn chu kỳ nhắc lại tiếp theo hoặc ngừng ôn vĩnh viễn cho từ này.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại Cấp độ 6"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Word summary */}
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <LevelRing level={6} size={40} noReview={mode === 'no_review'} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-lg font-extrabold text-slate-900">{card.word}</span>
                {card.ipa && <span className="text-xs font-mono text-blue-600">{card.ipa}</span>}
              </div>
              <div className="text-sm text-slate-600 truncate">{card.meaning}</div>
            </div>
          </div>

          {/* Choice 1: Custom review schedule */}
          <div className="space-y-3">
            <div
              className={`w-full rounded-xl border-2 transition-all ${
                mode === 'schedule'
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <button
                type="button"
                aria-pressed={mode === 'schedule'}
                onClick={() => setMode('schedule')}
                className="w-full text-left p-4 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 rounded-xl"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <CalendarClock
                      className={`w-5 h-5 ${mode === 'schedule' ? 'text-blue-600' : 'text-slate-400'}`}
                    />
                    <span className="font-bold text-slate-900">Tiếp tục ôn lại định kỳ</span>
                  </div>
                  {mode === 'schedule' && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                </div>
                <p className="text-xs text-slate-500 mt-1 ml-7.5">
                  Hệ thống sẽ nhắc lại từ này sau số ngày bạn chọn (mặc định 8 ngày).
                </p>
              </button>

              {mode === 'schedule' && (
                <div className="px-4 pb-4 ml-7.5 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {PRESET_DAYS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDays(preset)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer tabular-nums ${
                          days === preset
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        Sau {preset} ngày{preset === 8 ? ' (Mặc định)' : ''}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2.5 pt-1">
                    <label
                      htmlFor="level6-custom-days"
                      className="text-xs font-semibold text-slate-700 whitespace-nowrap"
                    >
                      Hoặc tùy chỉnh:
                    </label>
                    <input
                      id="level6-custom-days"
                      type="number"
                      min={1}
                      max={365}
                      value={days}
                      onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                      className="w-24 px-3 py-1.5 text-sm font-bold tabular-nums text-center border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-600"
                    />
                    <span className="text-xs font-semibold text-slate-500">ngày</span>
                  </div>
                </div>
              )}
            </div>

            {/* Choice 2: Do not review again */}
            <button
              type="button"
              onClick={() => setMode('no_review')}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                mode === 'no_review'
                  ? 'border-emerald-600 bg-emerald-50/50'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <EyeOff
                    className={`w-5 h-5 ${mode === 'no_review' ? 'text-emerald-600' : 'text-slate-400'}`}
                  />
                  <span className="font-bold text-slate-900">Không ôn lại (Đã thuộc vĩnh viễn)</span>
                </div>
                {mode === 'no_review' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              </div>
              <p className="text-xs text-slate-500 mt-1 ml-7.5">
                Ẩn từ khỏi lịch nhắc SRS tự động. Bạn vẫn có thể bật lại bất kỳ lúc nào trong Kho từ vựng.
              </p>
            </button>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Để sau (8 ngày)
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors cursor-pointer"
            >
              Lưu lựa chọn
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
