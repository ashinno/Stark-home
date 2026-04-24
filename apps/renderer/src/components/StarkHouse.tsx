import { cn } from '../lib/cn';
import { useSession } from '../stores/session';

const CLOUDS = [
  { left: '9%', top: '13%', scale: 0.9, duration: '22s', delay: '-5s' },
  { left: '31%', top: '19%', scale: 0.68, duration: '18s', delay: '-9s' },
  { left: '71%', top: '12%', scale: 0.95, duration: '24s', delay: '-12s' },
];

const FLOWERS = [
  { left: '18%', bottom: '12%', tone: '#ffe59a' },
  { left: '24%', bottom: '10%', tone: '#f8f0ff' },
  { left: '31%', bottom: '11%', tone: '#ffd6c7' },
  { left: '67%', bottom: '14%', tone: '#ffe59a' },
  { left: '74%', bottom: '11%', tone: '#f8f0ff' },
  { left: '82%', bottom: '13%', tone: '#ffd6c7' },
];

const STONES = [
  { left: '46%', bottom: '18%', rotate: '-8deg', scale: 1 },
  { left: '51%', bottom: '14%', rotate: '10deg', scale: 0.84 },
  { left: '56%', bottom: '10%', rotate: '-4deg', scale: 1.12 },
  { left: '61%', bottom: '8%', rotate: '12deg', scale: 0.9 },
];

export function StarkHouse({
  className,
  fullscreen = false,
}: {
  className?: string;
  fullscreen?: boolean;
}) {
  const sidecar = useSession((s) => s.sidecar.state);
  const profile = useSession((s) => s.activeProfile);
  const capabilities = useSession((s) => s.capabilities.length);

  const status =
    sidecar === 'ready'
      ? 'online'
      : sidecar === 'error'
        ? 'offline'
        : sidecar === 'starting'
          ? 'starting'
          : 'sleeping';

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden bg-[#070b13] select-none',
        fullscreen && 'h-full w-full',
        className,
      )}
    >
      <div className="absolute inset-0 bg-[#88c6ff]" />
      <div className="absolute inset-x-0 top-0 h-[52%] bg-[linear-gradient(180deg,#83c1fb_0%,#c8e7ff_72%,#e5f6ff_100%)]" />
      <div className="absolute inset-x-0 bottom-[33%] h-[20%] bg-[#9fd07a]" />
      <div className="absolute inset-x-0 bottom-[21%] h-[18%] bg-[#77b360]" />
      <div className="absolute inset-x-0 bottom-0 h-[24%] bg-[#3f7041]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(255,252,226,0.58),transparent_16%),linear-gradient(180deg,rgba(7,11,19,0),rgba(7,11,19,0.18))]" />

      <div className="absolute left-[6%] top-[7%] h-16 w-16 rounded-full bg-[#fff7c4] shadow-[0_0_0_8px_rgba(255,247,196,0.18)] sm:h-20 sm:w-20" />

      {CLOUDS.map((cloud) => (
        <div
          key={`${cloud.left}-${cloud.top}`}
          className="absolute animate-[stark-drift_var(--cloud-duration)_ease-in-out_infinite]"
          style={
            {
              left: cloud.left,
              top: cloud.top,
              transform: `scale(${cloud.scale})`,
              '--cloud-duration': cloud.duration,
              animationDelay: cloud.delay,
            } as React.CSSProperties
          }
        >
          <PixelCloud />
        </div>
      ))}

      <div className="absolute right-[13%] top-[17%] animate-[stark-drift_20s_ease-in-out_infinite] opacity-90">
        <FloatingIsland />
      </div>

      <div className="absolute inset-x-[-4%] bottom-[18%] h-[20%] rounded-[50%] bg-[#79bd62]" />
      <div className="absolute inset-x-[-8%] bottom-[-2%] h-[27%] rounded-[50%] bg-[#477a48]" />
      <div className="absolute inset-x-0 bottom-0 h-[16%] bg-[linear-gradient(180deg,#355f3a_0%,#213728_100%)]" />

      <div className="absolute left-[9%] bottom-[12%] h-[16%] w-[18%] rounded-[50%] bg-[#25432d]/60 blur-[2px]" />
      <div className="absolute right-[8%] bottom-[10%] h-[18%] w-[22%] rounded-[50%] bg-[#25432d]/60 blur-[2px]" />

      <div className="absolute left-[13%] bottom-[12%] h-[31%] w-[15%] animate-[stark-sway_7s_ease-in-out_infinite] origin-bottom">
        <WillowTree />
      </div>

      <div className="absolute left-[38%] bottom-[16%] h-[34%] w-[23%]">
        <Cottage />
      </div>

      <div className="absolute left-[67%] bottom-[12%] h-[34%] w-[16%] animate-[stark-sway_8s_ease-in-out_infinite] origin-bottom [animation-delay:-2s]">
        <WillowTree mirrored />
      </div>

      {STONES.map((stone) => (
        <div
          key={`${stone.left}-${stone.bottom}`}
          className="absolute h-8 w-10"
          style={{
            left: stone.left,
            bottom: stone.bottom,
            transform: `rotate(${stone.rotate}) scale(${stone.scale})`,
          }}
        >
          <Stone />
        </div>
      ))}

      {FLOWERS.map((flower) => (
        <div
          key={`${flower.left}-${flower.bottom}`}
          className="absolute h-10 w-8"
          style={{ left: flower.left, bottom: flower.bottom }}
        >
          <Flower tone={flower.tone} />
        </div>
      ))}

      <div className="absolute left-[57%] bottom-[13%] h-[12%] w-[5%] animate-[stark-drift_6s_ease-in-out_infinite]">
        <StarkBot />
      </div>

      <div className="absolute inset-x-0 bottom-0 h-[14%] bg-[linear-gradient(180deg,rgba(17,33,22,0),rgba(9,14,19,0.5)_70%,rgba(7,11,19,0.82))]" />

      <div className="absolute left-5 top-5 font-mono text-[9px] uppercase tracking-[0.24em] text-[#e8f4ff]/80 sm:left-7 sm:top-7">
        Meadow station
      </div>
      <div className="absolute bottom-5 left-5 flex max-w-[min(520px,calc(100%-2.5rem))] flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#e0edcf] sm:bottom-7 sm:left-7">
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              status === 'online'
                ? 'bg-[#30d4c7]'
                : status === 'offline'
                  ? 'bg-[#ff7e70]'
                  : 'bg-[#ffd47a]',
            )}
          />
          {status}
        </span>
        <span>{capabilities} tools armed</span>
        <span className="truncate">{profile ?? 'default profile'}</span>
      </div>
    </div>
  );
}

function PixelCloud() {
  return (
    <svg viewBox="0 0 180 90" className="h-20 w-36 drop-shadow-[0_16px_18px_rgba(80,116,171,0.16)]">
      <rect x="28" y="40" width="108" height="22" fill="#f8fbff" />
      <rect x="48" y="22" width="26" height="24" fill="#f8fbff" />
      <rect x="70" y="14" width="34" height="32" fill="#f8fbff" />
      <rect x="100" y="22" width="28" height="24" fill="#f8fbff" />
      <rect x="40" y="46" width="84" height="10" fill="#dfefff" />
      <rect x="22" y="52" width="120" height="10" fill="#d1e5fb" />
    </svg>
  );
}

function FloatingIsland() {
  return (
    <svg viewBox="0 0 210 160" className="h-28 w-40 sm:h-36 sm:w-48">
      <rect x="66" y="26" width="78" height="18" fill="#91cf76" />
      <rect x="52" y="42" width="108" height="20" fill="#79b764" />
      <rect x="40" y="58" width="132" height="18" fill="#6aa55a" />
      <path d="M48 76H164L140 110H72Z" fill="#7a7f96" />
      <path d="M62 76H150L128 122H84Z" fill="#636981" />
      <rect x="78" y="50" width="12" height="22" fill="#8c91ab" />
      <rect x="118" y="40" width="12" height="32" fill="#8c91ab" />
    </svg>
  );
}

function WillowTree({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg
      viewBox="0 0 240 280"
      className={cn('h-full w-full', mirrored && '-scale-x-100')}
      preserveAspectRatio="xMidYMax meet"
    >
      <rect x="112" y="126" width="20" height="112" fill="#5d392b" />
      <rect x="98" y="152" width="16" height="56" fill="#5d392b" />
      <rect x="132" y="144" width="16" height="64" fill="#5d392b" />
      <rect x="88" y="54" width="72" height="24" fill="#d7d0b8" />
      <rect x="72" y="78" width="104" height="26" fill="#d7d0b8" />
      <rect x="58" y="102" width="126" height="28" fill="#d7d0b8" />
      <rect x="72" y="130" width="102" height="24" fill="#d7d0b8" />
      <rect x="52" y="72" width="12" height="94" fill="#d7d0b8" />
      <rect x="72" y="72" width="10" height="110" fill="#d7d0b8" />
      <rect x="96" y="72" width="10" height="128" fill="#d7d0b8" />
      <rect x="160" y="72" width="12" height="108" fill="#d7d0b8" />
      <rect x="182" y="78" width="10" height="92" fill="#d7d0b8" />
      <rect x="64" y="86" width="128" height="8" fill="#e8e2ce" />
    </svg>
  );
}

function Cottage() {
  return (
    <svg viewBox="0 0 260 180" className="h-full w-full" preserveAspectRatio="xMidYMax meet">
      <rect x="56" y="86" width="148" height="66" fill="#f3e7c9" />
      <rect x="48" y="74" width="164" height="18" fill="#d49b57" />
      <rect x="32" y="60" width="196" height="18" fill="#7e4f3d" />
      <rect x="52" y="50" width="156" height="12" fill="#966148" />
      <rect x="78" y="102" width="28" height="26" fill="#9ad6c6" />
      <rect x="154" y="102" width="28" height="26" fill="#9ad6c6" />
      <rect x="114" y="108" width="32" height="44" fill="#6b4633" />
      <rect x="120" y="118" width="8" height="12" fill="#f8c978" />
      <rect x="76" y="100" width="32" height="4" fill="#4b3c32" />
      <rect x="152" y="100" width="32" height="4" fill="#4b3c32" />
      <rect x="90" y="34" width="12" height="26" fill="#7b4b37" />
      <rect x="94" y="24" width="4" height="10" fill="#f6d578" />
      <rect x="184" y="50" width="10" height="18" fill="#7b4b37" />
      <rect x="66" y="152" width="126" height="8" fill="#8ca58d" />
      <rect x="44" y="152" width="18" height="18" fill="#798096" />
      <rect x="194" y="148" width="22" height="22" fill="#798096" />
    </svg>
  );
}

function Stone() {
  return (
    <svg viewBox="0 0 40 32" className="h-full w-full">
      <path d="M8 10L18 4H30L36 14L28 26H12L4 18Z" fill="#8a8fa4" />
      <path d="M10 14H28L22 22H12Z" fill="#a2a8bc" />
    </svg>
  );
}

function Flower({ tone }: { tone: string }) {
  return (
    <svg viewBox="0 0 24 32" className="h-full w-full">
      <rect x="11" y="10" width="2" height="18" fill="#427448" />
      <rect x="7" y="4" width="4" height="4" fill={tone} />
      <rect x="13" y="4" width="4" height="4" fill={tone} />
      <rect x="9" y="0" width="6" height="4" fill={tone} />
      <rect x="9" y="6" width="6" height="4" fill={tone} />
    </svg>
  );
}

function StarkBot() {
  return (
    <svg viewBox="0 0 56 92" className="h-full w-full drop-shadow-[0_8px_10px_rgba(7,11,19,0.28)]">
      <rect x="18" y="18" width="20" height="24" fill="#3a2a26" />
      <rect x="12" y="8" width="32" height="24" fill="#efe5cb" />
      <rect x="16" y="12" width="24" height="16" fill="#293140" />
      <rect x="20" y="16" width="6" height="6" fill="#9ae0cb" />
      <rect x="30" y="16" width="6" height="6" fill="#9ae0cb" />
      <rect x="24" y="40" width="8" height="12" fill="#f0b75f" />
      <rect x="14" y="42" width="8" height="18" fill="#624337" />
      <rect x="34" y="42" width="8" height="18" fill="#624337" />
      <rect x="18" y="56" width="8" height="22" fill="#293140" />
      <rect x="30" y="56" width="8" height="22" fill="#293140" />
      <rect x="18" y="78" width="8" height="6" fill="#efe5cb" />
      <rect x="30" y="78" width="8" height="6" fill="#efe5cb" />
      <rect x="10" y="22" width="4" height="10" fill="#3a2a26" />
      <rect x="42" y="22" width="4" height="10" fill="#3a2a26" />
      <rect x="26" y="2" width="4" height="8" fill="#e3a93f" />
    </svg>
  );
}
