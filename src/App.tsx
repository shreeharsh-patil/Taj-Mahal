import { useCallback, useEffect, useRef, useState } from 'react';
import { TajExperience } from './taj/experience';
import type { TimePreset } from './taj/environment';
import type { ViewName } from './taj/camera';

/** Minimal line-art Taj used by the loading screen (stroke draws in as loading progresses). */
function LoaderEmblem({ progress }: { progress: number }) {
  const paths = [
    'M82 62 C70 54 74 36 100 22 C126 36 130 54 118 62', // dome
    'M100 22 L100 8', // finial
    'M60 62 H140 V100 H60 Z', // body
    'M90 100 V80 Q90 68 100 63 Q110 68 110 80 V100', // iwan
    'M66 62 V52 M134 62 V52', // chhatri posts
    'M62 52 Q66 44 70 52 M130 52 Q134 44 138 52', // chhatri domes
    'M28 100 V44 M38 100 V44 M162 100 V44 M172 100 V44', // minarets
    'M26 44 Q33 34 40 44 M160 44 Q167 34 174 44',
    'M20 100 H180',
  ];
  return (
    <svg viewBox="0 0 200 112" className="w-56 sm:w-72" fill="none" stroke="#e9d5a4" strokeWidth="1.1" strokeLinecap="round">
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={Math.max(0, 1 - Math.min(1, progress * 1.15 - i * 0.04) )}
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
      ))}
      <circle cx="100" cy="6" r="1.8" fill="#e9d5a4" opacity={progress > 0.9 ? 1 : 0.2} />
    </svg>
  );
}

const VIEWS: { id: ViewName; label: string; key: string }[] = [
  { id: 'front', label: 'Front View', key: '1' },
  { id: 'aerial', label: 'Aerial View', key: '2' },
  { id: 'close', label: 'Close View', key: '3' },
  { id: 'garden', label: 'Garden View', key: '4' },
];

const TIMES: { id: TimePreset; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'day', label: 'Day' },
  { id: 'sunset', label: 'Sunset' },
];

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const expRef = useRef<TajExperience | null>(null);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('Preparing the stage…');
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touring, setTouring] = useState(false);
  const [time, setTime] = useState<TimePreset>('morning');
  const [drift, setDrift] = useState(false);
  const [full, setFull] = useState(false);
  const [hint, setHint] = useState(false);
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  /* ---- boot the 3D experience ---- */
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let cancelled = false;
    const exp = new TajExperience(el, {
      onProgress: (f, l) => {
        if (cancelled) return;
        setProgress(f);
        setLabel(l);
      },
      onTourChange: (t) => !cancelled && setTouring(t),
    });
    expRef.current = exp;
    exp
      .init()
      .then(() => {
        if (cancelled) return;
        setReady(true);
        exp.begin();
        setHint(true);
        window.setTimeout(() => !cancelled && setHint(false), 14000);
        window.setTimeout(() => !cancelled && setGone(true), 1800);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      exp.dispose();
      expRef.current = null;
    };
  }, []);

  /* ---- fullscreen state ---- */
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  const goTo = useCallback((v: ViewName) => {
    expRef.current?.goTo(v);
    setHint(false);
  }, []);

  const toggleTour = useCallback(() => {
    const e = expRef.current;
    if (!e) return;
    if (e.isTouring()) e.stopTour();
    else e.startTour();
    setHint(false);
  }, []);

  const pickTime = useCallback((t: TimePreset) => {
    expRef.current?.setDrift(false);
    expRef.current?.setTime(t);
    setDrift(false);
    setTime(t);
  }, []);

  const toggleDrift = useCallback(() => {
    setDrift((d) => {
      expRef.current?.setDrift(!d);
      return !d;
    });
  }, []);

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ready || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = VIEWS.find((x) => x.key === e.key);
      if (v) goTo(v.id);
      else if (e.key === 'r' || e.key === 'R') expRef.current?.reset();
      else if (e.key === 't' || e.key === 'T') toggleTour();
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, goTo, toggleTour, toggleFullscreen]);

  const pct = Math.round(progress * 100);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0d0f14] select-none">
      {/* WebGL canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* ---------------- HUD ---------------- */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* title */}
        <div className="absolute left-4 top-4 sm:left-6 sm:top-5 text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]">
          <div className="font-serif text-lg sm:text-2xl tracking-[0.18em] uppercase">Taj Mahal</div>
          <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-white/70">Agra · India · 1632–1653</div>
        </div>

        {/* fullscreen */}
        {canFullscreen && (
          <button
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            title="Fullscreen (F)"
            className="glass pointer-events-auto absolute right-4 top-4 sm:right-6 sm:top-5 h-10 w-10 rounded-full flex items-center justify-center"
          >
            {full ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3v4a2 2 0 0 1-2 2H3M21 9h-4a2 2 0 0 1-2-2V3M3 15h4a2 2 0 0 1 2 2v4M15 21v-4a2 2 0 0 1 2-2h4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            )}
          </button>
        )}

        {/* hint */}
        <div
          className={`absolute bottom-28 sm:bottom-24 left-0 right-0 text-center text-[11px] sm:text-xs tracking-widest uppercase text-white/80 drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)] transition-opacity duration-1000 ${hint ? 'opacity-100' : 'opacity-0'}`}
        >
          Drag to orbit · Scroll or pinch to zoom
        </div>

        {/* control bar */}
        <div className="absolute bottom-3 sm:bottom-6 left-0 right-0 flex justify-center px-2">
          <div className="glass pointer-events-auto max-w-full overflow-x-auto no-scrollbar rounded-3xl sm:rounded-full px-2 py-2 flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1 shrink-0">
              {VIEWS.map((v) => (
                <button key={v.id} className="gbtn" onClick={() => goTo(v.id)} title={`${v.label} (${v.key})`}>
                  {v.label}
                </button>
              ))}
              <button className="gbtn" onClick={() => expRef.current?.reset()} title="Reset camera (R)">
                Reset Camera
              </button>
            </div>

            <span className="h-5 w-px bg-white/25 shrink-0" />

            <button
              className={`gbtn shrink-0 ${touring ? 'gbtn-active' : 'gbtn-accent'}`}
              onClick={toggleTour}
              title="Cinematic Tour (T)"
            >
              {touring ? '■ Stop Tour' : '▶ Cinematic Tour'}
            </button>

            <span className="h-5 w-px bg-white/25 shrink-0" />

            <div className="flex items-center gap-1 shrink-0">
              {TIMES.map((t) => (
                <button
                  key={t.id}
                  className={`gbtn ${!drift && time === t.id ? 'gbtn-active' : ''}`}
                  onClick={() => pickTime(t.id)}
                >
                  {t.label}
                </button>
              ))}
              <button
                className={`gbtn ${drift ? 'gbtn-active' : ''}`}
                onClick={toggleDrift}
                title="Slowly drift the sun through the day"
              >
                Sun Drift
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- loading screen ---------------- */}
      {!gone && (
        <div
          className={`absolute inset-0 z-50 flex flex-col items-center justify-center loader-bg transition-opacity duration-[1400ms] ease-out ${ready ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
          {error ? (
            <div className="max-w-md px-6 text-center text-white/90">
              <div className="font-serif text-2xl mb-3">This experience needs WebGL</div>
              <p className="text-sm text-white/70">{error}</p>
            </div>
          ) : (
            <>
              <LoaderEmblem progress={progress} />
              <h1 className="mt-8 px-6 text-center font-serif text-xl sm:text-3xl tracking-[0.12em] text-[#f3e6c4]">
                Loading the Taj Mahal Experience…
              </h1>
              <p className="mt-2 h-5 text-xs sm:text-sm tracking-[0.2em] uppercase text-white/55">{label}</p>
              <div className="mt-6 h-[3px] w-64 sm:w-96 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#b98a3a] via-[#f3dc9a] to-[#b98a3a] transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-3 text-xs tabular-nums tracking-widest text-white/60">{pct}%</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
