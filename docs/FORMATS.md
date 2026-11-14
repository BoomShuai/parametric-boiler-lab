# 参数、导出格式与FreeCAD

## 参数JSON

通过网页“参数JSON”或CLI导出后，可在网页中导入，或作为CLI `--parameters` 文件。文件最大16KiB。

```json
{
  "schema": 1,
  "geometry": {"width": 24, "depth": 20, "height": 54, "segments": 10},
  "deformation": {"mode": "thermal", "deltaT": 160, "pressure": 400, "sag": 18, "visualScale": 12, "applied": true}
}
```

几何或形变对象中的未知字段、越界数字、非有限值、错误类型会被拒绝；不执行其中任何脚本。模式为thermal/pressure/sag/combined。参数文件不包含实际设备标识或路径；自定义尺寸仍可能属于用户敏感信息，应留在private/或outputs/。

## GLB

glTF2.0二进制，Y轴向上、单位米，场景以纯色材质和生成网格构成，没有纹理、外部buffer、嵌入原模型或网络地址。导出采用1倍解析位移，和画面显示倍率无关。`applied:false`导出未形变模型。浏览器可直接下载，CLI还生成文件摘要。

## STL

二进制STL，坐标转换为 `CAD=(webX,-webZ,webY)*1000`。这是保持右手系的米到毫米、Y-up到Z-up转换。STL不能存储单位，导入其他软件时应手动选择毫米。文件保留各装配部件的三角面，没有做并集或水密性保证。

## FreeCAD宏

生成 `synthetic-reference.FCMacro`。安装FreeCAD后在Macro菜单选择并执行；它会新建文档，用基本长方体和规则放样构造**未形变**的参考装配，并尝试在GUI中适配视角。可自行另存FCStd或用FreeCAD导出STEP。

宏中的CAD单位为毫米，Y-up到Z-up转换与STL一致。它不自动写入或覆盖任何文件，不导入源设备资产。需要使用FreeCAD标准Python/Part接口的版本；当前测试只验证生成宏的Python语法和数据生成，未在FreeCAD运行时执行，见VALIDATION.md。请在本机核验CAD结果，不将参考装配当作经过验证的工程实体。

## CLI输出规则

输出目录必须不存在；已有目录会报错，避免覆盖。`manifest.json`记录四个负载文件的大小与SHA-256，本身不自引用哈希。导出失败可能留下部分新目录，可检查后换新目录重试。清单包含相对文件名、参数及审计值，不写入本机绝对路径。
