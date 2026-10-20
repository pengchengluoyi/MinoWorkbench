# MinoWorkbench

Mino 的唯一前端，正式版本作为静态文件内置于 Nexus wheel 和 Docker 镜像。浏览器直接访问 Nexus `http://服务器:50104/`，不再独立安装 Workbench，不再监听 60104。

## 开发

```sh
npm ci
npm run dev
```

通过 localhost:60101 访问，默认由 Vite 代理连接本机 Nexus 50101。生产构建使用 `location.origin`，开发地址覆盖只允许 localhost:50101。

## 检查与静态发布

```sh
npm run lint
npm run build -- --base ./
node scripts/build-web.mjs
```

push/PR 运行 build。`vX.Y.Z` tag 直接决定发布版本，并发布 `workbench-web-X.Y.Z.tar.gz` 及 SHA256SUMS.txt；包中 `BUILD.json` 记录静态文件版本和来源 commit，用于排障。

Nexus 打包直接构建 Workbench main 源码，无需先发布本仓静态包，也不维护 web.lock。前后端组成一个产品版本，实际来源 commit 记录在 BUILD.json。正式安装、Docker、升级和旧安装迁移见 [Nexus 部署手册](../MinoNexus/docs/github-updates.md)。

管理页面使用 `/admin/health`、`/admin/packs`、`/admin/flow-blocks`，避免覆盖同名 API。在线更新页只说明服务端升级方式，不触发 Nexus/Workbench 自更新；Scout 保持独立节点能力。

旧安装器和维护代码已移除；旧现场目录不自动清理或迁移。开发进程仍通过现有 PyCharm 运行配置管理。
