import * as THREE from 'three';

function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface SceneTextureBundle {
  whaleAlbedo: THREE.CanvasTexture;
  whaleBump: THREE.CanvasTexture;
  hullWoodAlbedo: THREE.CanvasTexture;
  hullWoodBump: THREE.CanvasTexture;
  deckTeakAlbedo: THREE.CanvasTexture;
  sailCanvasAlbedo: THREE.CanvasTexture;
  spraySprite: THREE.CanvasTexture;
  mistSprite: THREE.CanvasTexture;
  flareStreak: THREE.CanvasTexture;
  dispose: () => void;
}

export function createSceneTextures(maxAnisotropy: number): SceneTextureBundle {
  const aniso = Math.max(1, maxAnisotropy);

  // 1. Blue Whale Mottled Blue-Gray Skin Albedo + Ventral Pleats Bump
  // UV convention for our whale geometry:
  // u = longitudinal [0 = snout tip .. 1 = tail fluke tip]
  // v = circumferential [0 = top spine, 0.25 = right flank, 0.5 = bottom belly, 0.75 = left flank, 1 = top spine]
  const whaleCanvas = document.createElement('canvas');
  whaleCanvas.width = 1024;
  whaleCanvas.height = 512;
  const wCtx = whaleCanvas.getContext('2d')!;

  const whaleBumpCanvas = document.createElement('canvas');
  whaleBumpCanvas.width = 1024;
  whaleBumpCanvas.height = 512;
  const wbCtx = whaleBumpCanvas.getContext('2d')!;

  // Base vertical gradient: dorsal blue-gray -> flank slate -> pale counter-shaded ventral belly
  const grad = wCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#2c4154');
  grad.addColorStop(0.22, '#3d566c');
  grad.addColorStop(0.38, '#536e84');
  grad.addColorStop(0.46, '#8798a3');
  grad.addColorStop(0.5, '#adb7bd');
  grad.addColorStop(0.54, '#8798a3');
  grad.addColorStop(0.62, '#536e84');
  grad.addColorStop(0.78, '#3d566c');
  grad.addColorStop(1.0, '#2c4154');
  wCtx.fillStyle = grad;
  wCtx.fillRect(0, 0, 1024, 512);

  wbCtx.fillStyle = '#808080';
  wbCtx.fillRect(0, 0, 1024, 512);

  const randW = pseudoRandom(4207);

  // Mottled pale blue-gray & dark slate patches characteristic of blue whales
  for (let i = 0; i < 1900; i++) {
    const x = randW() * 1024;
    const y = randW() * 512;
    const distFromBelly = Math.abs(y - 256) / 256; // 0 = belly, 1 = spine
    const rx = 6 + randW() * 24;
    const ry = 3 + randW() * 11;
    const angle = (randW() - 0.5) * 0.45;
    const isLight = randW() > 0.42;

    wCtx.save();
    wCtx.translate(x, y);
    wCtx.rotate(angle);
    wCtx.beginPath();
    wCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    if (isLight) {
      const alpha = (0.07 + randW() * 0.16) * (0.4 + 0.6 * distFromBelly);
      wCtx.fillStyle = `rgba(148, 174, 194, ${alpha.toFixed(3)})`;
    } else {
      const alpha = (0.06 + randW() * 0.14) * (0.35 + 0.65 * distFromBelly);
      wCtx.fillStyle = `rgba(28, 43, 58, ${alpha.toFixed(3)})`;
    }
    wCtx.fill();
    wCtx.restore();

    wbCtx.save();
    wbCtx.translate(x, y);
    wbCtx.rotate(angle);
    wbCtx.beginPath();
    wbCtx.ellipse(0, 0, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2);
    wbCtx.fillStyle = isLight ? 'rgba(155,155,155,0.08)' : 'rgba(95,95,95,0.08)';
    wbCtx.fill();
    wbCtx.restore();
  }

  // Ventral throat grooves (pleats running from snout u=0.06 to mid-body u=0.52 along bottom belly)
  const pleatCount = 46;
  const bellyCenterY = 256;
  const bellyHalfBand = 96;
  for (let p = 0; p < pleatCount; p++) {
    const frac = p / (pleatCount - 1) - 0.5;
    const py = bellyCenterY + frac * bellyHalfBand * 2;
    const endX = 480 + (1 - Math.abs(frac) * 1.4) * 90;
    const grooveGrad = wCtx.createLinearGradient(50, py, endX, py);
    grooveGrad.addColorStop(0, 'rgba(26, 38, 50, 0.0)');
    grooveGrad.addColorStop(0.12, 'rgba(26, 38, 50, 0.42)');
    grooveGrad.addColorStop(0.82, 'rgba(34, 48, 62, 0.28)');
    grooveGrad.addColorStop(1, 'rgba(34, 48, 62, 0.0)');
    wCtx.strokeStyle = grooveGrad;
    wCtx.lineWidth = 1.6;
    wCtx.beginPath();
    wCtx.moveTo(45, py);
    wCtx.lineTo(endX, py);
    wCtx.stroke();

    wbCtx.strokeStyle = 'rgba(42, 42, 42, 0.65)';
    wbCtx.lineWidth = 2.0;
    wbCtx.beginPath();
    wbCtx.moveTo(45, py);
    wbCtx.lineTo(endX, py);
    wbCtx.stroke();

    wbCtx.strokeStyle = 'rgba(205, 205, 205, 0.45)';
    wbCtx.lineWidth = 1.2;
    wbCtx.beginPath();
    wbCtx.moveTo(45, py + 1.8);
    wbCtx.lineTo(endX, py + 1.8);
    wbCtx.stroke();
  }

  // Subtle pale barnacle / healed scar streaks
  for (let s = 0; s < 45; s++) {
    const sx = 120 + randW() * 780;
    const sy = randW() * 512;
    wCtx.strokeStyle = `rgba(182, 198, 210, ${(0.12 + randW() * 0.18).toFixed(2)})`;
    wCtx.lineWidth = 1 + randW() * 1.6;
    wCtx.beginPath();
    wCtx.moveTo(sx, sy);
    wCtx.quadraticCurveTo(
      sx + (randW() - 0.5) * 24,
      sy + (randW() - 0.5) * 18,
      sx + (randW() - 0.5) * 38,
      sy + (randW() - 0.5) * 20,
    );
    wCtx.stroke();
  }

  const whaleAlbedo = new THREE.CanvasTexture(whaleCanvas);
  whaleAlbedo.colorSpace = THREE.SRGBColorSpace;
  whaleAlbedo.wrapS = THREE.ClampToEdgeWrapping;
  whaleAlbedo.wrapT = THREE.RepeatWrapping;
  whaleAlbedo.anisotropy = aniso;

  const whaleBump = new THREE.CanvasTexture(whaleBumpCanvas);
  whaleBump.colorSpace = THREE.NoColorSpace;
  whaleBump.wrapS = THREE.ClampToEdgeWrapping;
  whaleBump.wrapT = THREE.RepeatWrapping;
  whaleBump.anisotropy = aniso;

  // 2. Weathered Wooden Boat Hull Planking
  const hullCanvas = document.createElement('canvas');
  hullCanvas.width = 512;
  hullCanvas.height = 512;
  const hCtx = hullCanvas.getContext('2d')!;

  const hullBumpCanvas = document.createElement('canvas');
  hullBumpCanvas.width = 512;
  hullBumpCanvas.height = 512;
  const hbCtx = hullBumpCanvas.getContext('2d')!;

  hCtx.fillStyle = '#5c3822';
  hCtx.fillRect(0, 0, 512, 512);
  hbCtx.fillStyle = '#888888';
  hbCtx.fillRect(0, 0, 512, 512);

  const randH = pseudoRandom(913);
  const plankRows = 12;
  const plankH = 512 / plankRows;
  for (let r = 0; r < plankRows; r++) {
    const y0 = r * plankH;
    const toneShift = (randH() - 0.5) * 18;
    const red = Math.round(92 + toneShift);
    const green = Math.round(54 + toneShift * 0.65);
    const blue = Math.round(33 + toneShift * 0.45);
    hCtx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    hCtx.fillRect(0, y0, 512, plankH - 2);

    // Wood grain streaks
    for (let g = 0; g < 32; g++) {
      const gy = y0 + randH() * (plankH - 3);
      hCtx.strokeStyle =
        randH() > 0.5 ? 'rgba(34, 18, 9, 0.26)' : 'rgba(138, 92, 56, 0.22)';
      hCtx.lineWidth = 0.8 + randH() * 1.4;
      hCtx.beginPath();
      hCtx.moveTo(0, gy);
      hCtx.bezierCurveTo(170, gy + (randH() - 0.5) * 5, 340, gy + (randH() - 0.5) * 5, 512, gy);
      hCtx.stroke();

      hbCtx.strokeStyle = 'rgba(110,110,110,0.35)';
      hbCtx.lineWidth = 1;
      hbCtx.beginPath();
      hbCtx.moveTo(0, gy);
      hbCtx.lineTo(512, gy);
      hbCtx.stroke();
    }

    // Dark plank seam
    hCtx.fillStyle = '#24130a';
    hCtx.fillRect(0, y0 + plankH - 2.2, 512, 2.2);
    hbCtx.fillStyle = '#222222';
    hbCtx.fillRect(0, y0 + plankH - 2.5, 512, 2.5);
  }

  const hullWoodAlbedo = new THREE.CanvasTexture(hullCanvas);
  hullWoodAlbedo.colorSpace = THREE.SRGBColorSpace;
  hullWoodAlbedo.wrapS = THREE.RepeatWrapping;
  hullWoodAlbedo.wrapT = THREE.RepeatWrapping;
  hullWoodAlbedo.anisotropy = aniso;

  const hullWoodBump = new THREE.CanvasTexture(hullBumpCanvas);
  hullWoodBump.colorSpace = THREE.NoColorSpace;
  hullWoodBump.wrapS = THREE.RepeatWrapping;
  hullWoodBump.wrapT = THREE.RepeatWrapping;
  hullWoodBump.anisotropy = aniso;

  // 3. Teak Deck Planking
  const deckCanvas = document.createElement('canvas');
  deckCanvas.width = 512;
  deckCanvas.height = 512;
  const dCtx = deckCanvas.getContext('2d')!;
  dCtx.fillStyle = '#8b6340';
  dCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16; i++) {
    const x = i * 32;
    const delta = (randH() - 0.5) * 14;
    dCtx.fillStyle = `rgb(${Math.round(138 + delta)}, ${Math.round(98 + delta * 0.7)}, ${Math.round(62 + delta * 0.5)})`;
    dCtx.fillRect(x, 0, 30, 512);
    dCtx.fillStyle = '#2a1d13';
    dCtx.fillRect(x + 30, 0, 2, 512);
  }
  const deckTeakAlbedo = new THREE.CanvasTexture(deckCanvas);
  deckTeakAlbedo.colorSpace = THREE.SRGBColorSpace;
  deckTeakAlbedo.wrapS = THREE.RepeatWrapping;
  deckTeakAlbedo.wrapT = THREE.RepeatWrapping;
  deckTeakAlbedo.anisotropy = aniso;

  // 4. Woven Sailcloth Canvas
  const sailCanvas = document.createElement('canvas');
  sailCanvas.width = 512;
  sailCanvas.height = 512;
  const sCtx = sailCanvas.getContext('2d')!;
  sCtx.fillStyle = '#f2e8d4';
  sCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) {
    sCtx.fillStyle = 'rgba(182, 162, 134, 0.22)';
    sCtx.fillRect(0, y, 512, 2);
  }
  for (let i = 0; i < 512; i += 4) {
    sCtx.fillStyle = 'rgba(160, 145, 120, 0.04)';
    sCtx.fillRect(i, 0, 1, 512);
    sCtx.fillRect(0, i, 512, 1);
  }
  const sailCanvasAlbedo = new THREE.CanvasTexture(sailCanvas);
  sailCanvasAlbedo.colorSpace = THREE.SRGBColorSpace;
  sailCanvasAlbedo.wrapS = THREE.RepeatWrapping;
  sailCanvasAlbedo.wrapT = THREE.RepeatWrapping;
  sailCanvasAlbedo.anisotropy = aniso;

  // 5. Soft Spray Particle Sprite
  const sprayCanvas = document.createElement('canvas');
  sprayCanvas.width = 128;
  sprayCanvas.height = 128;
  const spCtx = sprayCanvas.getContext('2d')!;
  const spGrad = spCtx.createRadialGradient(64, 64, 4, 64, 64, 60);
  spGrad.addColorStop(0, 'rgba(255, 250, 240, 1.0)');
  spGrad.addColorStop(0.32, 'rgba(248, 240, 224, 0.85)');
  spGrad.addColorStop(0.68, 'rgba(225, 228, 232, 0.28)');
  spGrad.addColorStop(1, 'rgba(225, 228, 232, 0.0)');
  spCtx.fillStyle = spGrad;
  spCtx.fillRect(0, 0, 128, 128);
  const spraySprite = new THREE.CanvasTexture(sprayCanvas);
  spraySprite.colorSpace = THREE.SRGBColorSpace;

  // 6. Soft Billowing Mist Cloud Sprite
  const mistCanvas = document.createElement('canvas');
  mistCanvas.width = 256;
  mistCanvas.height = 256;
  const mCtx = mistCanvas.getContext('2d')!;
  const randM = pseudoRandom(77);
  for (let c = 0; c < 14; c++) {
    const cx = 128 + (randM() - 0.5) * 76;
    const cy = 128 + (randM() - 0.5) * 60;
    const r = 45 + randM() * 55;
    const g = mCtx.createRadialGradient(cx, cy, 4, cx, cy, r);
    g.addColorStop(0, 'rgba(255, 244, 226, 0.14)');
    g.addColorStop(0.55, 'rgba(245, 228, 206, 0.06)');
    g.addColorStop(1, 'rgba(245, 228, 206, 0.0)');
    mCtx.fillStyle = g;
    mCtx.beginPath();
    mCtx.arc(cx, cy, r, 0, Math.PI * 2);
    mCtx.fill();
  }
  const mistSprite = new THREE.CanvasTexture(mistCanvas);
  mistSprite.colorSpace = THREE.SRGBColorSpace;

  // 7. Anamorphic Horizontal Sun Streak + Halo Texture
  const flareCanvas = document.createElement('canvas');
  flareCanvas.width = 512;
  flareCanvas.height = 128;
  const fCtx = flareCanvas.getContext('2d')!;
  const fHalo = fCtx.createRadialGradient(256, 64, 2, 256, 64, 62);
  fHalo.addColorStop(0, 'rgba(255, 248, 225, 0.95)');
  fHalo.addColorStop(0.35, 'rgba(255, 198, 110, 0.45)');
  fHalo.addColorStop(1, 'rgba(255, 140, 60, 0.0)');
  fCtx.fillStyle = fHalo;
  fCtx.fillRect(0, 0, 512, 128);

  const streak = fCtx.createLinearGradient(0, 64, 512, 64);
  streak.addColorStop(0, 'rgba(255, 180, 95, 0.0)');
  streak.addColorStop(0.28, 'rgba(255, 192, 112, 0.16)');
  streak.addColorStop(0.5, 'rgba(255, 242, 212, 0.58)');
  streak.addColorStop(0.72, 'rgba(255, 192, 112, 0.16)');
  streak.addColorStop(1, 'rgba(255, 180, 95, 0.0)');
  fCtx.fillStyle = streak;
  fCtx.fillRect(0, 58, 512, 12);
  const flareStreak = new THREE.CanvasTexture(flareCanvas);
  flareStreak.colorSpace = THREE.SRGBColorSpace;

  return {
    whaleAlbedo,
    whaleBump,
    hullWoodAlbedo,
    hullWoodBump,
    deckTeakAlbedo,
    sailCanvasAlbedo,
    spraySprite,
    mistSprite,
    flareStreak,
    dispose: () => {
      whaleAlbedo.dispose();
      whaleBump.dispose();
      hullWoodAlbedo.dispose();
      hullWoodBump.dispose();
      deckTeakAlbedo.dispose();
      sailCanvasAlbedo.dispose();
      spraySprite.dispose();
      mistSprite.dispose();
      flareStreak.dispose();
    },
  };
}
