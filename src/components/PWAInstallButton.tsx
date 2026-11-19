import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, Laptop, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, isMacSafari, isInIframe, install } =
    usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    if (!showGuideModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowGuideModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showGuideModal]);

  // Suppress button when already running in standalone desktop/mobile app mode
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  const modalContent =
    showGuideModal && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Hướng dẫn cài đặt MyVocab trên máy tính"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowGuideModal(false);
              }
            }}
          >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    {isIOS ? <Share className="w-5 h-5" /> : <Laptop className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      {isIOS ? 'Cài MyVocab trên iPhone / iPad' : 'Cài đặt MyVocab trên máy tính'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Mở như ứng dụng độc lập, lưu dữ liệu cục bộ & học offline
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  aria-label="Đóng hướng dẫn cài đặt"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isIOS ? (
                <ol className="space-y-2.5 text-sm text-slate-700 list-decimal list-inside">
                  <li>
                    Nhấn nút <strong>Chia sẻ (Share)</strong> trên thanh công cụ trình duyệt Safari.
                  </li>
                  <li>
                    Cuộn xuống và chọn <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong>.
                  </li>
                  <li>
                    Nhấn <strong>Thêm</strong> để hoàn tất.
                  </li>
                </ol>
              ) : isMacSafari ? (
                <ol className="space-y-2.5 text-sm text-slate-700 list-decimal list-inside">
                  <li>
                    Mở ứng dụng trực tiếp trên trình duyệt <strong>Safari</strong> (macOS Sonoma trở lên).
                  </li>
                  <li>
                    Trên thanh menu trên cùng, chọn <strong>Tệp (File)</strong> →{' '}
                    <strong>Thêm vào Dock (Add to Dock)</strong>.
                  </li>
                  <li>
                    Nhấn <strong>Thêm</strong> — biểu tượng MyVocab sẽ xuất hiện ngay trên Dock.
                  </li>
                </ol>
              ) : (
                <div className="space-y-3 text-sm text-slate-700">
                  {isInIframe && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
                      <strong>Lưu ý:</strong> Bạn đang xem ứng dụng trong khung xem trước. Hãy nhấn
                      nút <strong>Mở trong tab mới</strong> ở thanh trên cùng của trình duyệt để trình
                      duyệt cho phép cài đặt trực tiếp.
                    </div>
                  )}

                  <ol className="space-y-2.5 list-decimal list-inside leading-relaxed">
                    <li>
                      Mở trang này bằng <strong>Google Chrome</strong> hoặc{' '}
                      <strong>Microsoft Edge</strong> trên Windows / macOS / Linux.
                    </li>
                    <li>
                      Nhấn biểu tượng <strong>Cài đặt ứng dụng</strong> (hình màn hình có mũi tên tải
                      xuống) ở góc phải thanh địa chỉ — hoặc bấm nút <strong>Cài đặt trên máy tính</strong>{' '}
                      khi đã mở ở tab riêng.
                    </li>
                    <li>
                      Hoặc mở menu trình duyệt (<strong>⋮</strong>) →{' '}
                      <strong>Truyền, lưu và chia sẻ</strong> → <strong>Cài đặt MyVocab</strong>.
                    </li>
                  </ol>
                </div>
              )}

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-start gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Sau khi cài, MyVocab chạy ở cửa sổ riêng không có thanh địa chỉ trình duyệt và hỗ trợ
                  học từ vựng, chơi game, tra từ điển ngay cả khi mất mạng.
                </span>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer"
                >
                  Đã hiểu
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        data-testid="pwa-install-btn"
        onClick={handleClick}
        className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 hover:border-blue-600 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{isIOS ? 'Cài lên màn hình chính' : 'Cài đặt trên máy tính'}</span>
      </button>

      {modalContent}
    </>
  );
}
