import type { MemoryLevel } from '../types/vocab';
import { SRS_LEVEL_SPECS } from '../utils/srs';

interface LevelRingProps {
  level: MemoryLevel;
  size?: number;
  noReview?: boolean;
}

/**
 * Circular 6-segment progress ring matching the Spaced Repetition reference chart:
 * 1: Orange (1/6), 2: Yellow (2/6), 3: Lime (3/6), 4: Green (4/6), 5: Cyan (5/6), 6: Royal Blue (6/6)
 */
export function LevelRing({ level, size = 32, noReview = false }: LevelRingProps) {
  const strokeWidth = Math.max(3, Math.round(size * 0.115));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (level === 0) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-500 font-bold tabular-nums shrink-0"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
        title="Từ mới (Cấp độ 0)"
      >
        0
      </span>
    );
  }

  const spec = SRS_LEVEL_SPECS[level - 1];
  const fraction = level / 6;
  const dashOffset = circumference * (1 - fraction);

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      title={
        level === 6 && noReview
          ? 'Cấp độ 6 · Nhớ sâu (Không ôn lại)'
          : `${spec.label} (${spec.intervalLabel})`
      }
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="#FFFFFF"
          stroke={spec.trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={noReview ? '#059669' : spec.color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-extrabold text-slate-800 tabular-nums"
        style={{ fontSize: Math.round(size * 0.44) }}
      >
        {level}
      </span>
    </span>
  );
}
