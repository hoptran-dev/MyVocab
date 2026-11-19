import type { AppSettings } from '../types/vocab';

export function speakWord(
  text: string,
  settings?: Partial<AppSettings>,
  rateOverride?: number
): void {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const volumePct = settings?.audioVolume ?? 70;
  if (volumePct <= 0) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = settings?.voiceLang || 'en-US';
  utterance.rate = rateOverride ?? settings?.voiceRate ?? 1;
  utterance.volume = Math.max(0, Math.min(1, volumePct / 100));

  const voices = window.speechSynthesis.getVoices();
  const matched =
    voices.find((v) => v.lang === utterance.lang) ||
    voices.find((v) => v.lang.startsWith('en'));
  if (matched) utterance.voice = matched;
  window.speechSynthesis.speak(utterance);
}

export function sanitizeSvgToDataUrl(svgStr: string): string {
  if (!svgStr || !svgStr.includes('<svg')) return '';
  const clean = svgStr
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript:/gi, '');
  const match = clean.match(/<svg[\s\S]*<\/svg>/i);
  if (!match) return '';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(match[0]);
}

export function compressImageToDataUrl(fileOrBlob: Blob, maxDim = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context unavailable'));
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = reject;
      img.src = String(e.target?.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(fileOrBlob);
  });
}
