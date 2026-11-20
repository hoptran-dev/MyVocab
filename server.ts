import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trên máy chủ.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractGroundingSources(response: unknown): Array<{ title: string; uri: string }> {
  const res = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
  };
  const chunks = res?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set<string>();
  const sources: Array<{ title: string; uri: string }> = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({
        title: chunk?.web?.title || uri,
        uri,
      });
    }
  }
  return sources;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label = 'Gemini API'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${ms}ms (503)`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('timeout') ||
        msg.includes('high demand') ||
        msg.includes('overloaded');
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 500 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function callWithFallback<T>(
  runner: (modelName: string) => Promise<T>,
  primaryModel = 'gemini-4-hydrogen',
  fallbackModel = 'gemini-3.1-flash-lite',
  primaryTimeoutMs = 9000
): Promise<{ result: T; model: string }> {
  try {
    const result = await withTimeout(runner(primaryModel), primaryTimeoutMs, primaryModel);
    return { result, model: primaryModel };
  } catch (primaryErr) {
    console.warn(`[Gemini] ${primaryModel} slow/unavailable, falling back to ${fallbackModel}:`, primaryErr instanceof Error ? primaryErr.message : primaryErr);
    const result = await withGeminiRetry(
      () => withTimeout(runner(fallbackModel), 25000, fallbackModel),
      1
    );
    return { result, model: fallbackModel };
  }
}

function handleApiError(res: express.Response, err: unknown, fallbackMessage: string) {
  console.error('[Gemini API Error]', err);
  const rawMessage = err instanceof Error ? err.message : fallbackMessage;
  if (rawMessage.includes('503') || rawMessage.includes('UNAVAILABLE') || rawMessage.includes('high demand') || rawMessage.includes('timeout')) {
    return res.status(503).json({
      error: 'Hệ thống Gemini AI đang có lưu lượng truy cập cao tạm thời. Vui lòng thử bấm lại sau vài giây.',
    });
  }
  if (rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('403') || rawMessage.includes('PERMISSION_DENIED')) {
    return res.status(403).json({
      error: 'API key chưa hợp lệ hoặc thiếu quyền. Vui lòng kiểm tra trong mục Settings > Secrets.',
    });
  }
  if (rawMessage.includes('429') || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return res.status(429).json({
      error: 'Đã chạm giới hạn lượt gọi tạm thời. Vui lòng thử lại sau giây lát.',
    });
  }
  res.status(500).json({ error: rawMessage || fallbackMessage });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Allow GitHub Pages or external static frontends to call this API when configured via VITE_API_BASE_URL
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, hasApiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // ==================== OFFLINE ENGLISH-VIETNAMESE DICTIONARY (SQLite) ====================
  const dictDbPath = path.resolve(__dirname, 'data', 'dictionary_en_vi.db');
  type SqliteStatement = {
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
  type SqliteDbLike = {
    prepare: (sql: string) => SqliteStatement;
  };
  let dictDb: SqliteDbLike | null = null;
  if (fs.existsSync(dictDbPath)) {
    try {
      const sqliteMod = await import('node:sqlite');
      dictDb = new sqliteMod.DatabaseSync(dictDbPath, { readOnly: true }) as unknown as SqliteDbLike;
      console.log(`[OfflineDict] Loaded SQLite dictionary from ${dictDbPath}`);
    } catch (err) {
      console.error('[OfflineDict] Failed to open SQLite DB:', err);
    }
  } else {
    console.warn(`[OfflineDict] Database file not found at ${dictDbPath}`);
  }

  const normalizePosInfo = (rawPos: string | null | undefined): { pos: string; posLabel: string } => {
    const p = (rawPos || '').trim();
    switch (p) {
      case 'N':
      case 'noun':
        return { pos: 'n', posLabel: 'Danh từ' };
      case 'V':
      case 'verb':
        return { pos: 'v', posLabel: 'Động từ' };
      case 'A':
      case 'adj':
        return { pos: 'adj', posLabel: 'Tính từ' };
      case 'D':
      case 'adv':
        return { pos: 'adv', posLabel: 'Trạng từ' };
      case 'idiom':
        return { pos: 'idiom', posLabel: 'Thành ngữ' };
      case 'P':
        return { pos: 'prep', posLabel: 'Giới từ' };
      case 'C':
        return { pos: 'conj', posLabel: 'Liên từ' };
      case 'pron':
        return { pos: 'pron', posLabel: 'Đại từ' };
      case 'E':
        return { pos: 'interj', posLabel: 'Thán từ' };
      case 'name':
        return { pos: 'name', posLabel: 'Danh từ riêng' };
      default:
        return { pos: p ? p.toLowerCase() : '', posLabel: p || 'Từ vựng' };
    }
  };

  const normalizeRegion = (raw: string | null | undefined): string => {
    const r = (raw || '').trim().toLowerCase();
    if (!r) return '';
    if (r === 'bre' || r === 'uk' || r.includes('received')) return 'UK';
    if (r === 'name' || r === 'us' || r.includes('american')) return 'US';
    return raw!.trim();
  };

  const stmtStatsWords = dictDb?.prepare('SELECT COUNT(*) as c FROM words');
  const stmtStatsDefs = dictDb?.prepare('SELECT COUNT(*) as c FROM definitions');
  const stmtExactWord = dictDb?.prepare(
    'SELECT id, word FROM words WHERE word = ? LIMIT 1'
  );
  const stmtWordPronunciations = dictDb?.prepare(
    'SELECT ipa, region FROM pronunciations WHERE word_id = ? LIMIT 6'
  );
  const stmtWordDefs = dictDb?.prepare(`
    SELECT d.definition, d.pos, d.sub_pos, wd.example
    FROM word_definitions wd
    JOIN definitions d ON wd.definition_id = d.id
    WHERE wd.word_id = ?
    ORDER BY d.pos, wd.id
    LIMIT 40
  `);
  const stmtSuggestPrefix = dictDb?.prepare(`
    SELECT w.id, w.word,
      (SELECT d.definition FROM word_definitions wd JOIN definitions d ON wd.definition_id = d.id WHERE wd.word_id = w.id LIMIT 1) as preview,
      (SELECT p.ipa FROM pronunciations p WHERE p.word_id = w.id LIMIT 1) as ipa
    FROM words w
    WHERE w.word >= ? AND w.word < ?
    ORDER BY length(w.word) ASC, w.word ASC
    LIMIT ?
  `);
  const stmtReverseVi = dictDb?.prepare(`
    SELECT w.word, d.definition, d.pos,
      (SELECT p.ipa FROM pronunciations p WHERE p.word_id = w.id LIMIT 1) as ipa
    FROM definitions d
    JOIN word_definitions wd ON wd.definition_id = d.id
    JOIN words w ON w.id = wd.word_id
    WHERE d.definition LIKE ?
    ORDER BY length(w.word) ASC
    LIMIT 18
  `);

  let cachedStats: { wordCount: number; definitionCount: number } | null = null;

  app.get('/api/dict/stats', (_req, res) => {
    if (!dictDb || !stmtStatsWords || !stmtStatsDefs) {
      return res.json({ loaded: false, wordCount: 0, definitionCount: 0 });
    }
    if (!cachedStats) {
      const wRow = stmtStatsWords.get() as { c: number };
      const dRow = stmtStatsDefs.get() as { c: number };
      cachedStats = { wordCount: Number(wRow?.c || 0), definitionCount: Number(dRow?.c || 0) };
    }
    res.json({
      loaded: true,
      ...cachedStats,
      source: 'skypediacode/english-vietnamese-dictionary',
    });
  });

  app.get('/api/dict/suggest', (req, res) => {
    if (!dictDb || !stmtSuggestPrefix) {
      return res.json({ suggestions: [] });
    }
    const q = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
    if (!q) return res.json({ suggestions: [] });

    // Range query uses the UNIQUE index on words(word, lang_code) for <1ms prefix lookups
    const upperBound = q.slice(0, -1) + String.fromCharCode(q.charCodeAt(q.length - 1) + 1);
    const rows = stmtSuggestPrefix.all(q, upperBound, limit) as Array<{
      word: string;
      preview: string | null;
      ipa: string | null;
    }>;

    res.json({
      suggestions: rows.map((r) => ({
        word: r.word,
        preview: r.preview || '',
        ipa: r.ipa || '',
      })),
    });
  });

  app.get('/api/dict/lookup', (req, res) => {
    if (!dictDb || !stmtExactWord || !stmtWordPronunciations || !stmtWordDefs || !stmtSuggestPrefix || !stmtReverseVi) {
      return res.status(503).json({ error: 'Cơ sở dữ liệu từ điển offline chưa sẵn sàng.' });
    }

    const rawQ = String(req.query.q || '').trim();
    const q = rawQ.toLowerCase();
    if (!q) {
      return res.status(400).json({ error: 'Vui lòng nhập từ cần tra cứu.' });
    }

    const exactRow = stmtExactWord.get(q) as { id: number; word: string } | undefined;
    let exact = null;

    if (exactRow) {
      const pronRows = stmtWordPronunciations.all(exactRow.id) as Array<{
        ipa: string;
        region: string | null;
      }>;
      const defRows = stmtWordDefs.all(exactRow.id) as Array<{
        definition: string;
        pos: string | null;
        sub_pos: string | null;
        example: string | null;
      }>;

      const seenIpa = new Set<string>();
      const pronunciations = pronRows
        .map((p) => ({ ipa: p.ipa, region: normalizeRegion(p.region) }))
        .filter((p) => {
          const k = `${p.ipa}|${p.region}`;
          if (seenIpa.has(k)) return false;
          seenIpa.add(k);
          return true;
        });

      const definitions = defRows.map((d) => {
        const posInfo = normalizePosInfo(d.pos);
        return {
          definition: d.definition,
          pos: posInfo.pos,
          posLabel: posInfo.posLabel,
          subPos: d.sub_pos || '',
          example: d.example || '',
        };
      });

      exact = {
        word: exactRow.word,
        pronunciations,
        definitions,
      };
    }

    // Related prefix matches
    const upperBound = q.slice(0, -1) + String.fromCharCode(q.charCodeAt(q.length - 1) + 1);
    const prefixRows = stmtSuggestPrefix.all(q, upperBound, 12) as Array<{
      word: string;
      preview: string | null;
      ipa: string | null;
    }>;
    const related = prefixRows
      .filter((r) => r.word !== q)
      .slice(0, 10)
      .map((r) => ({
        word: r.word,
        preview: r.preview || '',
        ipa: r.ipa || '',
      }));

    // Reverse Vietnamese -> English search when no exact English match OR query has Vietnamese diacritics / spaces
    const hasVietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(rawQ);
    let reverseMatches: Array<{ word: string; definition: string; pos: string; posLabel: string; ipa: string }> = [];
    if (!exact || hasVietnameseChars) {
      const revRows = stmtReverseVi.all(`%${rawQ}%`) as Array<{
        word: string;
        definition: string;
        pos: string | null;
        ipa: string | null;
      }>;
      const seenWords = new Set<string>();
      for (const r of revRows) {
        if (seenWords.has(r.word)) continue;
        seenWords.add(r.word);
        const posInfo = normalizePosInfo(r.pos);
        reverseMatches.push({
          word: r.word,
          definition: r.definition,
          pos: posInfo.pos,
          posLabel: posInfo.posLabel,
          ipa: r.ipa || '',
        });
      }
    }

    res.json({
      query: rawQ,
      exact,
      related,
      reverseMatches,
      source: 'sqlite',
    });
  });

  // Compact offline pack export for browser IndexedDB offline caching
  app.get('/api/dict/offline-pack', (req, res) => {
    if (!dictDb) {
      return res.status(503).json({ error: 'Cơ sở dữ liệu từ điển offline chưa sẵn sàng.' });
    }
    const limit = Math.min(8000, Math.max(500, Number(req.query.limit) || 4000));
    const rows = dictDb
      .prepare(`
        SELECT w.word,
          (SELECT p.ipa FROM pronunciations p WHERE p.word_id = w.id LIMIT 1) as ipa,
          d.definition,
          d.pos,
          wd.example
        FROM words w
        JOIN word_definitions wd ON wd.word_id = w.id
        JOIN definitions d ON d.id = wd.definition_id
        WHERE w.word NOT LIKE '% %'
          AND length(w.word) BETWEEN 2 AND 16
          AND EXISTS (SELECT 1 FROM pronunciations p2 WHERE p2.word_id = w.id)
          AND wd.example IS NOT NULL AND wd.example != ''
        GROUP BY w.id
        ORDER BY length(w.word) ASC, w.word ASC
        LIMIT ?
      `)
      .all(limit) as Array<{
      word: string;
      ipa: string | null;
      definition: string;
      pos: string | null;
      example: string | null;
    }>;

    const entries = rows.map((r) => {
      const posInfo = normalizePosInfo(r.pos);
      return {
        word: r.word,
        pronunciations: r.ipa ? [{ ipa: r.ipa, region: '' }] : [],
        definitions: [
          {
            definition: r.definition,
            pos: posInfo.pos,
            posLabel: posInfo.posLabel,
            example: r.example || '',
          },
        ],
      };
    });

    res.json({ count: entries.length, entries });
  });

  // 1. AI Extract vocabulary from English passage with contextual Vietnamese meanings
  app.post('/api/ai/extract-passage', async (req, res) => {
    try {
      const { passage, levelFilter = 'all', maxWords = 15, includeSvg = false } = req.body || {};
      if (!passage || typeof passage !== 'string' || passage.trim().length < 10) {
        return res.status(400).json({ error: 'Vui lòng nhập đoạn văn bản tiếng Anh (ít nhất 10 ký tự).' });
      }

      const ai = getAiClient();
      const levelGuide =
        levelFilter === 'b1b2'
          ? 'Ưu tiên các từ vựng và cụm từ trình độ trung cấp (B1-B2).'
          : levelFilter === 'c1c2'
            ? 'Ưu tiên các từ vựng học thuật, nâng cao và thành ngữ (B2-C2).'
            : 'Chọn các từ vựng, cụm động từ, collocations đáng học nhất trong đoạn văn (tránh các từ quá cơ bản như the, is, and, in).';

      const prompt = `Bạn là chuyên gia ngôn ngữ Anh–Việt. Hãy đọc kỹ đoạn văn tiếng Anh sau đây và trích xuất tối đa ${Math.min(25, Math.max(5, Number(maxWords) || 15))} từ vựng / cụm từ đáng học nhất.
${levelGuide}

QUAN TRỌNG:
- "word": từ gốc hoặc cụm từ xuất hiện trong đoạn văn (dạng nguyên thể/chuẩn để học, ví dụ "carry out", "resilient").
- "matchedForm": chính xác dạng từ xuất hiện trong đoạn văn để tô sáng (ví dụ nếu đoạn văn viết "carried out", matchedForm là "carried out").
- "meaning": nghĩa tiếng Việt CHÍNH XÁC THEO NGỮ CẢNH CỦA ĐOẠN VĂN NÀY (không dịch chung chung sai ngữ cảnh).
- "generalMeaning": nghĩa phổ biến khác hoặc sắc thái mở rộng ngắn gọn (nếu có, hoặc chuỗi rỗng).
- "contextSentence": câu gốc chứa từ đó trong đoạn văn.
- "pos": loại từ ngắn gọn ("n", "v", "adj", "adv", "phrase").
- "ipa": phiên âm IPA chuẩn (vd: "/rɪˈzɪl.i.ənt/").
- "cefr": trình độ ước lượng ("A2", "B1", "B2", "C1", "C2").
${includeSvg ? '- "svg": hình minh họa SVG vector phẳng gọn nhẹ (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180">...</svg>), KHÔNG chứa chữ.' : '- "svg": chuỗi rỗng "".'}

Đoạn văn bản:
"""
${passage.trim().slice(0, 6000)}
"""`;

      const { result: response } = await callWithFallback((modelName) =>
        ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  matchedForm: { type: Type.STRING },
                  pos: { type: Type.STRING },
                  ipa: { type: Type.STRING },
                  meaning: { type: Type.STRING },
                  generalMeaning: { type: Type.STRING },
                  contextSentence: { type: Type.STRING },
                  cefr: { type: Type.STRING },
                  svg: { type: Type.STRING },
                },
                required: ['word', 'matchedForm', 'pos', 'ipa', 'meaning', 'contextSentence', 'cefr'],
              },
            },
          },
        })
      );

      const items = JSON.parse((response.text ?? '[]').trim());
      res.json({ items: Array.isArray(items) ? items : [] });
    } catch (err) {
      handleApiError(res, err, 'Không thể tách từ vựng từ đoạn văn bản.');
    }
  });

  // 2. AI Generate vocabulary list by topic or word list
  app.post('/api/ai/generate-words', async (req, res) => {
    try {
      const { prompt: userPrompt, includeSvg = true } = req.body || {};
      if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
        return res.status(400).json({ error: 'Vui lòng nhập chủ đề hoặc danh sách từ vựng.' });
      }

      const ai = getAiClient();
      const instruction = `You are an English-Vietnamese vocabulary assistant. Based on this request: "${userPrompt.trim().slice(0, 1000)}".
Return a JSON array of vocabulary items (max 12 items). Each item MUST have:
- "word": English word or phrase
- "pos": short part of speech ("n", "v", "adj", "adv", or "phrase")
- "ipa": IPA transcription (e.g. "/ˈæp.əl/")
- "meaning": concise natural Vietnamese meaning
- "example": short practical English example sentence
- "cefr": estimated CEFR level ("A1", "A2", "B1", "B2", "C1", "C2")
${includeSvg ? '- "svg": a cute, clean, flat-vector SVG illustration (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180">...</svg>) visually representing the word with simple rounded colorful shapes and NO text inside.' : '- "svg": empty string "".'}`;

      const { result: response } = await callWithFallback((modelName) =>
        ai.models.generateContent({
          model: modelName,
          contents: instruction,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  pos: { type: Type.STRING },
                  ipa: { type: Type.STRING },
                  meaning: { type: Type.STRING },
                  example: { type: Type.STRING },
                  cefr: { type: Type.STRING },
                  svg: { type: Type.STRING },
                },
                required: ['word', 'pos', 'ipa', 'meaning', 'example'],
              },
            },
          },
        })
      );

      const items = JSON.parse((response.text ?? '[]').trim());
      res.json({ items: Array.isArray(items) ? items : [] });
    } catch (err) {
      handleApiError(res, err, 'Không thể tạo danh sách từ vựng bằng AI.');
    }
  });

  // 3. AI Scan image for vocabulary (text or objects)
  app.post('/api/ai/scan-image', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', mode = 'text' } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'Thiếu dữ liệu hình ảnh để quét.' });
      }

      const ai = getAiClient();
      const prompt =
        mode === 'objects'
          ? `Identify up to 10 concrete English objects/things/actions visible in this photo. Return a JSON array with: "word", "pos" (n/v/adj/adv/phrase), "ipa", "meaning" (concise Vietnamese), "example" (short English sentence), "cefr" (A1-C2), and "svg" (clean cute flat-vector <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180">...</svg> with NO text inside).`
          : `Extract useful English vocabulary words/phrases visible in this image with their contextual Vietnamese meaning. Return a JSON array (max 15 items) with: "word", "pos" (n/v/adj/adv/phrase), "ipa", "meaning" (concise Vietnamese), "example" (short English sentence), "cefr" (A1-C2), and "svg" (clean cute flat-vector <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180">...</svg> with NO text inside).`;

      const { result: response } = await callWithFallback((modelName) =>
        ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  pos: { type: Type.STRING },
                  ipa: { type: Type.STRING },
                  meaning: { type: Type.STRING },
                  example: { type: Type.STRING },
                  cefr: { type: Type.STRING },
                  svg: { type: Type.STRING },
                },
                required: ['word', 'pos', 'ipa', 'meaning', 'example'],
              },
            },
          },
        })
      );

      const items = JSON.parse((response.text ?? '[]').trim());
      res.json({ items: Array.isArray(items) ? items : [] });
    } catch (err) {
      handleApiError(res, err, 'Không thể quét hình ảnh lấy từ vựng.');
    }
  });

  // 4. AI Draw minimalist flat-vector SVG for a word
  app.post('/api/ai/draw-svg', async (req, res) => {
    try {
      const { word, meaning = '' } = req.body || {};
      if (!word || typeof word !== 'string') {
        return res.status(400).json({ error: 'Vui lòng nhập từ tiếng Anh trước khi vẽ minh họa.' });
      }
      const ai = getAiClient();
      const { result: response } = await callWithFallback((modelName) =>
        ai.models.generateContent({
          model: modelName,
          contents: `Create a clean, cute, flat-vector minimalist SVG illustration (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180">...</svg>) representing "${word.trim()}" (${String(meaning).trim()}). Simple colorful rounded vector shapes, NO text inside.`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                svg: { type: Type.STRING },
              },
              required: ['svg'],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ svg: parsed.svg || '' });
    } catch (err) {
      handleApiError(res, err, 'Không thể vẽ hình minh họa SVG.');
    }
  });

  // 5. Google Search Grounding: live usage, idioms, news examples & nuances
  app.post('/api/ai/search-lookup', async (req, res) => {
    try {
      const { query } = req.body || {};
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'Vui lòng nhập từ hoặc cụm từ tiếng Anh cần tra cứu.' });
      }

      const ai = getAiClient();
      const { result: response } = await callWithFallback((modelName) =>
        ai.models.generateContent({
          model: modelName,
          contents: `Tra cứu từ/cụm từ tiếng Anh "${query.trim()}" bằng dữ liệu thực tế mới nhất trên web. Trả lời rõ ràng bằng tiếng Việt kết hợp ví dụ tiếng Anh theo cấu trúc ngắn gọn:
1. **Phiên âm IPA & Loại từ**
2. **Nghĩa tiếng Việt phổ biến & sắc thái hiện đại**
3. **Collocations / Cụm từ hay dùng** (3-4 cụm kèm nghĩa)
4. **Ví dụ thực tế từ báo chí / ngữ cảnh đời sống gần đây** (2-3 câu kèm dịch tiếng Việt)
5. **Mẹo ghi nhớ nhanh**`,
          config: {
            tools: [{ googleSearch: {} }],
          },
        })
      );

      res.json({
        text: response.text || '',
        sources: extractGroundingSources(response),
      });
    } catch (err) {
      handleApiError(res, err, 'Không thể tra cứu thông tin từ Google Search.');
    }
  });

  // 6. Multi-turn Gemini AI Tutor Chatbot (with optional Google Search Grounding)
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const {
        history = [],
        message,
        mode = 'standard',
        useSearch = false,
        vocabContext = '',
      } = req.body || {};

      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Tin nhắn không được để trống.' });
      }

      const ai = getAiClient();
      const model =
        mode === 'fast' && !useSearch ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

      const systemInstruction = `Bạn là HopTutor — gia sư tiếng Anh thân thiện, am hiểu sâu sắc phương pháp lặp lại ngắt quãng (Spaced Repetition) và ngữ nghĩa theo ngữ cảnh trong ứng dụng HopVocab.
Quy tắc trả lời:
- Giải thích rõ ràng, dễ hiểu bằng tiếng Việt, kèm ví dụ tiếng Anh tự nhiên và phiên âm IPA khi nhắc đến từ vựng mới.
- Khi học viên hỏi về nghĩa từ, luôn làm rõ sắc thái (nuance), cách dùng trong ngữ cảnh thật, và phân biệt với các từ dễ nhầm lẫn.
- Có thể tạo mini quiz 2-3 câu hoặc đoạn hội thoại ngắn khi học viên muốn luyện tập.
- Giữ câu trả lời súc tích, trình bày mạch lạc bằng Markdown gọn gàng.
${vocabContext ? `\nNgữ cảnh kho từ vựng hiện tại của học viên (có thể tham khảo khi đặt ví dụ hoặc ôn tập):\n${String(vocabContext).slice(0, 1200)}` : ''}`;

      const safeHistory = Array.isArray(history)
        ? history
            .filter(
              (item): item is { role: 'user' | 'model'; text: string } =>
                item &&
                (item.role === 'user' || item.role === 'model') &&
                typeof item.text === 'string' &&
                item.text.trim().length > 0
            )
            .slice(-16)
            .map((item) => ({
              role: item.role,
              parts: [{ text: item.text }],
            }))
        : [];

      const sendChatRaw = (modelName: string) => {
        const chat = ai.chats.create({
          model: modelName,
          history: safeHistory,
          config: {
            systemInstruction,
            ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
        return chat.sendMessage({
          message: message.trim(),
        });
      };

      let usedModel = model;
      let response;
      if (!useSearch && model === 'gemini-4-hydrogen') {
        const resObj = await callWithFallback(sendChatRaw, 'gemini-4-hydrogen', 'gemini-3.1-flash-lite', 9000);
        response = resObj.result;
        usedModel = resObj.model;
      } else {
        response = await withGeminiRetry(() => withTimeout(sendChatRaw(model), 25000, model), 1);
      }

      res.json({
        reply: response.text || '',
        model: usedModel,
        sources: useSearch ? extractGroundingSources(response) : [],
      });
    } catch (err) {
      handleApiError(res, err, 'Gia sư AI tạm thời không phản hồi được.');
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HopVocab server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
