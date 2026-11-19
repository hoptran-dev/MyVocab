import {
  BookOpen,
  Gamepad2,
  Home,
  Library,
  PlusCircle,
  Volume2,
} from 'lucide-react';
import type { AppSettings, ViewId } from '../types/vocab';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarProps {
  activeView: ViewId;
  onSelectView: (view: ViewId) => void;
  dueCount: number;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export function HopVocabLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-9 h-9 block">
      <path d="M68 45 C78 45 79 57 70 59 L64 55 Z" fill="#18B69E" />
      <path d="M32 47 C21 48 20 62 32 63 L37 56 Z" fill="#0B3D5C" />
      <path
        d="M30 26 C30 23.8 31.8 22 34 22 L42 22 C44.2 22 46 23.8 46 26 L46 40 C46 42.5 50 43.5 55 41 L55 46.5 C50 48.5 46 50.5 46 53 L46 74 C46 76.2 44.2 78 42 78 L34 78 C31.8 78 30 76.2 30 74 Z"
        fill="#18B69E"
      />
      <path
        d="M54 26 C54 23.8 55.8 22 58 22 L66 22 C68.2 22 70 23.8 70 26 L70 74 C70 76.2 68.2 78 66 78 L58 78 C55.8 78 54 76.2 54 74 L54 55 C54 52.5 49 52 45 55 L45 49.5 C50 47.5 54 45.5 54 43 Z"
        fill="#0B3D5C"
      />
      <rect
        x="61.5"
        y="51.5"
        width="14.5"
        height="10"
        rx="5"
        transform="rotate(-8 68.5 56.5)"
        fill="#18B69E"
      />
      <rect
        x="24"
        y="52.5"
        width="14.5"
        height="10"
        rx="5"
        transform="rotate(8 31.5 57.5)"
        fill="#0B3D5C"
      />
    </svg>
  );
}

const NAV_ITEMS: Array<{
  id: ViewId;
  label: string;
  icon: typeof Home;
}> = [
  { id: 'dashboard', label: 'Tổng quan', icon: Home },
  { id: 'games', label: 'Ôn tập & Game', icon: Gamepad2 },
  { id: 'ai', label: 'Thêm từ vựng', icon: PlusCircle },
  { id: 'dictionary', label: 'Từ điển', icon: BookOpen },
  { id: 'vocab', label: 'Kho từ vựng', icon: Library },
];

export function Sidebar({
  activeView,
  onSelectView,
  dueCount,
  settings,
  onUpdateSettings,
}: SidebarProps) {
  return (
    <aside className="w-full lg:w-[266px] bg-white border-b lg:border-b-0 lg:border-r border-slate-200/80 flex flex-col shrink-0 lg:sticky lg:top-0 lg:h-screen overflow-x-hidden">
      {/* Brand Header */}
      <div className="flex items-center px-4 py-3.5 lg:px-4 lg:py-4 border-b border-slate-100">
        <button
          type="button"
          onClick={() => onSelectView('dashboard')}
          className="flex items-center gap-2.5 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-blue-600 rounded-xl cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center shrink-0">
            <HopVocabLogo />
          </div>
          <span className="text-[19px] font-extrabold tracking-tight text-blue-600 leading-none truncate">
            MyVocab
          </span>
        </button>
      </div>

      {/* Navigation */}
      <nav
        aria-label="Điều hướng chính"
        className="flex lg:flex-col gap-1 p-2.5 lg:p-3.5 overflow-x-auto lg:overflow-x-visible flex-1"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span>{item.label}</span>
              {item.id === 'games' && dueCount > 0 && (
                <span
                  className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
                    isActive
                      ? 'bg-white/25 text-white'
                      : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {dueCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Install PWA + Voice Settings Footer */}
      <div className="px-3 pb-2.5 lg:p-4 lg:border-t lg:border-slate-100 flex flex-col gap-3 text-xs text-slate-600">
        <PWAInstallButton />

        <div className="hidden lg:flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="sidebar-voice-lang" className="flex items-center gap-1.5 font-semibold text-slate-600">
              <Volume2 className="w-3.5 h-3.5 text-slate-400" />
              Giọng đọc
            </label>
            <select
              id="sidebar-voice-lang"
              value={settings.voiceLang}
              onChange={(e) =>
                onUpdateSettings({ voiceLang: e.target.value as 'en-US' | 'en-GB' })
              }
              className="border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-800 font-semibold text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="en-US">Anh - Mỹ (US)</option>
              <option value="en-GB">Anh - Anh (UK)</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label htmlFor="sidebar-voice-rate" className="font-semibold text-slate-600">
              Tốc độ đọc
            </label>
            <select
              id="sidebar-voice-rate"
              value={String(settings.voiceRate)}
              onChange={(e) => onUpdateSettings({ voiceRate: Number(e.target.value) || 1 })}
              className="border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-800 font-semibold text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="0.75">0.75x Chậm</option>
              <option value="1">1.0x Chuẩn</option>
              <option value="1.2">1.2x Nhanh</option>
            </select>
          </div>
        </div>
      </div>
    </aside>
  );
}
