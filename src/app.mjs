import './style.css';
import {DEFAULT_CONFIG, validateConfig, createModel, disposeModel} from './model.mjs';
import {DEFAULT_CONTROLS, applyDeformation, ALPHA} from './deformation.mjs';
import {BoilerView} from './scene.mjs';
import {exportGLB, exportSTL, freecadMacro, parameterDocument, parseParameterDocument} from './exporters.mjs';

const root = document.querySelector('#app');
const slider = (id, label, min, max, step, value, unit) => `<label class="slider" for="${id}"><span>${label}<output id="${id}-value">${value} ${unit}</output></span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}"></label>`;
root.innerHTML = `
<main class="shell">
  <header class="topbar">
    <div class="identity"><div class="brand-mark">◇</div><div><p class="eyebrow">PARAMETRIC BOILER LAB / OPEN RESEARCH DEMO</p><h1>参数化锅炉实验室</h1></div></div>
    <div class="top-actions"><span class="tag"><i></i> 本地解析计算</span><button id="method-open" class="button secondary">数据与方法 ↗</button></div>
  </header>
  <div class="truth-banner"><span>◈</span><p><b>全合成演示模型</b> · 几何由参数实时生成。位移场用于理解形变与网格处理，未经有限元或实测标定。</p><span class="banner-note">NO PLANT DATA / NO TELEMETRY</span></div>
  <div class="hero-grid">
    <section class="viewport-card">
      <div class="panel-heading"><h2><i></i> 形变观察窗 <small>DIRECT VERTEX DISPLACEMENT</small></h2><span class="legend">低位移 <b></b> 高位移</span></div>
      <div id="scene" class="scene"><div class="view-top"><span id="geometry-state" class="view-badge">初始化几何…</span><button id="camera-reset" class="icon-button" aria-label="复位三维视角" title="复位三维视角">↺</button></div><div class="scene-corner">Y ↑ · m<br>根节点缩放 <b id="root-scale">1 / 1 / 1</b></div><div class="scene-hint">拖拽旋转 · 滚轮缩放 · 右键平移</div></div>
      <div class="metric-strip"><div><span>未放大解析位移 / 最大</span><strong id="max-actual">—</strong><small>毫米 · 解析场计算</small></div><div><span>画面顶点位移 / 最大</span><strong id="max-display">—</strong><small id="display-note">视觉放大</small></div><div><span>实际移动顶点记录</span><strong id="moved">—</strong><small id="total">—</small></div></div>
    </section>
    <aside class="control-card">
      <div class="panel-heading"><h2>输入与显示 <small>CONTROL PANEL</small></h2><span class="small-tag">SYNTHETIC</span></div>
      <div class="control-body">
        <div class="section-label"><span>01 / 位移场</span><small>三种方法，可叠加</small></div>
        <div class="mode-grid" role="group" aria-label="形变模式"><button data-mode="thermal" class="mode active">↟<span>热伸长</span></button><button data-mode="pressure" class="mode">↔<span>壁面鼓胀</span></button><button data-mode="sag" class="mode">⌄<span>烟道下挠</span></button><button data-mode="combined" class="mode">⊕<span>组合形变</span></button></div>
        ${slider('deltaT', '等效温差 ΔT', -100, 500, 5, DEFAULT_CONTROLS.deltaT, 'K')}
        ${slider('pressure', '内外压差 Δp', -2000, 2000, 25, DEFAULT_CONTROLS.pressure, 'Pa')}
        ${slider('sag', '烟道指定挠度', 0, 200, 1, DEFAULT_CONTROLS.sag, 'mm')}
        ${slider('visualScale', '仅画面位移倍率', 1, 40, 1, DEFAULT_CONTROLS.visualScale, '×')}
        <div class="control-buttons"><button id="apply" class="button primary">应用形变</button><button id="restore" class="button secondary">复位几何</button></div>
        <div class="options"><label><input id="reference" type="checkbox" checked> 基准 Ghost 轮廓</label><label><input id="wireframe" type="checkbox" checked> 当前网格线框</label><label><input id="colorMap" type="checkbox" checked> 位移云图</label><label><input id="cameraLocked" type="checkbox"> 锁定相机</label></div>
        <details class="geometry-editor"><summary>02 / 修改虚构几何参数</summary><div class="dimension-grid">${['width','depth','height'].map((key, index) => `<label for="${key}">${['宽度 W','深度 D','高度 H'][index]} / m<input id="${key}" type="number" min="${key === 'height' ? 20 : 8}" max="${key === 'height' ? 100 : 60}" value="${DEFAULT_CONFIG[key]}" step="1"></label>`).join('')}</div><button id="rebuild" class="button secondary full">从参数重新生成</button><p>只修改演示几何，不读取任何原设备资产。</p></details>
        <details class="export-options"><summary>03 / 导入与导出</summary><div class="export-grid"><button id="export-glb" class="button secondary">GLB · 1× 位移</button><button id="export-stl" class="button secondary">STL · Z-up mm</button><button id="export-parameters" class="button secondary">参数 JSON</button><button id="export-audit" class="button secondary">审计 JSON</button><button id="export-cad" class="button secondary">FreeCAD 宏</button><button id="import-button" class="button secondary">导入参数</button></div><input id="import-file" type="file" accept=".json,application/json" hidden><p>模型导出使用未放大的解析位移；CAD 宏生成未形变参考装配。</p></details>
      </div>
    </aside>
  </div>
  <div class="lower-grid">
    <section class="audit-card"><div class="panel-heading"><h2>顶点与坐标审计 <small>GEOMETRY BUFFER AUDIT</small></h2><span id="proof-state" class="small-tag">—</span></div><div class="hash-grid"><div><span>基准顶点指纹</span><code id="baseline-hash">—</code></div><div><span>当前缓冲区指纹</span><code id="current-hash">—</code></div><div><span>解析平均位移</span><strong id="mean-displacement">—</strong></div><div><span>复位最大残差</span><strong id="residual">—</strong></div></div><div class="bounds"><div><span>原始外包络 W × D × H</span><b id="original-box">—</b></div><div><span>未放大解析场外包络</span><b id="physical-box">—</b></div><div><span>当前显示外包络</span><b id="displayed-box">—</b></div></div><div class="table-wrap"><table><caption>从实际网格顶点选取的局部探针</caption><thead><tr><th>部件 / 顶点</th><th>基准 X / Y / Z · m</th><th>当前 X / Y / Z · m</th><th>解析位移</th></tr></thead><tbody id="probes"></tbody></table></div></section>
    <section class="event-card"><div class="panel-heading"><h2>操作记录 <small>SESSION EVENTS</small></h2><span class="small-tag">仅当前会话</span></div><ol id="events" class="event-list"></ol><div class="formula"><span>顶部热伸长参考</span><code>δ = α · ΔT · H</code><p id="thermal-reference"></p><small>显示倍率只改变画面，导出默认为 1× 解析场。</small></div></section>
  </div>
  <footer><span>GEOMETRY / 程序生成的虚构装配</span><span>METHOD / 逐顶点解析位移 · 非有限元</span><a href="https://github.com/BoomShuai/parametric-boiler-lab" target="_blank" rel="noreferrer">SOURCE / MIT ↗</a></footer>
  <div id="notice" class="notice" role="status" aria-live="polite"></div>
  <dialog id="method-dialog"><button id="method-close" class="icon-button dialog-close" aria-label="关闭方法说明">×</button><p class="eyebrow">DATA PROVENANCE & MODEL BOUNDARY</p><h2>几何、方法与使用边界</h2><div class="logic-chain">虚构参数 → 基本体装配 → 解析位移 → 顶点审计</div><h3>全合成几何</h3><p>使用灰斗放样、炉膛箱体、上部塔段、左右风道和平台构成演示装配。默认外包络为 24 × 20 × 54 m，全部尺寸为软件示例设定。</p><h3>三种示意位移场</h3><p>热伸长使用均匀线膨胀，底面固定；壁面鼓胀使用沿高度的正弦包络；烟道下挠使用两端为零的抛物线。每次都从不可变基准顶点重新计算，不叠加上一次形变。</p><h3>可视化与导出</h3><p>显示倍率仅影响画面。GLB 使用 Y 轴向上、米；STL 转换为 Z 轴向上、毫米。FreeCAD 宏为未形变装配参考，可在 FreeCAD 中另存 FCStd / STEP。</p><div class="method-warning">这是几何实验，不包含真实工况、材料标定、应力求解、CAD 布尔并集或安全评价。FNV 顶点指纹仅用于比较缓冲区，不是密码学签名。</div></dialog>
</main>`;

let config = {...DEFAULT_CONFIG}, controls = {...DEFAULT_CONTROLS};
let display = {reference: true, wireframe: true, colorMap: true, cameraLocked: false};
let audit, view, fallback;
let events = [], sequence = 0, pending = false;
const $ = id => document.getElementById(id);
const format = value => value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const vector = values => values.map(value => value.toFixed(3)).join(' / ');
function notify(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}
function log(message) {
  events = [{id: ++sequence, message}, ...events].slice(0, 8);
  $('events').replaceChildren(...events.map(event => {
    const item = document.createElement('li');
    const number = document.createElement('span');
    number.textContent = String(event.id).padStart(2, '0');
    const paragraph = document.createElement('p');
    paragraph.textContent = event.message;
    item.append(number, paragraph);
    return item;
  }));
}

try { view = new BoilerView($('scene')); }
catch {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.className = 'webgl-error';
  message.textContent = '当前环境无法创建 WebGL 视窗。仍可调整参数、查看解析审计并导出模型。';
  $('scene').append(message);
  log('WebGL 不可用，已启用解析计算模式');
}

function render() {
  try {
    if (view) audit = view.update(config, controls, display);
    else {
      if (!fallback || JSON.stringify(fallback.config) !== JSON.stringify(config)) {
        if (fallback) disposeModel(fallback);
        fallback = createModel(config);
      }
      audit = applyDeformation(fallback, controls, display.colorMap);
    }
    $('max-actual').textContent = format(audit.maxActualMm) + ' mm';
    $('max-display').textContent = format(audit.maxDisplayMm) + ' mm';
    $('display-note').textContent = `视觉放大 ${controls.visualScale}× · 缓冲区实测`;
    $('moved').textContent = audit.moved.toLocaleString('en-US');
    $('total').textContent = `共 ${audit.vertices.toLocaleString('en-US')} 条顶点记录`;
    $('baseline-hash').textContent = audit.baselineHash;
    $('current-hash').textContent = audit.currentHash;
    $('mean-displacement').textContent = format(audit.averageActualMm) + ' mm';
    $('residual').textContent = audit.residualMm === null ? '—' : audit.residualMm.toFixed(6) + ' mm';
    $('original-box').textContent = [config.width, config.depth, config.height].map(n => n.toFixed(3)).join(' × ') + ' m';
    $('physical-box').textContent = [audit.physicalBox[0], audit.physicalBox[2], audit.physicalBox[1]].map(n => n.toFixed(3)).join(' × ') + ' m';
    $('displayed-box').textContent = [audit.displayedBox[0], audit.displayedBox[2], audit.displayedBox[1]].map(n => n.toFixed(3)).join(' × ') + ' m';
    const changed = audit.currentHash !== audit.baselineHash;
    $('geometry-state').textContent = changed ? '解析形变已应用' : '基准几何';
    $('proof-state').textContent = changed ? '顶点缓冲区已改变' : '与基准一致';
    $('root-scale').textContent = audit.rootScale.join(' / ');
    $('thermal-reference').textContent = `α = ${ALPHA} / K · H = ${config.height} m · 顶部参考 ${format(ALPHA * controls.deltaT * config.height * 1000)} mm`;
    $('probes').replaceChildren(...audit.probes.map(probe => {
      const row = document.createElement('tr');
      for (const value of [`${probe.name} #${probe.vertex}`, vector(probe.baseline), vector(probe.displayed), format(probe.actualMm) + ' mm']) {
        const cell = document.createElement('td');cell.textContent = value;row.append(cell);
      }
      return row;
    }));
    $('scene').dataset.ready = view ? 'true' : 'fallback';
  } catch { notify('计算失败，请检查参数范围后重新生成。', true); }
}
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {pending = false;render();});
}
function syncInputs() {
  for (const key of ['deltaT','pressure','sag','visualScale']) {
    $(key).value = controls[key];
    $(`${key}-value`).textContent = `${controls[key]} ${$(key).dataset.unit}`;
  }
  for (const key of ['width','depth','height']) $(key).value = config[key];
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === controls.mode);
    button.setAttribute('aria-pressed', String(button.dataset.mode === controls.mode));
  });
}
for (const key of ['deltaT','pressure','sag','visualScale']) {
  $(key).addEventListener('input', () => {
    controls[key] = Number($(key).value);
    $(`${key}-value`).textContent = `${controls[key]} ${$(key).dataset.unit}`;
    schedule();
  });
  $(key).addEventListener('change', () => log(`调整 ${key} → ${controls[key]}`));
}
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  controls.mode = button.dataset.mode;controls.applied = true;syncInputs();render();log(`切换形变模式 → ${button.textContent.trim()}`);
}));
for (const key of Object.keys(display)) $(key).addEventListener('change', () => {display[key] = $(key).checked;schedule();});
$('apply').addEventListener('click', () => {controls.applied = true;render();log('已从基准重新计算形变');});
$('restore').addEventListener('click', () => {controls.applied = false;render();log('已精确回写不可变基准顶点');});
$('camera-reset').addEventListener('click', () => view?.resetCamera());
$('rebuild').addEventListener('click', () => {
  try {
    config = validateConfig({...config, ...Object.fromEntries(['width','depth','height'].map(key => [key, Number($(key).value)]))});
    render();notify('已从新参数生成演示几何');log('参数化几何重新生成');
  } catch {notify('宽度和深度需为 8–60 m，高度需为 20–100 m。', true);}
});
$('method-open').addEventListener('click', () => $('method-dialog').showModal());
$('method-close').addEventListener('click', () => $('method-dialog').close());

function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], {type}));
  const anchor = document.createElement('a');anchor.href = url;anchor.download = name;anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
for (const [id, action] of Object.entries({
  'export-glb': async () => {const {binary} = await exportGLB(config, controls);download(binary, 'boiler-physical.glb', 'model/gltf-binary');},
  'export-stl': () => {const data = exportSTL(config, controls);download(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), 'boiler-z-up-mm.stl', 'model/stl');},
  'export-parameters': () => download(JSON.stringify(parameterDocument(config, controls), null, 2), 'boiler-parameters.json', 'application/json'),
  'export-audit': () => download(JSON.stringify({schema: 1, ...parameterDocument(config, controls), audit}, null, 2), 'boiler-audit.json', 'application/json'),
  'export-cad': () => download(freecadMacro(config), 'synthetic-reference.FCMacro', 'text/plain'),
})) {
  $(id).addEventListener('click', async () => {
    $(id).disabled = true;
    try {await action();notify('导出完成');log($(id).textContent + ' 导出完成');}
    catch {notify('导出失败，请检查浏览器下载权限后重试。', true);}
    finally {$(id).disabled = false;}
  });
}
$('import-button').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async () => {
  try {
    const file = $('import-file').files[0];
    if (!file) return;
    if (file.size > 16384) throw new Error('too large');
    const parsed = parseParameterDocument(JSON.parse(await file.text()));
    config = parsed.config;controls = parsed.controls;
    syncInputs();render();notify('已载入参数');log('已载入参数文件');
  } catch {notify('导入失败：请使用本项目导出的有效参数 JSON（最多 16 KiB）。', true);}
  finally {$('import-file').value = '';}
});
window.addEventListener('beforeunload', () => {view?.dispose();if (fallback) disposeModel(fallback);});
syncInputs();render();log('合成几何已生成，开始探索解析形变');
