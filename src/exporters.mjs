import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {STLExporter} from 'three/addons/exporters/STLExporter.js';
import {createModel, disposeModel, validateConfig, describeParts} from './model.mjs';
import {applyDeformation, validateControls, DEFAULT_CONTROLS} from './deformation.mjs';

export function parameterDocument(config, controls) {
  return {schema: 1, geometry: validateConfig(config), deformation: validateControls(controls),
    units: {geometry: 'metres', pressure: 'Pa', sag: 'mm', temperatureDifference: 'K'},
    scope: 'User-defined illustrative geometry and analytic displacement. Not a measured asset or FEM result.'};
}

export function parseParameterDocument(value) {
  if (!value || value.schema !== 1 || !value.geometry || !value.deformation) throw new Error('不支持的参数文件');
  return {config: validateConfig(value.geometry), controls: validateControls(value.deformation)};
}

export async function exportGLB(config, input = DEFAULT_CONTROLS) {
  const controls = {...validateControls(input), visualScale: 1};
  const model = createModel(config);
  try {
    const audit = applyDeformation(model, controls, false);
    const scene = new THREE.Scene();
    scene.name = 'synthetic-boiler-physical-displacement';
    scene.userData = {scope: 'synthetic', displacementScale: 1, units: 'metres', upAxis: 'Y'};
    scene.add(model.group);
    const binary = await new GLTFExporter().parseAsync(scene, {binary: true});
    return {binary, audit};
  } finally {
    disposeModel(model);
  }
}

export function exportSTL(config, input = DEFAULT_CONTROLS) {
  const model = createModel(config);
  try {
    applyDeformation(model, {...validateControls(input), visualScale: 1}, false);
    // Right-handed conversion: (X,Y,Z) metres -> (X,-Z,Y) millimetres.
    model.group.rotation.x = Math.PI / 2;
    model.group.scale.setScalar(1000);
    model.group.updateMatrixWorld(true);
    return new STLExporter().parse(model.group, {binary: true});
  } finally {
    disposeModel(model);
  }
}

export function freecadMacro(input) {
  const config = validateConfig(input);
  const json = JSON.stringify(describeParts(config));
  return `# Generated synthetic reference assembly. No deformed or measured geometry.
import json
from pathlib import Path
import FreeCAD as App
import Part

parts = json.loads(${JSON.stringify(json)})
doc = App.newDocument("SyntheticBoiler")

def rectangle(width, depth, z):
    w, d = width * 500, depth * 500
    return Part.makePolygon([App.Vector(-w,-d,z), App.Vector(w,-d,z), App.Vector(w,d,z), App.Vector(-w,d,z), App.Vector(-w,-d,z)])

objects = []
for description in parts:
    if description["kind"] == "box":
        x, y, z = description["center"]
        w, h, d = description["size"]
        shape = Part.makeBox(w*1000, d*1000, h*1000, App.Vector((x-w/2)*1000, -(z+d/2)*1000, (y-h/2)*1000))
    else:
        bottom = rectangle(*description["bottom"], description["y0"]*1000)
        top = rectangle(*description["top"], description["y1"]*1000)
        shape = Part.makeLoft([bottom,top], True, True)
    obj = doc.addObject("PartDesign::Feature", description["name"].replace("-","_"))
    obj.Label = description["name"]
    obj.Shape = shape
    objects.append(obj)
doc.recompute()
if App.GuiUp:
    import FreeCADGui as Gui
    Gui.activeDocument().activeView().viewAxonometric()
    Gui.activeDocument().activeView().fitAll()
# Save manually to a chosen new directory. This macro does not overwrite files.
print("Created synthetic CAD reference assembly in millimetres; export FCStd/STEP from FreeCAD.")
`;
}
