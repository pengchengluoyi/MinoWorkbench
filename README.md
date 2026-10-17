## 安装正式版本

GitHub 下载和安装仅提供正式版本，没有测试环境选项。安装菜单只选择 Nexus、Workbench 或两者；包由 GitHub Actions 原生编译并发布到 Releases，用户电脑不编译源码。

支持 Linux x64、Windows x64、macOS Apple Silicon 与 Intel。以下入口随新版四平台 Release 发布后可用：

```bash
curl -fsSL https://github.com/pengchengluoyi/MinoWorkbench/releases/latest/download/install.sh | bash
```

Windows 在 [Releases](https://github.com/pengchengluoyi/MinoWorkbench/releases/latest) 下载 `MinoInstaller-win32-x64.exe` 运行，或在 PowerShell 执行：

```powershell
irm https://github.com/pengchengluoyi/MinoWorkbench/releases/latest/download/install.ps1 | iex
```

默认安装目录是 `~/Mino/nexus`、`~/Mino/workbench`。Nexus 地址为 `http://127.0.0.1:50104`，Workbench 地址为 `http://127.0.0.1:60104`。Workbench 默认连接本机 Nexus，可用 `--nexus-url` 指定远程地址。无需安装 Python 或 GitHub CLI。安装器验证下载大小和 SHA256；已有目录或端口占用时停止并保留数据。

`bootstrap.sh` / `bootstrap.ps1` 默认只安装本仓库组件；`install.sh` / `install.ps1` 提供组件选择。原生安装器还支持 `--components nexus|workbench|both`、`--download-only` 和 `--package-dir` 离线安装。Linux/Windows 当前以用户后台进程运行，不注册开机自启；可使用安装目录内 `launcher/mino-maintain`（Windows 加 `.exe`）管理启动和停止，Nexus 命令前加 `d2`。

正式安装后打开新终端，可运行 `mino-nexus start|stop|status`、`mino-workbench start|stop|status`；不带参数时启动服务。命令注册到用户目录，不依赖全局 Python。已激活的开发虚拟环境仍使用自己的源码入口。

测试环境只从源码／PyCharm 启动，Nexus 使用 `--dev`（50101），Workbench 使用 `npm run dev`（60101）。Scout 不监听独立业务端口，只连接对应 Nexus。

# MinoWorkbench


> **唯一前端**：MinoWorkbench。MinoConsole 与 MinoStudio 已取消，所有管理和测试功能均在本项目实现。
## 本地与内网访问

运行 `npm run dev`，可通过 `http://localhost:60101` 或 `http://<本机内网IP>:60101` 访问。同一局域网的其他设备使用后者；启动日志中的 Network 会显示可用地址。修改配置后需重启已有服务。

开发服务默认经 Vite 代理访问 Nexus。若显式设置 `VITE_NEXUS_URL`，该地址需能被访问页面的设备访问，并由 Nexus 允许对应来源的跨域请求。

运行 `npm run build` 后，可用 `npm run preview` 预览构建结果；预览服务同样支持内网访问，默认端口为 4173，以启动日志为准。预览使用生产环境的 Nexus 地址。

## 测试与正式环境

| 组件 | 测试 | 正式 |
|---|---|---|
| Nexus | 50101 | 50104 |
| Workbench | 60101 | 60104 |
| Scout | 主动连接测试 Nexus 的 50101 | 主动连接正式 Nexus 的 50104 |

Scout 不分配独立业务监听端口。测试与正式使用独立的数据目录、凭据和节点身份。已安装实例的配置不会因更新默认值而自动迁移。

开发与正式部署隔离及启动方式见 [环境说明](docs/ENVIRONMENTS.md)。
