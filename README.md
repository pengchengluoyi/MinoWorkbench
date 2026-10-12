# MinoWorkbench

## 本地与内网访问

运行 `npm run dev`，可通过 `http://localhost:5273` 或 `http://<本机内网IP>:5273` 访问。同一局域网的其他设备使用后者；启动日志中的 Network 会显示可用地址。修改配置后需重启已有服务。

开发服务默认经 Vite 代理访问 Nexus。若显式设置 `VITE_NEXUS_URL`，该地址需能被访问页面的设备访问，并由 Nexus 允许对应来源的跨域请求。

运行 `npm run build` 后，可用 `npm run preview` 预览构建结果；预览服务同样支持内网访问，默认端口为 4173，以启动日志为准。预览使用生产环境的 Nexus 地址。
