import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createModel, disposeModel} from './model.mjs';
import {applyDeformation} from './deformation.mjs';

export class BoilerView {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07141c);
    this.scene.fog = new THREE.FogExp2(0x07141c, .006);
    this.camera = new THREE.PerspectiveCamera(36, 1, .1, 1000);
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.setAttribute('aria-label', '可旋转缩放的虚构锅炉三维模型');
    this.renderer.domElement.setAttribute('role', 'img');
    host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * .87;
    this.scene.add(new THREE.HemisphereLight(0xb5ecff, 0x13232d, 2.2));
    const key = new THREE.DirectionalLight(0xf1f8ff, 4);
    key.position.set(40, 90, 50);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x36bbff, 2.5);
    rim.position.set(-30, 40, -40);
    this.scene.add(rim);
    const grid = new THREE.GridHelper(140, 35, 0x257080, 0x122e3d);
    grid.material.transparent = true;
    grid.material.opacity = .55;
    this.scene.add(grid);
    this.grid = grid;
    this.ghostMaterial = new THREE.LineBasicMaterial({color: 0xe4f6ff, transparent: true, opacity: .24, depthTest: false});
    this.wireMaterial = new THREE.MeshBasicMaterial({color: 0x0d3445, wireframe: true, transparent: true, opacity: .2});
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  clearModel() {
    if (!this.model) return;
    this.scene.remove(this.model.group, this.ghost);
    this.ghost.traverse(child => {if (child.geometry) child.geometry.dispose();});
    disposeModel(this.model);
  }

  update(config, controls, display) {
    if (JSON.stringify(config) !== this.configKey) {
      this.clearModel();
      this.model = createModel(config);
      this.configKey = JSON.stringify(config);
      this.ghost = new THREE.Group();
      this.wires = [];
      for (const {mesh} of this.model.parts) {
        this.ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), this.ghostMaterial));
        const wire = new THREE.Mesh(mesh.geometry, this.wireMaterial);
        mesh.add(wire);
        this.wires.push(wire);
      }
      this.scene.add(this.model.group, this.ghost);
      this.resetCamera();
    }
    this.ghost.visible = display.reference;
    this.wires.forEach(mesh => {mesh.visible = display.wireframe;});
    this.controls.enabled = !display.cameraLocked;
    return applyDeformation(this.model, controls, display.colorMap);
  }

  resetCamera() {
    if (!this.model) return;
    const {width, depth, height} = this.model.config;
    const size = Math.max(width, depth, height);
    this.camera.position.set(size * 1.28, height * .88, size * 1.65);
    this.controls.target.set(0, height * .48, 0);
    this.controls.minDistance = size * .25;
    this.controls.maxDistance = size * 6;
    this.controls.update();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.controls.dispose();
    this.clearModel();
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.ghostMaterial.dispose();
    this.wireMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
