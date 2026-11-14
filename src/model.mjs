import * as THREE from 'three';

export const DEFAULT_CONFIG = Object.freeze({width: 24, depth: 20, height: 54, segments: 10});
export const CONFIG_RANGES = Object.freeze({width: [8, 60], depth: [8, 60], height: [20, 100], segments: [2, 20]});

export function validateConfig(input = DEFAULT_CONFIG) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('参数必须是对象');
  if (Object.keys(input).some(key => !Object.hasOwn(DEFAULT_CONFIG, key))) throw new Error('存在未知几何参数');
  const config = {...DEFAULT_CONFIG, ...input};
  for (const [key, [min, max]] of Object.entries(CONFIG_RANGES)) {
    if (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || config[key] < min || config[key] > max) {
      throw new Error(`几何参数 ${key} 超出范围`);
    }
  }
  if (!Number.isInteger(config.segments)) throw new Error('网格分段数必须是整数');
  return config;
}

export function describeParts(input = DEFAULT_CONFIG) {
  const {width: w, depth: d, height: h} = validateConfig(input);
  const parts = [
    {name: 'hopper', kind: 'loft', role: 'hopper', y0: 0, y1: h * .16, bottom: [w * .18, d * .2], top: [w * .6, d * .58]},
    {name: 'furnace', kind: 'box', role: 'furnace', center: [0, h * .44, 0], size: [w * .6, h * .56, d * .58]},
    {name: 'upper-tower', kind: 'box', role: 'tower', center: [0, h * .83, 0], size: [w * .66, h * .22, d * .64]},
    {name: 'roof', kind: 'loft', role: 'roof', y0: h * .94, y1: h, bottom: [w * .66, d * .64], top: [w * .4, d * .4]},
  ];
  for (const sign of [-1, 1]) {
    parts.push({name: sign < 0 ? 'left-duct' : 'right-duct', kind: 'box', role: 'duct',
      center: [sign * w * .41, h * .48, 0], size: [w * .18, h * .2, d]});
  }
  for (const [index, ratio] of [.24, .52, .76].entries()) {
    parts.push({name: `platform-${index + 1}`, kind: 'box', role: 'platform',
      center: [0, h * ratio, 0], size: [w * .82, h * .012, d * .78]});
  }
  return parts;
}

function partGeometry(part, segments) {
  let geometry;
  if (part.kind === 'box') {
    geometry = new THREE.BoxGeometry(...part.size, segments, segments, segments);
    geometry.translate(...part.center);
  } else {
    geometry = new THREE.BoxGeometry(1, 1, 1, segments, segments, segments);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const t = positions.getY(i) + .5;
      positions.setXYZ(i, positions.getX(i) * THREE.MathUtils.lerp(part.bottom[0], part.top[0], t),
        THREE.MathUtils.lerp(part.y0, part.y1, t),
        positions.getZ(i) * THREE.MathUtils.lerp(part.bottom[1], part.top[1], t));
    }
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export function createModel(input = DEFAULT_CONFIG) {
  const config = validateConfig(input);
  const group = new THREE.Group();
  group.name = 'synthetic-parametric-boiler';
  const parts = describeParts(config).map(description => {
    const geometry = partGeometry(description, config.segments);
    const material = new THREE.MeshStandardMaterial({color: description.role === 'platform' ? 0x3f7285 : 0x9ed9df,
      metalness: .48, roughness: .42, side: THREE.DoubleSide});
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = description.name;
    group.add(mesh);
    return {mesh, description, baseline: geometry.getAttribute('position').array.slice()};
  });
  return {config, group, parts};
}

export function disposeModel(model) {
  for (const {mesh} of model.parts) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
}
