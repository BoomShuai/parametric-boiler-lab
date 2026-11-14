export const DEFAULT_CONTROLS = Object.freeze({mode: 'thermal', deltaT: 160, pressure: 400, sag: 18, visualScale: 12, applied: true});
export const MODES = Object.freeze(['thermal', 'pressure', 'sag', 'combined']);
// Illustrative constants, deliberately unrelated to any real facility.
export const ALPHA = 1.1e-5;
export const PRESSURE_COMPLIANCE_MM_PER_PA = .015;

export function validateControls(input = DEFAULT_CONTROLS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('形变参数必须是对象');
  if (Object.keys(input).some(key => !Object.hasOwn(DEFAULT_CONTROLS, key))) throw new Error('存在未知形变参数');
  const control = {...DEFAULT_CONTROLS, ...input};
  if (!MODES.includes(control.mode) || typeof control.applied !== 'boolean') throw new Error('无效形变模式');
  for (const [key, min, max] of [['deltaT', -100, 500], ['pressure', -2000, 2000], ['sag', 0, 200], ['visualScale', 1, 40]]) {
    if (typeof control[key] !== 'number' || !Number.isFinite(control[key]) || control[key] < min || control[key] > max) {
      throw new Error(`形变参数 ${key} 超出范围`);
    }
  }
  return control;
}

const clamp = value => Math.max(0, Math.min(1, value));

export function displacement(point, role, config, input) {
  const {mode, deltaT, pressure, sag, applied} = input;
  if (!applied) return [0, 0, 0];
  const [x, y, z] = point;
  const fraction = clamp(y / config.height);
  let dx = 0, dy = 0, dz = 0;
  if (mode === 'thermal' || mode === 'combined') {
    const strain = ALPHA * deltaT;
    dx += .1 * strain * x * fraction;
    dy += strain * y;
    dz += .1 * strain * z * fraction;
  }
  if (role === 'furnace' && (mode === 'pressure' || mode === 'combined')) {
    const t = clamp((y / config.height - .16) / .56);
    const envelope = Math.sin(Math.PI * t) ** 2;
    const qx = x / (config.width * .3), qz = z / (config.depth * .29);
    const nx = Math.sign(qx) * Math.abs(qx) ** 7, nz = Math.sign(qz) * Math.abs(qz) ** 7;
    const length = Math.hypot(nx, nz) || 1;
    const bulge = pressure * PRESSURE_COMPLIANCE_MM_PER_PA / 1000 * envelope;
    dx += bulge * nx / length;
    dz += bulge * nz / length;
  }
  if (role === 'duct' && (mode === 'sag' || mode === 'combined')) {
    const t = clamp(z / config.depth + .5);
    dy -= sag / 1000 * 4 * t * (1 - t);
  }
  return [dx, dy, dz];
}

export function fingerprint(parts, baseline = false) {
  let hash = 2166136261;
  const view = new DataView(new ArrayBuffer(4));
  for (const part of parts) {
    const array = baseline ? part.baseline : part.mesh.geometry.getAttribute('position').array;
    for (const value of array) {
      view.setFloat32(0, value, true);
      for (let i = 0; i < 4; i++) hash = Math.imul(hash ^ view.getUint8(i), 16777619) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0').toUpperCase();
}

export function applyDeformation(model, input = DEFAULT_CONTROLS, colorMap = true) {
  const control = validateControls(input);
  const {height} = model.config;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const physicalMin = [...min], physicalMax = [...max];
  let vertices = 0, moved = 0, maxActualMm = 0, maxDisplayMm = 0, displacementSum = 0;
  const probes = [];
  for (const part of model.parts) {
    const {mesh, baseline, description} = part;
    const positions = mesh.geometry.getAttribute('position');
    let colors = mesh.geometry.getAttribute('color');
    if (!colors) {
      colors = positions.clone();
      mesh.geometry.setAttribute('color', colors);
    }
    let highest = 0, mostDisplaced = 0, partMaximum = 0;
    for (let i = 0; i < positions.count; i++) {
      const point = Array.from(baseline.subarray(i * 3, i * 3 + 3));
      const delta = displacement(point, description.role, model.config, control);
      const actualMm = Math.hypot(...delta) * 1000;
      for (let axis = 0; axis < 3; axis++) {
        const physical = point[axis] + delta[axis];
        physicalMin[axis] = Math.min(physicalMin[axis], physical);
        physicalMax[axis] = Math.max(physicalMax[axis], physical);
      }
      if (delta.some(value => value !== 0)) {
        positions.setXYZ(i, ...point.map((value, axis) => value + delta[axis] * control.visualScale));
      } else {
        // Preserve the original Float32 bytes, including signed zero, on reset.
        positions.setXYZ(i, ...point);
      }
      const displayed = [positions.getX(i), positions.getY(i), positions.getZ(i)];
      const displayMm = Math.hypot(...displayed.map((value, axis) => value - point[axis])) * 1000;
      maxActualMm = Math.max(maxActualMm, actualMm);
      maxDisplayMm = Math.max(maxDisplayMm, displayMm);
      displacementSum += actualMm;
      vertices++;
      if (displayMm > .001) moved++;
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], displayed[axis]);
        max[axis] = Math.max(max[axis], displayed[axis]);
      }
      const heat = Math.min(1, actualMm / Math.max(1, ALPHA * 300 * height * 1000));
      colors.setXYZ(i, .12 + .88 * heat, .7 - .35 * heat, .84 - .63 * heat);
      if (point[1] > baseline[highest * 3 + 1]) highest = i;
      if (actualMm > partMaximum) {partMaximum = actualMm; mostDisplaced = i;}
    }
    const index = partMaximum > 0 ? mostDisplaced : highest;
    if (['roof', 'furnace', 'duct'].includes(description.role)) {
      const point = Array.from(baseline.subarray(index * 3, index * 3 + 3));
      probes.push({name: description.name, vertex: index, baseline: point,
        displayed: [positions.getX(index), positions.getY(index), positions.getZ(index)],
        actualMm: Math.hypot(...displacement(point, description.role, model.config, control)) * 1000});
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    mesh.material.vertexColors = colorMap;
    mesh.material.color.set(colorMap ? 0xffffff : description.role === 'platform' ? 0x3f7285 : 0x9ed9df);
    mesh.material.needsUpdate = true;
  }
  return {vertices, moved, maxActualMm, maxDisplayMm, averageActualMm: displacementSum / vertices,
    baselineHash: fingerprint(model.parts, true), currentHash: fingerprint(model.parts),
    physicalBox: physicalMax.map((value, axis) => value - physicalMin[axis]),
    displayedBox: max.map((value, axis) => value - min[axis]),
    rootScale: model.group.scale.toArray(), probes: probes.slice(0, 4),
    residualMm: !control.applied ? maxDisplayMm : null};
}
