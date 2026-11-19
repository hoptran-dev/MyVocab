import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Trash2, Upload, Volume2, X } from 'lucide-react';
import type { AppSettings, Deck, VocabCard } from '../types/vocab';
import { apiUrl, parseApiJson } from '../utils/api';
import { parseBulkLines } from '../utils/srs';
import { compressImageToDataUrl, sanitizeSvgToDataUrl, speakWord } from '../utils/speech';

/* ==================== ADD / EDIT WORD MODAL ==================== */
interface WordModalProps {
  decks: Deck[];
  settings: AppSettings;
  editingCard: VocabCard | null;
  presetDeckId?: string;
  onSave: (payload: {
    id?: string;
    deckId: string;
    word: string;
    pos: string;
    ipa: string;
    meaning: string;
    example: string;
    image: string;
  }) => void;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export function WordModal({
  decks,
  settings,
  editingCard,
  presetDeckId,
  onSave,
  onClose,
  onShowToast,
}: WordModalProps) {
  const [deckId, setDeckId] = useState(
    editingCard?.deckId || presetDeckId || decks[0]?.id || ''
  );
  const [word, setWord] = useState(editingCard?.word || '');
  const [pos, setPos] = useState(editingCard?.pos || '');
  const [ipa, setIpa] = useState(editingCard?.ipa || '');
  const [meaning, setMeaning] = useState(editingCard?.meaning || '');
  const [example, setExample] = useState(editingCard?.example || '');
  const [image, setImage] = useState(editingCard?.image || '');
  const [drawingSvg, setDrawingSvg] = useState(false);
  const [error, setError] = useState('');

  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const blob = it.getAsFile();
          if (blob) {
            const url = await compressImageToDataUrl(blob, 340);
            setImage(url);
            onShowToast('Đã dán ảnh minh họa vào thẻ!');
          }
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onShowToast]);

  const handleAiDrawSvg = async () => {
    if (!word.trim()) {
      setError('Vui lòng nhập Từ tiếng Anh trước để AI vẽ minh họa.');
      return;
    }
    setDrawingSvg(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/ai/draw-svg'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word.trim(), meaning: meaning.trim() }),
      });
      const data = await parseApiJson<{ svg?: string }>(res, 'Không thể vẽ minh họa.');
      const url = sanitizeSvgToDataUrl(data.svg || '');
      if (!url) throw new Error('SVG trả về không hợp lệ.');
      setImage(url);
      onShowToast('AI đã vẽ xong hình minh họa!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi AI vẽ minh họa.');
    } finally {
      setDrawingSvg(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !meaning.trim()) {
      setError('Vui lòng nhập đầy đủ Từ tiếng Anh và Nghĩa tiếng Việt.');
      return;
    }
    onSave({
      id: editingCard?.id,
      deckId: deckId || decks[0]?.id || '',
      word: word.trim(),
      pos,
      ipa: ipa.trim(),
      meaning: meaning.trim(),
      example: example.trim(),
      image,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editingCard ? 'Chỉnh sửa từ vựng' : 'Thêm từ vựng mới'}
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-slate-900">
            {editingCard ? 'Chỉnh sửa từ vựng' : 'Thêm từ vựng mới'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="modal-word-deck" className="block text-xs font-bold text-slate-600 mb-1">
              Thuộc bộ thẻ
            </label>
            <select
              id="modal-word-deck"
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="modal-word-en" className="block text-xs font-bold text-slate-600 mb-1">
                Từ tiếng Anh *
              </label>
              <div className="flex gap-1.5">
                <input
                  id="modal-word-en"
                  type="text"
                  required
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="vd: resilient"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => speakWord(word, settings)}
                  aria-label="Nghe thử từ tiếng Anh"
                  className="px-3 rounded-xl border border-slate-200 text-blue-600 hover:bg-blue-50 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="modal-word-pos" className="block text-xs font-bold text-slate-600 mb-1">
                Loại từ
              </label>
              <select
                id="modal-word-pos"
                value={pos}
                onChange={(e) => setPos(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              >
                <option value="">-- Chọn --</option>
                <option value="n">Danh từ (n)</option>
                <option value="v">Động từ (v)</option>
                <option value="adj">Tính từ (adj)</option>
                <option value="adv">Trạng từ (adv)</option>
                <option value="phrase">Cụm từ / Thành ngữ</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="modal-word-ipa" className="block text-xs font-bold text-slate-600 mb-1">
                Phiên âm IPA
              </label>
              <input
                id="modal-word-ipa"
                type="text"
                value={ipa}
                onChange={(e) => setIpa(e.target.value)}
                placeholder="vd: /rɪˈzɪl.i.ənt/"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="modal-word-vi" className="block text-xs font-bold text-slate-600 mb-1">
                Nghĩa tiếng Việt *
              </label>
              <input
                id="modal-word-vi"
                type="text"
                required
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                placeholder="vd: kiên cường, bền bỉ"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="modal-word-ex" className="block text-xs font-bold text-slate-600 mb-1">
              Câu ví dụ
            </label>
            <input
              id="modal-word-ex"
              type="text"
              value={example}
              onChange={(e) => setExample(e.target.value)}
              placeholder="vd: She remained resilient despite challenges."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Image Illustration Picker */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-700">
              Hình minh họa kích thích ghi nhớ (hỗ trợ Ctrl+V dán ảnh)
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-28 h-24 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden p-1.5 shrink-0">
                {image ? (
                  <img
                    src={image}
                    alt="Xem trước minh họa"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400">Chưa có ảnh</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={drawingSvg}
                  onClick={handleAiDrawSvg}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
                >
                  {drawingSvg ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  AI vẽ minh họa
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Tải ảnh lên
                </button>
                {image && (
                  <button
                    type="button"
                    onClick={() => setImage('')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Xóa
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const url = await compressImageToDataUrl(f, 340);
                      setImage(url);
                    }
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer"
            >
              Lưu từ vựng
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ==================== NEW DECK MODAL ==================== */
export function NewDeckModal({
  onSave,
  onClose,
}: {
  onSave: (name: string, desc: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tạo bộ thẻ mới"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-900">Tạo bộ thẻ mới</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSave(name.trim(), desc.trim());
          }}
          className="space-y-3.5"
        >
          <div>
            <label htmlFor="new-deck-name" className="block text-xs font-bold text-slate-600 mb-1">
              Tên bộ thẻ *
            </label>
            <input
              id="new-deck-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vd: Từ vựng IELTS Reading"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label htmlFor="new-deck-desc" className="block text-xs font-bold text-slate-600 mb-1">
              Mô tả ngắn
            </label>
            <input
              id="new-deck-desc"
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="vd: Các từ vựng trích từ bài báo kinh tế"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer"
            >
              Tạo bộ thẻ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ==================== BULK IMPORT MODAL ==================== */
export function BulkImportModal({
  decks,
  onImport,
  onClose,
}: {
  decks: Deck[];
  onImport: (
    deckId: string,
    items: Array<{ word: string; meaning: string; ipa: string; example: string }>
  ) => void;
  onClose: () => void;
}) {
  const [deckId, setDeckId] = useState(decks[0]?.id || '');
  const [rawText, setRawText] = useState('');
  const parsed = parseBulkLines(rawText);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nhập hàng loạt từ vựng"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-900">Nhập hàng loạt từ vựng</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label htmlFor="bulk-deck-select" className="block text-xs font-bold text-slate-600 mb-1">
            Chọn bộ thẻ đích
          </label>
          <select
            id="bulk-deck-select"
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bulk-textarea" className="block text-xs font-bold text-slate-600 mb-1">
            Mỗi dòng 1 từ theo dạng: <code>từ | nghĩa | phiên âm | ví dụ</code> (hoặc dán từ Excel)
          </label>
          <textarea
            id="bulk-textarea"
            rows={6}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="apple | quả táo | /ˈæp.əl/ | I eat an apple every day."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-blue-600"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs font-bold text-blue-600 tabular-nums">
            {parsed.length > 0 ? `Nhận diện ${parsed.length} từ hợp lệ` : 'Chưa có dòng hợp lệ'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={parsed.length === 0}
              onClick={() => onImport(deckId || decks[0]?.id || '', parsed)}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold cursor-pointer"
            >
              Nhập {parsed.length} từ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
