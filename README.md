## 一键安装（macOS Apple Silicon）

安装包由本仓库 GitHub Actions 编译，在 [Releases](https://github.com/pengchengluoyi/MinoWorkbench/releases) 下载；不是用户本机编译。首次安装：

```bash
curl -fsSL https://raw.githubusercontent.com/pengchengluoyi/MinoWorkbench/main/packaging/bootstrap.sh | bash -s -- --environment test
```

正式环境将 `test` 改为 `production`。默认目录为 `~/Mino/<环境>/workbench`，需要系统 `curl`、`unzip` 和 `python3`，不需要 GitHub CLI 或克隆源码。已有目录或端口占用时停止，不覆盖数据、不自动换端口。使用 `--version 0.0.16` 固定版本，`--download-only` 只下载校验，`--package-dir /绝对路径` 使用包含 manifest.json 与 ZIP 的离线下载目录。

测试地址为 `http://127.0.0.1:60101`，正式地址为 `http://127.0.0.1:60104`。Workbench 默认连接本机同环境 Nexus，可用 `--nexus-url` 指定另一台电脑的 Nexus。本机安装默认只监听回环地址。

仅已发布且带新格式 manifest.json 的 Release 可一键安装；CI 构建成功但尚未发布时，脚本会报发布物缺失，不能当成安装成功。

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
