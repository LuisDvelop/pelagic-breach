import * as THREE from 'three';
import type { SceneTextureBundle } from './textures';

export interface BlueWhaleBundle {
  group: THREE.Group;
  update: (params: {
    spineBend: number;
    tailFlap: number;
    wetness: number;
    elapsedTime: number;
  }) => void;
  dispose: () => void;
}

/**
 * Computes anatomical blue whale cross-section dimensions at normalized longitudinal u in [0..1]
 * where u=0 is snout tip (local x = +12.5) and u=1 is tail peduncle end (local x = -12.5).
 */
function whaleProfileAt(u: number): {
  width: number;
  topHeight: number;
  bottomDepth: number;
  yCenterOffset: number;
} {
  // Clamp u
  const t = Math.max(0, Math.min(1, u));

  // Horizontal half-width: U-shaped broad rostrum, widest around u=0.28, muscular lumbar carry
  let width = 0;
  if (t < 0.28) {
    const s = t / 0.28;
    width = 1.92 * Math.pow(Math.sin(s * Math.PI * 0.5), 0.62);
  } else {
    const s = (t - 0.28) / 0.72;
    width = 1.92 * Math.pow(1 - s, 0.92) + 0.16 * (1 - s);
  }

  // Vertical dorsal height above centerline
  let topHeight = 0;
  if (t < 0.26) {
    const s = t / 0.26;
    const blowholeBump = Math.exp(-Math.pow((t - 0.145) / 0.032, 2)) * 0.15;
    topHeight = 1.56 * Math.pow(Math.sin(s * Math.PI * 0.5), 0.68) + blowholeBump;
  } else {
    const s = (t - 0.26) / 0.74;
    topHeight = 1.56 * Math.pow(1 - s, 0.78) + 0.15 * (1 - s);
  }

  // Ventral throat & belly depth below centerline
  let bottomDepth = 0;
  if (t < 0.28) {
    const s = t / 0.28;
    bottomDepth = 1.78 * Math.pow(Math.sin(s * Math.PI * 0.5), 0.76);
  } else {
    const s = (t - 0.28) / 0.72;
    bottomDepth = 1.78 * Math.pow(1 - s, 0.88) + 0.14 * (1 - s);
  }

  // Subtle dorsal arch along spine centerline
  const yCenterOffset = Math.sin(t * Math.PI) * 0.18 - Math.pow(t, 2.2) * 0.2;

  return {
    width: Math.max(0.035, width),
    topHeight: Math.max(0.04, topHeight),
    bottomDepth: Math.max(0.04, bottomDepth),
    yCenterOffset,
  };
}

function buildWhaleBodyGeometry(): THREE.BufferGeometry {
  const segU = 72; // longitudinal slices
  const segV = 36; // circumferential slices
  const length = 25.0;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iu = 0; iu <= segU; iu++) {
    const u = iu / segU; // 0 = snout (+12.5), 1 = tail (-12.5)
    const x = (0.5 - u) * length;
    const prof = whaleProfileAt(u);

    // Peduncle lateral compression toward tail
    const peduncleSquash = u > 0.62 ? 1.0 - ((u - 0.62) / 0.38) * 0.42 : 1.0;

    for (let iv = 0; iv <= segV; iv++) {
      const v = iv / segV; // 0 = dorsal spine, 0.25 = right flank, 0.5 = ventral belly, 0.75 = left flank, 1 = dorsal
      const theta = v * Math.PI * 2;
      const cosT = Math.cos(theta); // +1 dorsal, -1 ventral
      const sinT = Math.sin(theta); // +1 right, -1 left

      // Flatten rostrum slightly on top while keeping rounded ventral pouch
      const rY = cosT >= 0 ? prof.topHeight * cosT : prof.bottomDepth * cosT;
      const rZ = prof.width * peduncleSquash * sinT;

      // Subtle jaw seam ridge near front head
      const jawPinch =
        u < 0.21 && Math.abs(cosT) < 0.22
          ? -0.06 * (1 - u / 0.21) * (1 - Math.abs(cosT) / 0.22)
          : 0;

      positions.push(x, rY + prof.yCenterOffset + jawPinch, rZ);
      uvs.push(u, v);
    }
  }

  const stride = segV + 1;
  for (let iu = 0; iu < segU; iu++) {
    for (let iv = 0; iv < segV; iv++) {
      const a = iu * stride + iv;
      const b = (iu + 1) * stride + iv;
      const c = (iu + 1) * stride + (iv + 1);
      const d = iu * stride + (iv + 1);
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildPectoralFinGeometry(side: 1 | -1): THREE.BufferGeometry {
  // Slender swept-back blue whale flipper (~3.6m span)
  const shape = new THREE.Shape();
  shape.moveTo(0.8, 0.0);
  shape.quadraticCurveTo(0.35, 1.4, -0.45, 2.95);
  shape.quadraticCurveTo(-0.85, 3.65, -1.25, 3.5);
  shape.quadraticCurveTo(-1.12, 2.55, -0.82, 1.25);
  shape.quadraticCurveTo(-0.55, 0.35, -0.35, 0.0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 3,
    curveSegments: 14,
  });

  // Taper thickness toward flipper tip and orient horizontally out to side (+Z or -Z)
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i); // span along flipper
    const z = pos.getZ(i) - 0.07;
    const spanFrac = Math.max(0, Math.min(1, y / 3.65));
    const thicknessScale = 1 - spanFrac * 0.78;
    const droop = -Math.pow(spanFrac, 1.6) * 0.42;
    pos.setXYZ(i, x, z * thicknessScale + droop, y * side);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildDorsalFinGeometry(): THREE.BufferGeometry {
  // Small falcate blue whale dorsal fin (~0.55m tall)
  const shape = new THREE.Shape();
  shape.moveTo(0.65, 0);
  shape.quadraticCurveTo(0.15, 0.36, -0.25, 0.58);
  shape.quadraticCurveTo(-0.42, 0.58, -0.32, 0.3);
  shape.quadraticCurveTo(-0.24, 0.1, -0.48, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.04);
  geo.computeVertexNormals();
  return geo;
}

function buildTailFlukesGeometry(): THREE.BufferGeometry {
  // Broad horizontal flukes (~5.4m span) with central notch
  const shape = new THREE.Shape();
  shape.moveTo(0.85, 0);
  shape.quadraticCurveTo(0.15, 1.35, -0.75, 2.72);
  shape.quadraticCurveTo(-1.05, 2.88, -1.08, 2.45);
  shape.quadraticCurveTo(-0.78, 1.35, -0.42, 0.16);
  shape.lineTo(-0.56, 0);
  shape.lineTo(-0.42, -0.16);
  shape.quadraticCurveTo(-0.78, -1.35, -1.08, -2.45);
  shape.quadraticCurveTo(-1.05, -2.88, -0.75, -2.72);
  shape.quadraticCurveTo(0.15, -1.35, 0.85, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geo.rotateX(Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i) + 0.06;
    const z = pos.getZ(i);
    const spanFrac = Math.min(1, Math.abs(z) / 2.8);
    pos.setXYZ(i, x, y * (1 - spanFrac * 0.72), z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createBlueWhale(textures: SceneTextureBundle): BlueWhaleBundle {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const shaderUniforms = {
    uSpineBend: { value: 0 },
    uTailFlap: { value: 0 },
  };

  const applySpineDeformation = (mat: THREE.Material) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSpineBend = shaderUniforms.uSpineBend;
      shader.uniforms.uTailFlap = shaderUniforms.uTailFlap;

      shader.vertexShader =
        'uniform float uSpineBend;\nuniform float uTailFlap;\n' + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        // Convert world-local position inside group (flippers/flukes are offset by parent mesh position,
        // so we use a uniform-safe polynomial along local x, approximate via modelMatrix or direct local x)
        float normX = clamp(transformed.x / 12.5, -1.0, 1.0);
        // Arch along full body
        float archY = uSpineBend * (1.0 - normX * normX) * 2.1;
        // Progressive caudal fluke wave for posterior half
        float tailWeight = smoothstep(0.2, -1.0, normX);
        float flapY = uTailFlap * tailWeight * tailWeight * 2.6;
        transformed.y += archY + flapY;
        `,
      );
    };
  };

  const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.whaleAlbedo,
    bumpMap: textures.whaleBump,
    bumpScale: 0.065,
    roughness: 0.34,
    metalness: 0.04,
    clearcoat: 0.92,
    clearcoatRoughness: 0.14,
  });
  applySpineDeformation(skinMat);
  disposables.push(skinMat);

  // Dark slate fin material sharing the same mottled hue family
  const finMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b5368,
    roughness: 0.32,
    metalness: 0.05,
    clearcoat: 0.9,
    clearcoatRoughness: 0.14,
  });
  // Note: child fin meshes have local coordinates shifted when translated into geometry space
  // so that the spine deformation shader evaluates normX accurately in whale-body coordinates!
  applySpineDeformation(finMat);
  disposables.push(finMat);

  // 1. Main Whale Body
  const bodyGeo = buildWhaleBodyGeometry();
  const bodyMesh = new THREE.Mesh(bodyGeo, skinMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);
  disposables.push(bodyGeo);

  // 2. Right & Left Pectoral Flippers (translated directly into whale coordinate frame so shader deformation aligns seamlessly)
  const rightFlipperGeo = buildPectoralFinGeometry(1);
  rightFlipperGeo.rotateX(0.26);
  rightFlipperGeo.rotateZ(-0.14);
  rightFlipperGeo.translate(4.9, -0.58, 1.48);
  const rightFlipper = new THREE.Mesh(rightFlipperGeo, finMat);
  rightFlipper.castShadow = true;
  group.add(rightFlipper);

  const leftFlipperGeo = buildPectoralFinGeometry(-1);
  leftFlipperGeo.rotateX(-0.26);
  leftFlipperGeo.rotateZ(-0.14);
  leftFlipperGeo.translate(4.9, -0.58, -1.48);
  const leftFlipper = new THREE.Mesh(leftFlipperGeo, finMat);
  leftFlipper.castShadow = true;
  group.add(leftFlipper);
  disposables.push(rightFlipperGeo, leftFlipperGeo);

  // 3. Falcate Dorsal Fin (aft at x = -6.1)
  const dorsalGeo = buildDorsalFinGeometry();
  dorsalGeo.translate(-6.1, 0.72, 0);
  const dorsalMesh = new THREE.Mesh(dorsalGeo, finMat);
  dorsalMesh.castShadow = true;
  group.add(dorsalMesh);
  disposables.push(dorsalGeo);

  // 4. Broad Tail Flukes (at x = -12.35)
  const flukeGeo = buildTailFlukesGeometry();
  flukeGeo.translate(-12.35, -0.18, 0);
  const flukeMesh = new THREE.Mesh(flukeGeo, finMat);
  flukeMesh.castShadow = true;
  group.add(flukeMesh);
  disposables.push(flukeGeo);

  // 5. Eyes (subtle dark glossy orbs locked to lateral mouth corners via spine deformation)
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x0a0d12,
    roughness: 0.1,
    metalness: 0.1,
  });
  applySpineDeformation(eyeMat);
  for (const side of [-1, 1]) {
    const eGeo = new THREE.SphereGeometry(0.055, 12, 10);
    eGeo.translate(7.35, -0.22, side * 1.72);
    const eye = new THREE.Mesh(eGeo, eyeMat);
    group.add(eye);
    disposables.push(eGeo);
  }
  disposables.push(eyeMat);

  return {
    group,
    update: ({ spineBend, tailFlap, wetness }) => {
      shaderUniforms.uSpineBend.value = spineBend;
      shaderUniforms.uTailFlap.value = tailFlap;
      skinMat.clearcoat = 0.6 + 0.35 * wetness;
    },
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
