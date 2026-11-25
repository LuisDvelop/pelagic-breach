import * as THREE from 'three';
import type { SceneTextureBundle } from './textures';

export interface SailboatBundle {
  group: THREE.Group;
  update: (elapsedTime: number) => void;
  dispose: () => void;
}

/**
 * Generates a realistic lofted wooden sailboat hull BufferGeometry with flared bow,
 * rising sheer line, rounded bilge, and flat transom.
 */
function buildWoodenHullGeometry(): THREE.BufferGeometry {
  const length = 8.4;
  const stations = 28; // longitudinal from stern (-L/2) to bow (+L/2)
  const profilePts = 18; // cross-section from port gunwale -> keel -> starboard gunwale

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= stations; i++) {
    const u = i / stations; // 0 = stern, 1 = bow
    const x = (u - 0.5) * length;

    // Beam envelope: wide aft-midship, tapering sharply to bow stem
    let beam = Math.sin(Math.pow(u, 0.68) * Math.PI) * 1.42;
    if (u < 0.14) {
      // Transom stern maintains ~0.78m half-beam
      const st = u / 0.14;
      beam = THREE.MathUtils.lerp(0.76, beam, st);
    }

    // Sheer height rises gracefully toward the bow
    const sheerY = 0.64 + Math.pow(u, 1.8) * 0.36 + Math.pow(1 - u, 2.5) * 0.1;
    // Keel line dips deepest midships
    const keelY = -0.58 + Math.pow(Math.abs(u - 0.48) * 2, 2.2) * 0.34;

    for (let j = 0; j <= profilePts; j++) {
      const v = j / profilePts; // 0 = port sheer, 0.5 = keel, 1 = stbd sheer
      const side = v * 2 - 1; // -1 .. +1
      const absS = Math.abs(side);

      // Rounded wineglass hull section
      const yFrac = 1 - Math.pow(absS, 1.65);
      const z = side * beam * Math.pow(Math.sin(absS * Math.PI * 0.5), 0.72);
      const y = THREE.MathUtils.lerp(sheerY, keelY, yFrac);

      positions.push(x, y, z);
      uvs.push(u * 2.5, v);
    }
  }

  const rowStride = profilePts + 1;
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < profilePts; j++) {
      const a = i * rowStride + j;
      const b = (i + 1) * rowStride + j;
      const c = (i + 1) * rowStride + (j + 1);
      const d = i * rowStride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Cap transom at stern (i = 0)
  const sternCenterIdx = positions.length / 3;
  positions.push(-length * 0.5, 0.18, 0);
  uvs.push(0, 0.5);
  for (let j = 0; j < profilePts; j++) {
    indices.push(sternCenterIdx, j + 1, j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a billowing triangular sailcloth mesh with slight wind belly curvature.
 */
function buildBillowingSailGeometry(
  baseLength: number,
  height: number,
  bellyDepth: number,
  flipDir = 1,
): THREE.BufferGeometry {
  const segU = 14;
  const segV = 18;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV; // 0 = foot, 1 = head
    const y = v * height;
    const chord = baseLength * (1 - Math.pow(v, 0.92) * 0.96);

    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU; // 0 = luff (mast/stay), 1 = leech
      const x = -u * chord * flipDir;
      const camber = Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.9 + 0.15) * bellyDepth;
      const z = camber;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = iv * stride + iu + 1;
      const c = (iv + 1) * stride + iu + 1;
      const d = (iv + 1) * stride + iu;
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createWoodenSailboat(textures: SceneTextureBundle): SailboatBundle {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Planked Wooden Hull
  const hullGeo = buildWoodenHullGeometry();
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.hullWoodAlbedo,
    bumpMap: textures.hullWoodBump,
    bumpScale: 0.045,
    roughness: 0.62,
    metalness: 0.04,
  });
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  group.add(hullMesh);
  disposables.push(hullGeo, hullMat);

  // 2. Teak Deck Surface (flat sculpted cap inside gunwales)
  const deckShape = new THREE.Shape();
  deckShape.moveTo(-4.1, -0.72);
  deckShape.quadraticCurveTo(-1.0, -1.36, 4.1, 0);
  deckShape.quadraticCurveTo(-1.0, 1.36, -4.1, 0.72);
  deckShape.closePath();

  const deckGeo = new THREE.ExtrudeGeometry(deckShape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  deckGeo.rotateX(Math.PI / 2);
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.deckTeakAlbedo,
    roughness: 0.76,
    metalness: 0.02,
  });
  const deckMesh = new THREE.Mesh(deckGeo, deckMat);
  deckMesh.position.y = 0.68;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);
  disposables.push(deckGeo, deckMat);

  // 3. Mahogany Cabin Trunk & Gunwale Trim
  const cabinGeo = new THREE.BoxGeometry(2.35, 0.48, 1.34);
  const mahoganyMat = new THREE.MeshStandardMaterial({
    color: 0x4f2715,
    roughness: 0.42,
    metalness: 0.06,
  });
  const cabinMesh = new THREE.Mesh(cabinGeo, mahoganyMat);
  cabinMesh.position.set(-0.25, 0.88, 0);
  cabinMesh.castShadow = true;
  group.add(cabinMesh);
  disposables.push(cabinGeo, mahoganyMat);

  // Cabin roof cap
  const cabinRoofGeo = new THREE.BoxGeometry(2.42, 0.08, 1.42);
  const creamPaintMat = new THREE.MeshStandardMaterial({
    color: 0xe6dcc8,
    roughness: 0.55,
    metalness: 0.03,
  });
  const cabinRoofMesh = new THREE.Mesh(cabinRoofGeo, creamPaintMat);
  cabinRoofMesh.position.set(-0.25, 1.14, 0);
  group.add(cabinRoofMesh);
  disposables.push(cabinRoofGeo, creamPaintMat);

  // 4. Brass Portholes & Warm Cabin Glow
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd9a441,
    roughness: 0.24,
    metalness: 0.88,
  });
  const warmGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffc878,
    emissive: 0xffa042,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const portholeRingGeo = new THREE.TorusGeometry(0.11, 0.025, 8, 18);
  const portholeGlassGeo = new THREE.CircleGeometry(0.095, 16);
  for (const side of [-1, 1]) {
    for (const px of [-0.8, 0.2]) {
      const ring = new THREE.Mesh(portholeRingGeo, brassMat);
      ring.position.set(px, 0.92, side * 0.675);
      group.add(ring);

      const glass = new THREE.Mesh(portholeGlassGeo, warmGlassMat);
      glass.position.set(px, 0.92, side * 0.678);
      if (side < 0) glass.rotation.y = Math.PI;
      group.add(glass);
    }
  }
  disposables.push(brassMat, warmGlassMat, portholeRingGeo, portholeGlassGeo);

  // 5. Dark Timber Keel & Rudder
  const keelGeo = new THREE.BoxGeometry(2.4, 1.15, 0.16);
  const darkTimberMat = new THREE.MeshStandardMaterial({
    color: 0x26170f,
    roughness: 0.85,
    metalness: 0.02,
  });
  const keelMesh = new THREE.Mesh(keelGeo, darkTimberMat);
  keelMesh.position.set(-0.2, -0.78, 0);
  group.add(keelMesh);

  const rudderGeo = new THREE.BoxGeometry(0.65, 1.1, 0.08);
  const rudderMesh = new THREE.Mesh(rudderGeo, darkTimberMat);
  rudderMesh.position.set(-4.05, -0.35, 0);
  group.add(rudderMesh);
  disposables.push(keelGeo, rudderGeo, darkTimberMat);

  // 6. Tapered Spruce Mast, Boom & Bowsprit
  const spruceMat = new THREE.MeshStandardMaterial({
    color: 0xb9854c,
    roughness: 0.52,
    metalness: 0.04,
  });
  const mastGeo = new THREE.CylinderGeometry(0.055, 0.095, 9.2, 14);
  const mastMesh = new THREE.Mesh(mastGeo, spruceMat);
  mastMesh.position.set(0.55, 5.25, 0);
  mastMesh.castShadow = true;
  group.add(mastMesh);

  const boomGeo = new THREE.CylinderGeometry(0.045, 0.055, 4.1, 12);
  boomGeo.rotateZ(Math.PI / 2);
  const boomMesh = new THREE.Mesh(boomGeo, spruceMat);
  boomMesh.position.set(-1.55, 1.88, 0.08);
  boomMesh.rotation.y = -0.08;
  group.add(boomMesh);

  const bowspritGeo = new THREE.CylinderGeometry(0.035, 0.055, 1.65, 10);
  bowspritGeo.rotateZ(Math.PI / 2 - 0.14);
  const bowspritMesh = new THREE.Mesh(bowspritGeo, spruceMat);
  bowspritMesh.position.set(4.55, 1.08, 0);
  group.add(bowspritMesh);
  disposables.push(spruceMat, mastGeo, boomGeo, bowspritGeo);

  // 7. Wire Rigging Stays (Forestay, Backstay, Port/Stbd Shrouds)
  const stayMat = new THREE.MeshStandardMaterial({
    color: 0x8e959c,
    roughness: 0.35,
    metalness: 0.85,
  });
  const stays: Array<[THREE.Vector3, THREE.Vector3]> = [
    [new THREE.Vector3(0.55, 9.65, 0), new THREE.Vector3(5.2, 1.18, 0)],
    [new THREE.Vector3(0.55, 9.7, 0), new THREE.Vector3(-4.05, 0.82, 0)],
    [new THREE.Vector3(0.55, 9.1, 0), new THREE.Vector3(0.1, 0.78, 1.25)],
    [new THREE.Vector3(0.55, 9.1, 0), new THREE.Vector3(0.1, 0.78, -1.25)],
  ];
  const stayGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
  const upVec = new THREE.Vector3(0, 1, 0);
  for (const [a, b] of stays) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const stay = new THREE.Mesh(stayGeo, stayMat);
    stay.scale.set(1, len, 1);
    stay.position.copy(a).addScaledVector(dir, 0.5);
    stay.quaternion.setFromUnitVectors(upVec, dir.normalize());
    group.add(stay);
  }
  disposables.push(stayMat, stayGeo);

  // 8. Billowing Mainsail & Foresail (Jib) with live wind flutter shader
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xfff5e4,
    map: textures.sailCanvasAlbedo,
    roughness: 0.78,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  sailMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    sailMat.userData.shader = shader;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      float flutter = sin(uv.y * 5.2 - uTime * 2.8 + uv.x * 3.0) * 0.065 * uv.x;
      transformed.z += flutter;
      `,
    );
  };

  const mainSailGeo = buildBillowingSailGeometry(3.85, 7.65, 0.42, 1);
  const mainSail = new THREE.Mesh(mainSailGeo, sailMat);
  mainSail.position.set(0.5, 1.95, 0.06);
  mainSail.rotation.y = -0.09;
  mainSail.castShadow = true;
  group.add(mainSail);

  const jibSailGeo = (() => {
    const segU = 12;
    const segV = 16;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const tack = new THREE.Vector3(5.05, 1.18, 0.0);
    const head = new THREE.Vector3(0.55, 9.55, 0.0);
    const clew = new THREE.Vector3(1.15, 1.92, 0.24);
    const ptA = new THREE.Vector3();
    const ptB = new THREE.Vector3();

    for (let iv = 0; iv <= segV; iv++) {
      const v = iv / segV; // 0 = foot, 1 = head
      ptA.lerpVectors(tack, head, v);
      ptB.lerpVectors(clew, head, v);
      for (let iu = 0; iu <= segU; iu++) {
        const u = iu / segU; // 0 = luff on forestay, 1 = leech
        const x = THREE.MathUtils.lerp(ptA.x, ptB.x, u);
        const y = THREE.MathUtils.lerp(ptA.y, ptB.y, u);
        const camber = Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.9 + 0.1) * 0.34;
        const z = THREE.MathUtils.lerp(ptA.z, ptB.z, u) + camber;
        positions.push(x, y, z);
        uvs.push(u, v);
      }
    }
    const stride = segU + 1;
    for (let iv = 0; iv < segV; iv++) {
      for (let iu = 0; iu < segU; iu++) {
        const a = iv * stride + iu;
        const b = iv * stride + iu + 1;
        const c = (iv + 1) * stride + iu + 1;
        const d = (iv + 1) * stride + iu;
        indices.push(a, b, c, a, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  })();
  const jibSail = new THREE.Mesh(jibSailGeo, sailMat);
  jibSail.castShadow = true;
  group.add(jibSail);
  disposables.push(sailMat, mainSailGeo, jibSailGeo);

  // 9. Warm Stern Brass Lantern (subtle golden twilight accent)
  const lanternPostGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.65, 8);
  const lanternPost = new THREE.Mesh(lanternPostGeo, brassMat);
  lanternPost.position.set(-3.75, 1.02, -0.42);
  group.add(lanternPost);

  const lanternGlassGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.18, 10);
  const lanternGlass = new THREE.Mesh(lanternGlassGeo, warmGlassMat);
  lanternGlass.position.set(-3.75, 1.38, -0.42);
  group.add(lanternGlass);

  const lanternLight = new THREE.PointLight(0xffaa44, 1.8, 7.5, 2);
  lanternLight.position.set(-3.75, 1.42, -0.42);
  group.add(lanternLight);
  disposables.push(lanternPostGeo, lanternGlassGeo);

  return {
    group,
    update: (elapsedTime: number) => {
      if (sailMat.userData.shader) {
        sailMat.userData.shader.uniforms.uTime.value = elapsedTime;
      }
    },
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
