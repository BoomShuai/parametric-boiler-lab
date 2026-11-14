# Parametric Boiler Lab · 参数化锅炉实验室

[![CI](https://github.com/BoomShuai/parametric-boiler-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/BoomShuai/parametric-boiler-lab/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

一个可本地运行的参数化三维建模与解析形变实验平台。用虚构参数生成锅炉形状的演示装配，在浏览器中探索热伸长、壁面鼓胀和烟道下挠，检查顶点缓冲区、导出模型，并生成可编辑 CAD 参考宏。

公开版本将已有建模与形变工作流整理为通用方法，所有示例几何均由程序重新生成。没有附带任何实际设备模型、测点、企业资料或实测尺寸。

| 功能 | 内容 |
| --- | --- |
| 参数化几何 | 灰斗放样、炉膛、塔段、炉顶、双侧风道、平台；可修改外包络 |
| 三维交互 | 旋转/缩放/平移、基准 Ghost、线框、位移云图、相机锁定 |
| 解析形变 | 热伸长、壁面鼓胀、烟道下挠、组合模式；从不可变基准计算 |
| 几何审计 | 原始/当前顶点指纹、移动记录、未放大与显示位移、外包络、局部探针、复位残差 |
| 导入导出 | 参数 JSON、审计 JSON、GLB、STL、FreeCAD 参考宏；浏览器和命令行均可使用 |
| 工程管理 | 锁定依赖、数值与往返测试、真实浏览器检查、隐私扫描、CI |

## 快速开始

需要 Node.js 22.13+，推荐使用 Node.js 22 或24。安装依赖需要联网；运行和建模不依赖云服务、API Key 或远程模型资源。

```bash
npm ci
npm run dev
```

打开终端显示的本地地址，默认 `http://127.0.0.1:5173`。在右侧修改形变模式或参数；“复位几何”精确回写基准顶点，“应用形变”重新施加当前输入。“修改虚构几何参数”会重新创建网格，模型根节点缩放保持1。

```bash
npm run build
npm run preview
```

构建结果为 `dist/` 静态文件。部署到自己选择的静态服务器即可；仓库不依赖原项目的托管账号、认证头或数据库。

## 命令行生成模型包

```bash
npm run export -- --output outputs/demo
```

输出目录必须是新目录，已有文件不会被覆盖。生成：

- `boiler.glb`：Y-up、米，采用 **1×未放大解析位移**。
- `boiler-z-up-mm.stl`：Z-up、毫米，同样为1×位移；STL本身不保存单位元数据。
- `synthetic-reference.FCMacro`：未形变的基本体/放样参考装配，可在FreeCAD执行后手动另存FCStd或导出STEP。
- `parameters.json`：可往返导入的参数。
- `manifest.json`：导出审计和逐文件SHA-256。

可先在网页中导出参数，再执行：

```bash
npm run export -- --parameters private/my-parameters.json --output outputs/custom
```

画面的位移倍率只用于展示，**不会放大导出的解析位移**。FreeCAD宏始终生成未形变参考装配；它不执行自动保存，便于自行选择目录。FreeCAD不是网页或CLI的运行依赖。

## 验证

```bash
npm test
npm run build
npx playwright install --no-shell chromium
npm run test:browser
python3 scripts/privacy_check.py --history
```

Python 3.9+用于宏语法和隐私检查。核心测试覆盖几何尺寸、已知解析位移、叠加、复位字节一致性、显示倍率隔离、GLB/STL重新加载、坐标单位、参数验证和拒绝覆盖。浏览器测试实际创建WebGL画面并操作模式、参数、复位、下载、弹窗与移动布局。见 [验证范围](docs/VALIDATION.md)。

## 数据与计算边界

默认宽/深/高为 **24 / 20 / 54 m**，均为虚构软件参数。压力柔度、线膨胀系数和位移包络是演示设定。各部件是基本体装配，没有进行CAD布尔并集、网格连通性修复、CFD/有限元求解或真实材料标定；不能据此得到应力、强度、工况预测或结构安全结论。

顶点指纹为FNV-1a，用于比较缓冲区；导出文件的SHA-256用于完整性核对。二者均不证明工程模型正确性。用户自行提供的参数和生成模型应自行判断是否适合公开。

[计算方法](docs/METHODS.md) · [格式与坐标](docs/FORMATS.md) · [验证范围](docs/VALIDATION.md) · [隐私边界](PRIVACY.md) · [贡献说明](CONTRIBUTING.md)

代码及自写文档采用 [MIT License](LICENSE)。Three.js、Vite与Playwright遵循各自许可证，见 [第三方说明](docs/THIRD_PARTY.md)。
