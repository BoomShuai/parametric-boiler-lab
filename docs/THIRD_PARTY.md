# 第三方依赖

- Three.js0.185.1：三维基本体、交互控制、GLB/STL导入导出；MIT。官方文档：https://threejs.org/docs/
- Vite8.3.8：开发服务器和静态构建；MIT。https://vite.dev/
- Playwright1.58.2：开发期浏览器验证；Apache-2.0。https://playwright.dev/
- FreeCAD：用户自行安装的可选CAD运行时，不随本项目分发。https://www.freecad.org/

仓库只通过npm引用依赖，不复制其源码或捆绑预训练资源。项目不复制原项目模板、托管插件、企业材料或原设备模型。已有工作流中的“基本体建模、坐标统一、不可变基准形变和顶点审计”方法已重新整理，示例参数与几何独立生成。

GLB接口采用Three.js官方GLTFExporter，参考：https://threejs.org/docs/pages/GLTFExporter.html 。可视网格通过BufferGeometry更新，参考：https://threejs.org/docs/pages/BufferGeometry.html 。
