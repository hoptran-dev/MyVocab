import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckSquare,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  Deck,
  ExtractedWordCandidate,
} from '../types/vocab';
import { apiUrl, parseApiJson } from '../utils/api';
import { segmentPassageWithWords } from '../utils/srs';
import { compressImageToDataUrl, sanitizeSvgToDataUrl, speakWord } from '../utils/speech';
import { uid } from '../utils/storage';

interface AiExtractorViewProps {
  decks: Deck[];
  settings: AppSettings;
  onSaveExtractedWords: (
    deckId: string,
    newDeckName: string | null,
    items: ExtractedWordCandidate[]
  ) => void;
  onOpenNewDeck: () => void;
  onOpenAddWord: () => void;
  onShowToast: (msg: string) => void;
}

const SAMPLE_PASSAGES = [
  {
    label: 'Bài đọc Công nghệ & Đổi mới',
    text: `As artificial intelligence continues to reshape modern workplaces, companies must foster a resilient culture that embraces lifelong learning. Rather than fearing disruption, forward-thinking teams leverage automation to streamline routine workflows and free up time for creative problem-solving. Still, leaders need to strike a delicate balance between rapid innovation and ethical accountability to maintain public trust.`,
  },
  {
    label: 'Bài đọc Đời sống & Thói quen',
    text: `Building a sustainable study routine rarely happens overnight. Research shows that learners who break down ambitious goals into small, tangible milestones are far more likely to stay consistent. Whenever distractions creep in, taking a brief pause to reflect on your progress can help you regain momentum and carry on with renewed clarity.`,
  },
];

type AiTab = 'passage' | 'topic' | 'scan';

export function AiExtractorView({
  decks,
  settings,
  onSaveExtractedWords,
  onOpenNewDeck,
  onOpenAddWord,
  onShowToast,
}: AiExtractorViewProps) {
  const [activeTab, setActiveTab] = useState<AiTab>('passage');
  const [targetDeckId, setTargetDeckId] = useState<string>(decks[0]?.id || 'new');
  const [newDeckName, setNewDeckName] = useState('');
  const passageInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Tab 1: Passage extraction state
  const [passageText, setPassageText] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'b1b2' | 'c1c2'>('all');
  const [includeSvg, setIncludeSvg] = useState(false);

  // Tab 2: Topic generation state
  const [topicPrompt, setTopicPrompt] = useState('');
  const [topicIncludeSvg, setTopicIncludeSvg] = useState(true);

  // Tab 3: Image scan state
  const [scanPreviewUrl, setScanPreviewUrl] = useState('');
  const [scanBase64, setScanBase64] = useState('');
  const [scanMode, setScanMode] = useState<'text' | 'objects'>('text');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Shared results & selection state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [candidates, setCandidates] = useState<ExtractedWordCandidate[]>([]);
  const [selectionView, setSelectionView] = useState<'all' | 'selected' | 'skipped'>('all');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [sourcePassageSnapshot, setSourcePassageSnapshot] = useState('');

  useEffect(() => {
    if (targetDeckId !== 'new' && !decks.some((d) => d.id === targetDeckId) && decks[0]) {
      setTargetDeckId(decks[0].id);
    }
  }, [decks, targetDeckId]);

  // Support Ctrl+V image paste on Scan tab
  useEffect(() => {
    if (activeTab !== 'scan') return;
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const blob = it.getAsFile();
          if (blob) {
            const dataUrl = await compressImageToDataUrl(blob, 1024);
            setScanPreviewUrl(dataUrl);
            setScanBase64(dataUrl.split(',')[1] || '');
            onShowToast('Đã dán ảnh vào khung quét!');
          }
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [activeTab, onShowToast]);

  const handleExtractPassage = async () => {
    if (passageText.trim().length < 10) {
      setErrorMsg('Vui lòng nhập hoặc dán đoạn văn tiếng Anh (ít nhất 10 ký tự).');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(apiUrl('/api/ai/extract-passage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passage: passageText,
          levelFilter,
          maxWords: 15,
          includeSvg,
        }),
      });
      const data = await parseApiJson<{ items?: Record<string, string>[] }>(
        res,
        'Không thể tách từ vựng.'
      );
      const mapped: ExtractedWordCandidate[] = (data.items || [])
        .map((x: Record<string, string>) => ({
          id: uid('ext'),
          word: String(x.word || '').trim(),
          matchedForm: String(x.matchedForm || x.word || '').trim(),
          pos: String(x.pos || '').trim(),
          ipa: String(x.ipa || '').trim(),
          meaning: String(x.meaning || '').trim(),
          generalMeaning: String(x.generalMeaning || '').trim(),
          contextSentence: String(x.contextSentence || '').trim(),
          cefr: String(x.cefr || 'B1').trim().toUpperCase(),
          image: x.svg ? sanitizeSvgToDataUrl(x.svg) : '',
          selected: true,
        }))
        .filter((item: ExtractedWordCandidate) => item.word && item.meaning);

      setCandidates(mapped);
      setSourcePassageSnapshot(passageText);
      setSelectionView('all');
      onShowToast(`AI đã tách được ${mapped.length} từ vựng theo ngữ cảnh!`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi kết nối AI.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateByTopic = async () => {
    if (!topicPrompt.trim()) {
      setErrorMsg('Vui lòng nhập chủ đề hoặc danh sách từ tiếng Anh.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(apiUrl('/api/ai/generate-words'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicPrompt, includeSvg: topicIncludeSvg }),
      });
      const data = await parseApiJson<{ items?: Record<string, string>[] }>(
        res,
        'Không thể tạo bộ từ.'
      );
      const mapped: ExtractedWordCandidate[] = (data.items || [])
        .map((x: Record<string, string>) => ({
          id: uid('gen'),
          word: String(x.word || '').trim(),
          matchedForm: String(x.word || '').trim(),
          pos: String(x.pos || '').trim(),
          ipa: String(x.ipa || '').trim(),
          meaning: String(x.meaning || '').trim(),
          generalMeaning: '',
          contextSentence: String(x.example || '').trim(),
          cefr: String(x.cefr || 'B1').trim().toUpperCase(),
          image: x.svg ? sanitizeSvgToDataUrl(x.svg) : '',
          selected: true,
        }))
        .filter((item: ExtractedWordCandidate) => item.word && item.meaning);

      setCandidates(mapped);
      setSourcePassageSnapshot('');
      setSelectionView('all');
      onShowToast(`AI đã soạn xong ${mapped.length} từ vựng!`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi kết nối AI.');
    } finally {
      setLoading(false);
    }
  };

  const handleScanImage = async () => {
    if (!scanBase64) {
      setErrorMsg('Vui lòng chọn hoặc dán một hình ảnh trước khi quét.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(apiUrl('/api/ai/scan-image'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: scanBase64,
          mimeType: 'image/jpeg',
          mode: scanMode,
        }),
      });
      const data = await parseApiJson<{ items?: Record<string, string>[] }>(
        res,
        'Không thể quét hình ảnh.'
      );
      const mapped: ExtractedWordCandidate[] = (data.items || [])
        .map((x: Record<string, string>) => ({
          id: uid('scan'),
          word: String(x.word || '').trim(),
          matchedForm: String(x.word || '').trim(),
          pos: String(x.pos || '').trim(),
          ipa: String(x.ipa || '').trim(),
          meaning: String(x.meaning || '').trim(),
          generalMeaning: '',
          contextSentence: String(x.example || '').trim(),
          cefr: String(x.cefr || 'B1').trim().toUpperCase(),
          image: x.svg ? sanitizeSvgToDataUrl(x.svg) : '',
          selected: true,
        }))
        .filter((item: ExtractedWordCandidate) => item.word && item.meaning);

      setCandidates(mapped);
      setSourcePassageSnapshot('');
      setSelectionView('all');
      onShowToast(`Đã quét được ${mapped.length} từ vựng từ hình ảnh!`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi kết nối AI.');
    } finally {
      setLoading(false);
    }
  };

  const handleImageFileChange = async (file?: File | null) => {
    if (!file) return;
    const dataUrl = await compressImageToDataUrl(file, 1024);
    setScanPreviewUrl(dataUrl);
    setScanBase64(dataUrl.split(',')[1] || '');
  };

  const toggleCandidate = (id: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const updateCandidateMeaning = (id: string, meaning: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, meaning } : c))
    );
  };

  const setAllSelection = (selected: boolean) => {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected })));
  };

  const selectOnlyHigherCefr = () => {
    setCandidates((prev) =>
      prev.map((c) => ({
        ...c,
        selected: ['B2', 'C1', 'C2'].includes(c.cefr.toUpperCase()),
      }))
    );
  };

  const selectedCount = useMemo(
    () => candidates.filter((c) => c.selected).length,
    [candidates]
  );

  const visibleCandidates = useMemo(() => {
    if (selectionView === 'selected') return candidates.filter((c) => c.selected);
    if (selectionView === 'skipped') return candidates.filter((c) => !c.selected);
    return candidates;
  }, [candidates, selectionView]);

  const highlightedSegments = useMemo(
    () => segmentPassageWithWords(sourcePassageSnapshot, candidates),
    [sourcePassageSnapshot, candidates]
  );

  const handleSaveSelected = () => {
    const picked = candidates.filter((c) => c.selected);
    if (picked.length === 0) {
      onShowToast('Hãy chọn ít nhất 1 từ vựng để lưu vào kho học!');
      return;
    }
    if (targetDeckId === 'new' && !newDeckName.trim()) {
      setErrorMsg('Vui lòng nhập tên bộ thẻ mới.');
      return;
    }
    onSaveExtractedWords(
      targetDeckId,
      targetDeckId === 'new' ? newDeckName.trim() : null,
      picked
    );
    setCandidates([]);
    setSourcePassageSnapshot('');
    setNewDeckName('');
  };

  return (
    <div className="space-y-5">
      {/* PHẦN 1: Thanh nút thao tác nhanh (+ Bộ thẻ mới, AI tách văn bản, + Thêm từ mới) */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onOpenNewDeck}
          className="px-4 py-2.5 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 text-slate-800 text-sm font-bold shadow-2xs transition-colors cursor-pointer"
        >
          + Bộ thẻ mới
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('passage');
            setErrorMsg('');
            setTimeout(() => passageInputRef.current?.focus(), 0);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-bold shadow-2xs transition-colors cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          AI tách văn bản
        </button>
        <button
          type="button"
          onClick={onOpenAddWord}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Thêm từ mới
        </button>
      </div>

      {/* PHẦN 2: Mode Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-white border border-slate-200 rounded-2xl w-fit flex-wrap">
        {[
          { id: 'passage' as const, label: 'Tách từ từ đoạn văn bản', icon: FileText },
          { id: 'topic' as const, label: 'Tạo bộ từ theo chủ đề', icon: Sparkles },
          { id: 'scan' as const, label: 'Scan hình ảnh', icon: Camera },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setErrorMsg('');
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* INPUT PANEL */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        {activeTab === 'passage' && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label
                htmlFor="ai-passage-input"
                className="text-sm font-bold text-slate-800"
              >
                Dán đoạn văn bản, bài báo hoặc đoạn hội thoại tiếng Anh:
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {SAMPLE_PASSAGES.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => {
                      setPassageText(sample.text);
                      setErrorMsg('');
                    }}
                    className="px-3 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    + {sample.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              ref={passageInputRef}
              id="ai-passage-input"
              rows={6}
              value={passageText}
              onChange={(e) => setPassageText(e.target.value)}
              placeholder="Dán đoạn văn tiếng Anh vào đây... AI sẽ phân tích từng câu, trích xuất các từ/cụm từ quan trọng kèm nghĩa tiếng Việt khớp chính xác với ngữ cảnh văn bản."
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800 leading-relaxed focus:outline-none focus:border-blue-600"
            />

            <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
              <div className="flex items-center gap-4 flex-wrap text-sm">
                <div className="flex items-center gap-2">
                  <label htmlFor="ai-level-filter" className="text-xs font-semibold text-slate-600">
                    Độ khó ưu tiên:
                  </label>
                  <select
                    id="ai-level-filter"
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value as 'all' | 'b1b2' | 'c1c2')}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                  >
                    <option value="all">Tất cả từ đáng học</option>
                    <option value="b1b2">Trung cấp (B1 – B2)</option>
                    <option value="c1c2">Học thuật / Nâng cao (B2 – C2)</option>
                  </select>
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSvg}
                    onChange={(e) => setIncludeSvg(e.target.checked)}
                    className="rounded accent-blue-600"
                  />
                  Tự vẽ minh họa SVG
                </label>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleExtractPassage}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {loading ? 'AI đang phân tích ngữ cảnh...' : 'Tách từ vựng theo ngữ cảnh'}
              </button>
            </div>
          </>
        )}

        {activeTab === 'topic' && (
          <>
            <label htmlFor="ai-topic-input" className="block text-sm font-bold text-slate-800">
              Nhập chủ đề (vd: &ldquo;8 từ vựng tiếng Anh về Du lịch&rdquo;) hoặc danh sách từ cần giải nghĩa:
            </label>
            <textarea
              id="ai-topic-input"
              rows={4}
              value={topicPrompt}
              onChange={(e) => setTopicPrompt(e.target.value)}
              placeholder="Ví dụ: 6 từ vựng IELTS chủ đề Môi trường&#10;Hoặc: resilient, deadline, leverage, streamline"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-blue-600"
            />
            <div className="flex items-center justify-between flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={topicIncludeSvg}
                  onChange={(e) => setTopicIncludeSvg(e.target.checked)}
                  className="rounded accent-blue-600"
                />
                AI tự vẽ ảnh minh họa SVG cho từng từ
              </label>
              <button
                type="button"
                disabled={loading}
                onClick={handleGenerateByTopic}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold shadow-sm cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? 'AI đang soạn...' : 'Tạo danh sách từ'}
              </button>
            </div>
          </>
        )}

        {activeTab === 'scan' && (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleImageFileChange(e.dataTransfer.files?.[0]);
              }}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center bg-slate-50/70 cursor-pointer transition-colors"
            >
              {scanPreviewUrl ? (
                <div className="space-y-2">
                  <img
                    src={scanPreviewUrl}
                    alt="Ảnh cần quét"
                    className="max-h-48 mx-auto rounded-xl object-contain"
                  />
                  <div className="text-xs font-semibold text-blue-600">
                    Đã nạp ảnh — bấm &ldquo;Quét ảnh ngay&rdquo; hoặc bấm vào đây để chọn ảnh khác
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 py-4">
                  <Camera className="w-8 h-8 text-blue-500 mx-auto" />
                  <div className="text-sm font-bold text-slate-800">
                    Bấm để chọn ảnh, kéo thả, hoặc nhấn Ctrl+V để dán ảnh chụp trang sách
                  </div>
                  <div className="text-xs text-slate-500">Hỗ trợ JPG, PNG, WebP</div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageFileChange(e.target.files?.[0])}
              />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <select
                aria-label="Chế độ quét ảnh"
                value={scanMode}
                onChange={(e) => setScanMode(e.target.value as 'text' | 'objects')}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
              >
                <option value="text">Quét chữ / từ vựng trên trang sách, tài liệu</option>
                <option value="objects">Nhận diện đồ vật / cảnh vật trong ảnh thành từ vựng</option>
              </select>

              <button
                type="button"
                disabled={loading || !scanBase64}
                onClick={handleScanImage}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold shadow-sm cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {loading ? 'Đang quét ảnh...' : 'Quét ảnh ngay'}
              </button>
            </div>
          </>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm font-semibold text-rose-700">
            {errorMsg}
          </div>
        )}
      </div>

      {/* EXTRACTED CANDIDATES & INTERACTIVE CONTEXT SELECTION */}
      {candidates.length > 0 && (
        <div className="space-y-5">
          {/* Interactive Highlighted Passage (when extracted from a passage) */}
          {sourcePassageSnapshot && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Văn bản gốc (Nhấn vào từ tô sáng để chọn Học / Không học)
                </h3>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-blue-100 border border-blue-400 inline-block" />
                    Chọn học
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300 inline-block" />
                    Bỏ qua
                  </span>
                </div>
              </div>

              <p className="text-[15px] leading-8 text-slate-800 bg-slate-50/70 rounded-xl p-4 border border-slate-200/70">
                {highlightedSegments.map((seg, i) => {
                  if (!seg.candidateId) return <span key={i}>{seg.text}</span>;
                  const cand = candidates.find((c) => c.id === seg.candidateId);
                  const isSel = cand?.selected ?? false;
                  const isFoc = focusedId === seg.candidateId;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        toggleCandidate(seg.candidateId!);
                        setFocusedId(seg.candidateId!);
                      }}
                      title={
                        cand
                          ? `${cand.word}: ${cand.meaning} (${isSel ? 'Đang chọn học' : 'Đã bỏ qua'})`
                          : undefined
                      }
                      className={`inline px-1.5 py-0.5 mx-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                          : 'bg-slate-200/80 text-slate-500 line-through hover:bg-slate-300'
                      } ${isFoc ? 'ring-2 ring-blue-500' : ''}`}
                    >
                      {seg.text}
                    </button>
                  );
                })}
              </p>
            </div>
          )}

          {/* Selection Toolbar & Save Controls */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Danh sách từ vựng tách được ({selectedCount} / {candidates.length} từ được chọn học)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tích chọn các từ bạn muốn đưa vào kho học SRS hoặc bỏ qua các từ bạn đã biết. Bạn có thể sửa nhanh nghĩa tiếng Việt trước khi lưu.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAllSelection(true)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={selectOnlyHigherCefr}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-blue-700 hover:bg-blue-50 cursor-pointer"
                >
                  Chỉ chọn B2–C2
                </button>
                <button
                  type="button"
                  onClick={() => setAllSelection(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Bỏ chọn tất cả
                </button>
              </div>
            </div>

            {/* Filter Tabs (Tất cả / Đang chọn học / Bỏ qua) */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                {[
                  { id: 'all' as const, label: `Tất cả (${candidates.length})` },
                  { id: 'selected' as const, label: `Chọn học (${selectedCount})` },
                  {
                    id: 'skipped' as const,
                    label: `Không học (${candidates.length - selectedCount})`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectionView(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      selectionView === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Target Deck + Save Button */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <select
                  aria-label="Chọn bộ thẻ lưu từ"
                  value={targetDeckId}
                  onChange={(e) => setTargetDeckId(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      Lưu vào: {d.name}
                    </option>
                  ))}
                  <option value="new">+ Tạo bộ thẻ mới...</option>
                </select>

                {targetDeckId === 'new' && (
                  <input
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="Tên bộ thẻ mới..."
                    className="px-3 py-2 rounded-xl border border-blue-300 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600"
                  />
                )}

                <button
                  type="button"
                  disabled={selectedCount === 0}
                  onClick={handleSaveSelected}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-extrabold shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Lưu {selectedCount} từ đã chọn vào kho học
                </button>
              </div>
            </div>

            {/* Candidate Cards List */}
            <div className="space-y-3">
              {visibleCandidates.map((cand) => (
                <div
                  key={cand.id}
                  onMouseEnter={() => setFocusedId(cand.id)}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-start gap-4 ${
                    cand.selected
                      ? 'border-blue-200 bg-blue-50/25'
                      : 'border-slate-200 bg-slate-50/60 opacity-75'
                  } ${focusedId === cand.id ? 'ring-2 ring-blue-300' : ''}`}
                >
                  {/* Toggle Button Học / Không học */}
                  <button
                    type="button"
                    onClick={() => toggleCandidate(cand.id)}
                    aria-pressed={cand.selected}
                    aria-label={cand.selected ? `Bỏ chọn học từ ${cand.word}` : `Chọn học từ ${cand.word}`}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-colors ${
                      cand.selected
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {cand.selected ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5" />
                        Chọn học
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5" />
                        Không học
                      </>
                    )}
                  </button>

                  {cand.image && (
                    <img
                      src={cand.image}
                      alt={cand.word}
                      referrerPolicy="no-referrer"
                      className="w-16 h-14 rounded-xl bg-white border border-slate-200 object-contain p-1 shrink-0"
                    />
                  )}

                  {/* Details */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-extrabold text-slate-900">
                        {cand.word}
                      </span>
                      {cand.pos && (
                        <span className="text-xs italic text-slate-500">({cand.pos})</span>
                      )}
                      {cand.ipa && (
                        <span className="text-xs font-mono text-blue-600">{cand.ipa}</span>
                      )}
                      {cand.cefr && (
                        <span className="text-xs font-bold text-slate-500">· {cand.cefr}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => speakWord(cand.word, settings)}
                        aria-label={`Nghe phát âm ${cand.word}`}
                        className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Editable Contextual Meaning */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-blue-700 shrink-0">
                        Nghĩa trong văn bản:
                      </span>
                      <input
                        type="text"
                        aria-label={`Nghĩa tiếng Việt của ${cand.word}`}
                        value={cand.meaning}
                        onChange={(e) => updateCandidateMeaning(cand.id, e.target.value)}
                        className="flex-1 min-w-[200px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {cand.generalMeaning && (
                      <div className="text-xs text-slate-500">
                        <strong>Nghĩa phổ biến khác:</strong> {cand.generalMeaning}
                      </div>
                    )}

                    {cand.contextSentence && (
                      <div className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200/80">
                        <span className="font-semibold text-slate-500">Câu gốc: </span>
                        &ldquo;{cand.contextSentence}&rdquo;
                      </div>
                    )}
                  </div>

                  {/* Quick remove from list */}
                  <button
                    type="button"
                    aria-label={`Xóa ${cand.word} khỏi danh sách tạm`}
                    onClick={() =>
                      setCandidates((prev) => prev.filter((item) => item.id !== cand.id))
                    }
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer self-start"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {selectedCount > 0 && (
              <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleSaveSelected}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Xác nhận lưu {selectedCount} từ vào kho học
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
