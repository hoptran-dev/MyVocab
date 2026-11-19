import { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import type { AppSettings, Deck, VocabCard } from '../types/vocab';
import { formatNextReviewCountdown, isCardDue } from '../utils/srs';
import { speakWord } from '../utils/speech';
import { LevelRing } from './LevelRing';
import { Level6ConfigModal } from './Level6ConfigModal';

interface VocabManagerViewProps {
  decks: Deck[];
  cards: VocabCard[];
  settings: AppSettings;
  onOpenAddWord: (deckId?: string) => void;
  onOpenEditWord: (card: VocabCard) => void;
  onOpenBulkImport: () => void;
  onDeleteWords: (ids: string[]) => void;
  onConfigureLevel6: (
    cardId: string,
    options: { noReview: boolean; reviewDays?: number }
  ) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
}

export function VocabManagerView({
  decks,
  cards,
  settings,
  onOpenAddWord,
  onOpenEditWord,
  onOpenBulkImport,
  onDeleteWords,
  onConfigureLevel6,
  onExportBackup,
  onImportBackup,
}: VocabManagerViewProps) {
  const [search, setSearch] = useState('');
  const [deckFilter, setDeckFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'new' | 'due' | 'learning' | 'level6' | 'archived'
  >('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [level6EditCard, setLevel6EditCard] = useState<VocabCard | null>(null);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return cards.filter((c) => {
      if (deckFilter !== 'all' && c.deckId !== deckFilter) return false;
      const lvl = c.srs.level;
      if (statusFilter === 'new' && lvl !== 0) return false;
      if (statusFilter === 'due' && !isCardDue(c, now)) return false;
      if (statusFilter === 'learning' && (lvl < 1 || lvl > 5)) return false;
      if (statusFilter === 'level6' && lvl !== 6) return false;
      if (statusFilter === 'archived' && !(lvl === 6 && c.srs.noReview)) return false;
      if (
        q &&
        !c.word.toLowerCase().includes(q) &&
        !c.meaning.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [cards, search, deckFilter, statusFilter]);

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    filteredCards.length > 0 && filteredCards.every((c) => selectedIds.has(c.id));

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCards.map((c) => c.id)));
    }
  };

  const confirmDelete = () => {
    if (!confirmDeleteIds || !confirmDeleteIds.length) return;
    onDeleteWords(confirmDeleteIds);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      confirmDeleteIds.forEach((id) => next.delete(id));
      return next;
    });
    setConfirmDeleteIds(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Kho từ vựng cá nhân
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý từ vựng, theo dõi cấp độ nhớ 1–6, tùy chỉnh lịch ôn Cấp độ 6 và sao lưu dữ liệu
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onExportBackup}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 text-slate-700 text-xs font-bold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Sao lưu
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 text-slate-700 text-xs font-bold cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Khôi phục
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportBackup(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={onOpenBulkImport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 text-slate-700 text-xs font-bold cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Nhập nhiều từ
          </button>
          <button
            type="button"
            onClick={() => onOpenAddWord(deckFilter !== 'all' ? deckFilter : undefined)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Thêm từ mới
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Tìm kiếm từ vựng trong kho"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm từ tiếng Anh hoặc nghĩa tiếng Việt..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:border-blue-600"
          />
        </div>

        <select
          aria-label="Lọc theo bộ thẻ"
          value={deckFilter}
          onChange={(e) => {
            setDeckFilter(e.target.value);
            setSelectedIds(new Set());
          }}
          className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800"
        >
          <option value="all">Tất cả bộ thẻ ({cards.length})</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({cards.filter((c) => c.deckId === d.id).length})
            </option>
          ))}
        </select>

        <select
          aria-label="Lọc theo cấp độ nhớ"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setSelectedIds(new Set());
          }}
          className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800"
        >
          <option value="all">Mọi cấp độ</option>
          <option value="due">Đến hạn ôn ngay</option>
          <option value="new">Từ mới (Cấp 0)</option>
          <option value="learning">Đang nhớ (Cấp 1–5)</option>
          <option value="level6">Nhớ sâu (Cấp 6)</option>
          <option value="archived">Không ôn lại (Đã lưu trữ)</option>
        </select>
      </div>

      {/* Multi-Select Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 rounded-2xl bg-blue-50 border border-blue-200">
          <span className="text-sm font-bold text-blue-800 tabular-nums">
            Đã chọn {selectedIds.size} từ vựng
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Bỏ chọn
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteIds([...selectedIds])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Xóa các từ đã chọn
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-2xs">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
              <th className="py-3 px-4 w-10 text-center">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả từ đang hiển thị"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </th>
              <th className="py-3 px-3">Ảnh</th>
              <th className="py-3 px-3">Từ vựng</th>
              <th className="py-3 px-3">Nghĩa & Ví dụ</th>
              <th className="py-3 px-3">Cấp độ nhớ (SRS)</th>
              <th className="py-3 px-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCards.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500">
                  Không có từ vựng nào khớp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              filteredCards.map((card) => {
                const deck = decks.find((d) => d.id === card.deckId);
                const checked = selectedIds.has(card.id);
                return (
                  <tr
                    key={card.id}
                    className={`transition-colors ${
                      checked ? 'bg-blue-50/50' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Chọn từ ${card.word}`}
                        checked={checked}
                        onChange={() => toggleOne(card.id)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3">
                      {card.image ? (
                        <img
                          src={card.image}
                          alt={card.word}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-xl bg-amber-50/40 border border-slate-200 object-contain p-1"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-xs text-slate-400">
                          —
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          aria-label={`Phát âm ${card.word}`}
                          onClick={() => speakWord(card.word, settings)}
                          className="p-1 mt-0.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <div>
                          <div className="font-bold text-slate-900">
                            {card.word}{' '}
                            {card.pos && (
                              <span className="text-xs font-normal italic text-slate-500">
                                ({card.pos})
                              </span>
                            )}
                          </div>
                          {card.ipa && (
                            <div className="text-xs font-mono text-slate-500">{card.ipa}</div>
                          )}
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {deck?.name || 'Bộ thẻ'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 max-w-xs">
                      <div className="font-semibold text-slate-800">{card.meaning}</div>
                      {card.example && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          &ldquo;{card.example}&rdquo;
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <LevelRing
                          level={card.srs.level}
                          size={30}
                          noReview={card.srs.noReview}
                        />
                        <div className="text-xs">
                          <div className="font-bold text-slate-800">
                            {card.srs.level === 0
                              ? 'Từ mới'
                              : card.srs.level === 6
                                ? 'Cấp 6 · Nhớ sâu'
                                : `Cấp độ ${card.srs.level}`}
                          </div>
                          <div className="text-slate-500">
                            {formatNextReviewCountdown(card.srs)}
                          </div>
                          {card.srs.level === 6 && (
                            <button
                              type="button"
                              onClick={() => setLevel6EditCard(card)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline mt-0.5 cursor-pointer"
                            >
                              <Settings2 className="w-3 h-3" />
                              Tùy chọn lịch ôn
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        aria-label={`Chỉnh sửa ${card.word}`}
                        onClick={() => onOpenEditWord(card)}
                        className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Xóa ${card.word}`}
                        onClick={() => setConfirmDeleteIds([card.id])}
                        className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Level 6 Modal */}
      {level6EditCard && (
        <Level6ConfigModal
          card={level6EditCard}
          onSave={(id, opts) => {
            onConfigureLevel6(id, opts);
            setLevel6EditCard(null);
          }}
          onClose={() => setLevel6EditCard(null)}
        />
      )}

      {/* In-app Delete Confirmation Modal */}
      {confirmDeleteIds && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận xóa từ vựng"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              Xác nhận xóa {confirmDeleteIds.length} từ vựng?
            </h3>
            <p className="text-sm text-slate-600">
              Hành động này sẽ xóa các từ đã chọn khỏi kho lưu trữ cá nhân của bạn.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteIds(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold cursor-pointer"
              >
                Xóa ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
