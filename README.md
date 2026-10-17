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
