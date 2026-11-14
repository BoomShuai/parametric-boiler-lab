# 验证范围

核心测试使用Node.js原生test runner，验证默认/自定义几何外包络、参数拒绝、已知热伸长/鼓胀/挠度、线性叠加、4种模式的逐字节复位、无累积、倍率隔离、GLB重新加载、STL重新加载和坐标单位、JSON往返、宏Python语法、输出哈希及拒绝覆盖。

浏览器测试使用Playwright Chromium，实际创建WebGL渲染器，切换4种模式、改变显示倍率和高度、复位、下载GLB/JSON、关闭方法说明和检查移动布局，同时检查未捕获JavaScript错误与站外请求。截图与失败日志保留在被忽略的test-results/，不把原设备模型或画面作为公开素材。

CI在Linux与Windows的Node.js22/24运行核心测试和构建，Chromium交互检查固定在受当前Playwright版本支持的Ubuntu24.04上运行，避免浮动runner升级改变浏览器依赖。锁定版本见package-lock.json；依赖安装可用npm ci复现。

参考本地环境：Node.js26.3.0、Three.js0.185.1、Vite8.3.8、Playwright1.58.2。GLB/STL在内存中重新加载验证几何范围，不能据此认定网格水密、拓扑适合求解或几何实体有效。

当前未验证：FreeCAD运行时执行与STEP/FCStd结果、真实工业模型导入、CFD/有限元、材料和实测标定。FreeCAD宏仅验证生成内容与Python语法；网页和GLB/STL流程不需要FreeCAD。

隐私检查扫描已跟踪文件、完整可达Git历史、提交和标签元数据，并人工核对源资料中的设备标识、实际量测值和资产名称未进入公开源码。模式扫描不保证识别所有语义信息。

本机也可通过环境变量PLAYWRIGHT_CHANNEL=chrome使用已安装的Google Chrome运行相同用例；使用临时测试配置，不访问个人浏览器资料。CI使用安装后的Chromium。
