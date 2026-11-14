import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {createModel, DEFAULT_CONFIG, validateConfig, disposeModel} from '../src/model.mjs';
import {applyDeformation, displacement, DEFAULT_CONTROLS, validateControls, ALPHA} from '../src/deformation.mjs';
import {exportGLB, exportSTL, parseParameterDocument, parameterDocument, freecadMacro} from '../src/exporters.mjs';
import {writeBundle} from '../scripts/export.mjs';

const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const vectorClose = (actual, expected, tolerance) => actual.forEach((value, index) => close(value, expected[index], tolerance));

test('synthetic assembly has configured world bounds and finite coordinates', () => {
  const model = createModel();
  try {
    assert.equal(model.parts.length, 9);
    const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    vectorClose(size.toArray(), [24, 54, 20]);
    for (const part of model.parts) assert.ok(part.baseline.every(Number.isFinite));
    assert.deepEqual(model.group.scale.toArray(), [1, 1, 1]);
  } finally {disposeModel(model);}
});

test('regeneration changes dimensions rather than applying a root scale', () => {
  const model = createModel({width: 32, depth: 26, height: 70, segments: 4});
  try {
    vectorClose(new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3()).toArray(), [32, 70, 26]);
    assert.deepEqual(model.group.scale.toArray(), [1, 1, 1]);
  } finally {disposeModel(model);}
});

test('invalid and unknown geometry parameters are rejected', () => {
  for (const config of [{width: 0}, {height: NaN}, {depth: Infinity}, {segments: 2.5}, {width: '24'}, {privatePath: 'example'}]) {
    assert.throws(() => validateConfig(config));
  }
});

test('invalid and unknown displacement parameters are rejected', () => {
  for (const controls of [{mode: 'unknown'}, {deltaT: Infinity}, {visualScale: 0}, {pressure: '1'}, {applied: 1}, {filename: 'example'}]) {
    assert.throws(() => validateControls(controls));
  }
});

test('thermal axis displacement matches alpha*deltaT*height and fixes ground', () => {
  const controls = {...DEFAULT_CONTROLS, deltaT: 100, mode: 'thermal'};
  vectorClose(displacement([0, 54, 0], 'roof', DEFAULT_CONFIG, controls), [0, .0594, 0], 1e-12);
  vectorClose(displacement([3, 0, 2], 'hopper', DEFAULT_CONFIG, controls), [0, 0, 0]);
  vectorClose(displacement([0, 54, 0], 'roof', DEFAULT_CONFIG, {...controls, deltaT: -100}), [0, -.0594, 0], 1e-12);
});

test('pressure field peaks at furnace midpoint and vanishes at endpoints and other parts', () => {
  const controls = {...DEFAULT_CONTROLS, mode: 'pressure', pressure: 400};
  vectorClose(displacement([7.2, 54 * .44, 0], 'furnace', DEFAULT_CONFIG, controls), [.006, 0, 0], 1e-12);
  for (const y of [54 * .16, 54 * .72]) vectorClose(displacement([7.2, y, 0], 'furnace', DEFAULT_CONFIG, controls), [0, 0, 0]);
  vectorClose(displacement([7.2, 54 * .44, 0], 'tower', DEFAULT_CONFIG, controls), [0, 0, 0]);
  vectorClose(displacement([7.2, 54 * .44, 0], 'furnace', DEFAULT_CONFIG, {...controls, pressure: -400}), [-.006, 0, 0], 1e-12);
});

test('duct sag is zero at the ends and reaches specified millimetres at midspan', () => {
  const controls = {...DEFAULT_CONTROLS, mode: 'sag', sag: 18};
  vectorClose(displacement([9, 25, 0], 'duct', DEFAULT_CONFIG, controls), [0, -.018, 0]);
  for (const z of [-10, 10]) vectorClose(displacement([9, 25, z], 'duct', DEFAULT_CONFIG, controls), [0, 0, 0]);
  vectorClose(displacement([9, 25, 0], 'furnace', DEFAULT_CONFIG, controls), [0, 0, 0]);
});

test('combined mode adds the individual analytic fields', () => {
  for (const role of ['furnace', 'duct']) {
    const point = [7.2, 24, 2];
    const fields = ['thermal', 'pressure', 'sag'].map(mode => displacement(point, role, DEFAULT_CONFIG, {...DEFAULT_CONTROLS, mode}));
    const sum = [0, 1, 2].map(axis => fields.reduce((total, field) => total + field[axis], 0));
    vectorClose(displacement(point, role, DEFAULT_CONFIG, {...DEFAULT_CONTROLS, mode: 'combined'}), sum, 1e-12);
  }
});

for (const mode of ['thermal', 'pressure', 'sag', 'combined']) {
  test(`${mode} changes buffers and reset restores baseline bytes without accumulation`, () => {
    const model = createModel();
    try {
      const original = model.parts.map(part => part.baseline.slice());
      const first = applyDeformation(model, {...DEFAULT_CONTROLS, mode});
      assert.notEqual(first.currentHash, first.baselineHash);
      assert.ok(first.moved > 0 && first.maxActualMm > 0);
      const second = applyDeformation(model, {...DEFAULT_CONTROLS, mode});
      assert.equal(second.currentHash, first.currentHash);
      const reset = applyDeformation(model, {...DEFAULT_CONTROLS, mode, applied: false});
      assert.equal(reset.currentHash, reset.baselineHash);
      assert.equal(reset.residualMm, 0);
      model.parts.forEach((part, index) => {
        assert.deepEqual(part.baseline, original[index]);
        assert.deepEqual(part.mesh.geometry.getAttribute('position').array, original[index]);
      });
    } finally {disposeModel(model);}
  });
}

test('display exaggeration does not alter analytic displacement or physical bounds', () => {
  const model = createModel();
  try {
    const one = applyDeformation(model, {...DEFAULT_CONTROLS, visualScale: 1});
    const twenty = applyDeformation(model, {...DEFAULT_CONTROLS, visualScale: 20});
    assert.equal(one.maxActualMm, twenty.maxActualMm);
    assert.deepEqual(one.physicalBox, twenty.physicalBox);
    close(twenty.maxDisplayMm / 20, one.maxDisplayMm, .01);
  } finally {disposeModel(model);}
});

test('GLB reopens with physical displacement independent of the visual scale', async () => {
  const first = await exportGLB(DEFAULT_CONFIG, {...DEFAULT_CONTROLS, visualScale: 1});
  const second = await exportGLB(DEFAULT_CONFIG, {...DEFAULT_CONTROLS, visualScale: 40});
  const loader = new GLTFLoader();
  const a = await loader.parseAsync(first.binary, '');
  const b = await loader.parseAsync(second.binary, '');
  const boundsA = new THREE.Box3().setFromObject(a.scene).getSize(new THREE.Vector3()).toArray();
  const boundsB = new THREE.Box3().setFromObject(b.scene).getSize(new THREE.Vector3()).toArray();
  vectorClose(boundsA, boundsB, 1e-8);
  close(boundsA[1], 54 * (1 + ALPHA * DEFAULT_CONTROLS.deltaT), 1e-5);
  assert.equal(first.audit.maxActualMm, second.audit.maxActualMm);
});

test('binary STL round-trip uses Z-up and millimetres', () => {
  const data = exportSTL(DEFAULT_CONFIG, {...DEFAULT_CONTROLS, applied: false});
  const geometry = new STLLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  geometry.computeBoundingBox();
  vectorClose(geometry.boundingBox.getSize(new THREE.Vector3()).toArray(), [24000, 20000, 54000], .01);
  close(geometry.boundingBox.min.z, 0);
  geometry.dispose();
});

test('parameter document is validated before use', () => {
  const document = parameterDocument(DEFAULT_CONFIG, DEFAULT_CONTROLS);
  const parsed = parseParameterDocument(JSON.parse(JSON.stringify(document)));
  assert.deepEqual(parsed.config, DEFAULT_CONFIG);
  assert.deepEqual(parsed.controls, DEFAULT_CONTROLS);
  assert.throws(() => parseParameterDocument({schema: 2}));
});

test('FreeCAD macro is generated from primitives and has valid Python syntax', () => {
  const source = freecadMacro(DEFAULT_CONFIG);
  assert.ok(source.includes('Part.makeBox') && source.includes('Part.makeLoft'));
  assert.ok(!source.includes('saveAs(') && !source.includes('export('));
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, ['-c', 'import ast,sys;ast.parse(sys.stdin.read())'], {input: source});
  assert.equal(result.status, 0, result.stderr?.toString());
});

test('CLI bundle hashes payloads, does not contain local paths and refuses overwrite', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'boiler-bundle-'));
  try {
    const directory = path.join(temporary, 'new output');
    const manifest = await writeBundle(directory);
    assert.equal((await readdir(directory)).length, 5);
    for (const file of manifest.files) {
      const data = await readFile(path.join(directory, file.name));
      assert.equal(file.sha256, createHash('sha256').update(data).digest('hex'));
      assert.equal(file.bytes, data.length);
    }
    assert.ok(!JSON.stringify(manifest).includes(temporary));
    await assert.rejects(() => writeBundle(directory));
    const after = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    assert.deepEqual(after, manifest);
  } finally {await rm(temporary, {recursive: true, force: true});}
});
