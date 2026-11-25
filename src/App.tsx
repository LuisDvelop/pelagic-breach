import { useCallback, useEffect, useState } from 'react';
import { CinemaDock } from './components/CinemaDock';
import { OceanCinemaViewport, type OceanCinemaState } from './components/OceanCinemaViewport';
import type { BreachPhase, CameraPresetId } from './sim/oceanPhysics';

export default function App() {
  const [simState, setSimState] = useState<OceanCinemaState>({
    playing: true,
    cameraPreset: 'handheld_wide',
    sunElevationDeg: 6.5,
    flareEnabled: true,
    audioEnabled: false,
    playbackSpeed: 1.0,
  });

  const [cycleTime, setCycleTime] = useState(1.55);
  const [phase, setPhase] = useState<BreachPhase>('approach');
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [letterbox, setLetterbox] = useState(true);
  const [seekRequest, setSeekRequest] = useState<{ cycleTime: number; seq: number } | null>(null);

  const handleTelemetry = useCallback((info: { cycleTime: number; phase: BreachPhase }) => {
    setCycleTime(info.cycleTime);
    setPhase(info.phase);
  }, []);

  const handleTogglePlay = useCallback(() => {
    setSimState((prev) => ({ ...prev, playing: !prev.playing }));
  }, []);

  const handleReplay = useCallback(() => {
    setSeekRequest((prev) => ({ cycleTime: 0.4, seq: (prev?.seq ?? 0) + 1 }));
    setSimState((prev) => ({ ...prev, playing: true }));
  }, []);

  const handleSeek = useCallback((nextTime: number) => {
    setCycleTime(nextTime);
    setSeekRequest((prev) => ({ cycleTime: nextTime, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const handleChangeCamera = useCallback((cameraPreset: CameraPresetId) => {
    setSimState((prev) => ({ ...prev, cameraPreset }));
  }, []);

  const handleChangeSunElevation = useCallback((sunElevationDeg: number) => {
    setSimState((prev) => ({ ...prev, sunElevationDeg }));
  }, []);

  const handleToggleFlare = useCallback(() => {
    setSimState((prev) => ({ ...prev, flareEnabled: !prev.flareEnabled }));
  }, []);

  const handleToggleAudio = useCallback(() => {
    setSimState((prev) => ({ ...prev, audioEnabled: !prev.audioEnabled }));
  }, []);

  // Keyboard shortcuts: Space (Play/Pause), H (Hide/Show Controls), R (Replay Breach)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'h' || e.key === 'H') {
        setHudCollapsed((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R') {
        handleReplay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlay, handleReplay]);

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-[#090d14] select-none"
      data-state={simState.playing ? 'playing' : 'paused'}
      data-phase={phase}
      data-camera={simState.cameraPreset}
      data-hud={hudCollapsed ? 'collapsed' : 'expanded'}
      data-letterbox={letterbox ? 'on' : 'off'}
    >
      {/* Full-Viewport 3D WebGL Ocean Cinema Canvas */}
      <div className="absolute inset-0">
        <OceanCinemaViewport
          simState={simState}
          seekRequest={seekRequest}
          onTelemetry={handleTelemetry}
        />
      </div>

      {/* Subtle Top & Bottom IMAX 2.39:1 Letterbox Bars (pure CSS transform, no blur) */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 top-0 z-10 bg-black transition-transform duration-300 ease-out h-[6.5vh] ${
          letterbox ? 'translate-y-0' : '-translate-y-full'
        }`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-10 bg-black transition-transform duration-300 ease-out h-[6.5vh] ${
          letterbox ? 'translate-y-0' : 'translate-y-full'
        }`}
      />

      {/* Quiet Editorial Top-Left Title Overlay (measured contrast scrim, zero pills) */}
      <header
        className={`pointer-events-none fixed top-0 left-0 right-0 z-20 px-6 pt-5 pb-8 bg-gradient-to-b from-black/55 via-black/20 to-transparent transition-opacity duration-200 ${
          hudCollapsed ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div
          className={`transition-transform duration-300 ease-out ${
            letterbox ? 'translate-y-[4.5vh]' : 'translate-y-0'
          }`}
        >
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide text-stone-50 leading-none">
            Pelagic Breach
          </h1>
          <p className="mt-1.5 flex items-center gap-2 text-xs text-stone-200/85">
            <span>Golden Hour</span>
            <span aria-hidden="true">·</span>
            <span>Open Ocean</span>
            <span aria-hidden="true">·</span>
            <span>Drag to pan · Press H for full view</span>
          </p>
        </div>
      </header>

      {/* Collapsible Bottom Cinema Control Dock */}
      <CinemaDock
        simState={simState}
        cycleTime={cycleTime}
        phase={phase}
        hudCollapsed={hudCollapsed}
        letterbox={letterbox}
        onToggleHud={() => setHudCollapsed((prev) => !prev)}
        onTogglePlay={handleTogglePlay}
        onReplay={handleReplay}
        onSeek={handleSeek}
        onChangeCamera={handleChangeCamera}
        onChangeSunElevation={handleChangeSunElevation}
        onToggleFlare={handleToggleFlare}
        onToggleAudio={handleToggleAudio}
        onToggleLetterbox={() => setLetterbox((prev) => !prev)}
      />
    </main>
  );
}
