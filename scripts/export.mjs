import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {DEFAULT_CONFIG} from '../src/model.mjs';
import {DEFAULT_CONTROLS} from '../src/deformation.mjs';
import {exportGLB, exportSTL, freecadMacro, parameterDocument, parseParameterDocument} from '../src/exporters.mjs';

// GLTFExporter expects the browser FileReader interface even when only writing buffers.
if (!globalThis.FileReader) {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(result => {this.result = result; this.onloadend?.();}, error => this.onerror?.(error));
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then(result => {
        this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
        this.onloadend?.();
      }, error => this.onerror?.(error));
    }
  };
}

export async function writeBundle(destination, config = DEFAULT_CONFIG, controls = DEFAULT_CONTROLS) {
  const parameters = parameterDocument(config, controls);
  const output = path.resolve(destination);
  // Exclusive directory creation protects any existing files at the destination.
  await mkdir(path.dirname(output), {recursive: true});
  await mkdir(output);
  const {binary, audit} = await exportGLB(config, controls);
  const stl = exportSTL(config, controls);
  const files = new Map([
    ['boiler.glb', Buffer.from(binary)],
    ['boiler-z-up-mm.stl', Buffer.from(stl.buffer, stl.byteOffset, stl.byteLength)],
    ['synthetic-reference.FCMacro', Buffer.from(freecadMacro(config))],
    ['parameters.json', Buffer.from(JSON.stringify(parameters, null, 2) + '\n')],
  ]);
  const manifest = {schema: 1, source: 'user-defined-synthetic-primitives', displacementScale: 1,
    cadMacroScope: 'Undeformed reference assembly; CAD units are millimetres.',
    glbFrame: 'X,Y-up,Z; metres', stlFrame: 'CAD=(webX,-webZ,webY); millimetres, Z-up',
    audit, files: []};
  for (const [name, data] of files) {
    await writeFile(path.join(output, name), data, {flag: 'wx'});
    manifest.files.push({name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex')});
  }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
  return manifest;
}

export async function main(args = process.argv.slice(2)) {
  try {
    const {values} = parseArgs({args, options: {output: {type: 'string'}, parameters: {type: 'string'}, help: {type: 'boolean'}}});
    if (values.help) {
      console.log('node scripts/export.mjs --output NEW_DIRECTORY [--parameters parameters.json]');
      return 0;
    }
    if (!values.output) throw new Error('Missing new output directory');
    let config = DEFAULT_CONFIG, controls = DEFAULT_CONTROLS;
    if (values.parameters) {
      const data = await readFile(values.parameters);
      if (data.length > 16384) throw new Error('Parameter file too large');
      ({config, controls} = parseParameterDocument(JSON.parse(data.toString('utf8'))));
    }
    const manifest = await writeBundle(values.output, config, controls);
    console.log(JSON.stringify({ok: true, files: manifest.files.map(file => file.name), vertices: manifest.audit.vertices}));
    return 0;
  } catch {
    console.error('Export failed: check parameter schema, dependencies and a new writable output directory.');
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
