import {
  ChevronDown,
  ChevronUp,
  Film,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BREACH_CYCLE_DURATION, type BreachPhase, type CameraPresetId } from '../sim/oceanPhysics';
import type { OceanCinemaState } from './OceanCinemaViewport';

interface CinemaDockProps {
  simState: OceanCinemaState;
  cycleTime: number;
  phase: BreachPhase;
  hudCollapsed: boolean;
  letterbox: boolean;
  onToggleHud: () => void;
  onTogglePlay: () => void;
  onReplay: () => void;
  onSeek: (cycleTime: number) => void;
  onChangeCamera: (preset: CameraPresetId) => void;
  onChangeSunElevation: (deg: number) => void;
  onToggleFlare: () => void;
  onToggleAudio: () => void;
  onToggleLetterbox: () => void;
}

const CAMERA_PRESETS: Array<{ id: CameraPresetId; label: string }> = [
  { id: 'handheld_wide', label: 'Handheld Wide' },
  { id: 'deck_perspective', label: 'Deck View' },
  { id: 'whale_closeup', label: 'Whale Track' },
  { id: 'aerial_orbit', label: 'Aerial Orbit' },
];

const PHASE_LABELS: Record<BreachPhase, string> = {
  approach: 'Subsurface Approach',
  eruption: 'Surface Eruption',
  apex: 'Breach Apex',
  descent: 'Flank Roll & Descent',
  impact: 'Massive Impact & Spray',
  aftermath: 'Rolling Mist & Swell',
};

export function CinemaDock({
  simState,
  cycleTime,
  phase,
  hudCollapsed,
  letterbox,
  onToggleHud,
  onTogglePlay,
  onReplay,
  onSeek,
  onChangeCamera,
  onChangeSunElevation,
  onToggleFlare,
  onToggleAudio,
  onToggleLetterbox,
}: CinemaDockProps) {
  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center w-[min(920px,95vw)] pointer-events-none"
      data-testid="cinema-dock-wrapper"
    >
      {/* Collapse / Expand toggle tab */}
      <button
        type="button"
        onClick={onToggleHud}
        aria-expanded={!hudCollapsed}
        className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium text-stone-200 bg-[#0b1018]/85 border border-white/15 hover:bg-[#141c29] hover:text-amber-200 transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 whitespace-nowrap shrink-0"
      >
        {hudCollapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Show Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Hide Controls</span>
          </>
        )}
      </button>

      {/* Main Dock Panel (no backdrop-filter over WebGL) */}
      <div
        className={`pointer-events-auto w-full rounded-xl bg-[#0b1018]/88 border border-white/12 px-4 py-3 shadow-2xl transition-all duration-200 ease-out ${
          hudCollapsed
            ? 'opacity-0 translate-y-6 pointer-events-none max-h-0 overflow-hidden py-0 border-0'
            : 'opacity-100 translate-y-0'
        }`}
        aria-hidden={hudCollapsed}
      >
        {/* Row 1: Playback, Replay, Timeline Scrubber & Phase Readout */}
        <div className="flex flex-wrap items-center gap-3 pb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onTogglePlay}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-stone-950 hover:bg-amber-400 transition-colors focus-visible:outline-2 focus-visible:outline-amber-300 whitespace-nowrap shrink-0"
            >
              {simState.playing ? (
                <>
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onReplay}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white/8 text-stone-100 hover:bg-white/15 transition-colors focus-visible:outline-2 focus-visible:outline-amber-300 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Replay Breach</span>
            </button>
          </div>

          <div className="flex-1 min-w-[190px] flex items-center gap-2.5">
            <label htmlFor="breach-timeline" className="sr-only">
              Breach Sequence Timeline
            </label>
            <input
              id="breach-timeline"
              type="range"
              min={0}
              max={BREACH_CYCLE_DURATION - 0.05}
              step={0.05}
              value={cycleTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="cinema-slider w-full"
            />
            <span className="font-mono-tabular text-[11px] text-stone-300 whitespace-nowrap shrink-0">
              {cycleTime.toFixed(1)}s / {BREACH_CYCLE_DURATION.toFixed(0)}s
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-amber-200/90 whitespace-nowrap shrink-0">
            <span>{PHASE_LABELS[phase]}</span>
          </div>
        </div>

        {/* Row 2: Camera Presets, Golden Hour Sun Elevation, Flare, IMAX Aspect & Audio */}
        <div className="pt-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Camera Framing Selector */}
          <div
            className="flex items-center gap-1 p-1 rounded-lg bg-white/6 overflow-x-auto max-w-full"
            role="group"
            aria-label="Camera Framing"
          >
            {CAMERA_PRESETS.map((preset) => {
              const active = simState.cameraPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChangeCamera(preset.id)}
                  aria-pressed={active}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-300 ${
                    active
                      ? 'bg-amber-500/22 text-amber-200 border border-amber-400/40'
                      : 'text-stone-300 hover:text-white hover:bg-white/6 border border-transparent'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Sun Elevation + Toggles */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5">
              <Sun className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
              <label
                htmlFor="sun-elevation-slider"
                className="text-xs text-stone-300 whitespace-nowrap shrink-0"
              >
                Sun
              </label>
              <input
                id="sun-elevation-slider"
                type="range"
                min={2}
                max={18}
                step={0.5}
                value={simState.sunElevationDeg}
                onChange={(e) => onChangeSunElevation(parseFloat(e.target.value))}
                className="cinema-slider w-20"
              />
              <span className="font-mono-tabular text-[11px] text-stone-300 w-7 text-right">
                {simState.sunElevationDeg.toFixed(0)}°
              </span>
            </div>

            <button
              type="button"
              onClick={onToggleFlare}
              aria-pressed={simState.flareEnabled}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-300 ${
                simState.flareEnabled
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-400/35'
                  : 'bg-white/6 text-stone-300 border border-transparent hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Anamorphic</span>
            </button>

            <button
              type="button"
              onClick={onToggleLetterbox}
              aria-pressed={letterbox}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-300 ${
                letterbox
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-400/35'
                  : 'bg-white/6 text-stone-300 border border-transparent hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" aria-hidden="true" />
              <span>IMAX 2.39:1</span>
            </button>

            <button
              type="button"
              onClick={onToggleAudio}
              aria-pressed={simState.audioEnabled}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-300 ${
                simState.audioEnabled
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-400/35'
                  : 'bg-white/6 text-stone-300 border border-transparent hover:text-white'
              }`}
            >
              {simState.audioEnabled ? (
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{simState.audioEnabled ? 'Sound On' : 'Sound Off'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
