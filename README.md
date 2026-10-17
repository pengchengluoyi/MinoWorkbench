# MinoWorkbench


> **唯一前端**：MinoWorkbench。MinoConsole 与 MinoStudio 已取消，所有管理和测试功能均在本项目实现。
## 本地开发

```sh
npm run dev -- --nexus-url http://127.0.0.1:11104 --port 5274
```

开发必须明确指定测试 Nexus。跨机器访问时，目标地址必须能被浏览器所在机器访问；工作台默认不探测或回退到其他 Nexus。

## 独立安装与升级

生产由独立 Python 原生包提供静态服务和运行配置，不依赖 Node/npm。固定版本升级、回退、恢复、原生/静态包构建和来源配置见 [D3 安装升级合同](docs/contracts/hi3d-workbench-updates.md)。

运行配置缺失时页面会显示错误。正式发布前须补齐真实 Nexus/Workbench build 组合验收；本地 dirty 包的验收不能作为发布准入证据。
