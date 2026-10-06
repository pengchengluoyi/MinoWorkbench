# 行为契约 · 设备详情

**原始实现**：`MinoStudio/src/views/Settings/DeviceDetailPage.vue` 370 行
**目标路由**：`/settings/runtime/device/:sn`
**排期**：阶段 4
**状态**：已实现

## 数据

| 来源 | 用途 | 时机 |
|---|---|---|
| `GET /device/list` | 按 sn 找到这台设备 | 进页、刷新 |
| `POST /device/set_password` | 保存锁屏密码 | 点击保存 |
| `POST /device/:sn/ime/adbkeyboard` | 启用 ADB Keyboard | Android 且在线 |
| `POST /device/:sn/ime/system` | 恢复系统输入法 | Android 且在线 |

不走 WebSocket 设备列表。列表接口失败就停在错误态，不静默换成空设备。

## 状态

| 状态 | 挂哪 | 说明 |
|---|---|---|
| sn | 路径 | 刷新可恢复 |
| 密码草稿 | 组件内 | 不回写明文；已配置只显示标记 |

## 交互

| 操作 | 前置条件 | 成功反馈 | 失败反馈 |
|---|---|---|---|
| 保存密码 | 输入非空 | toast「密码已保存」，输入框清空 | toast，保留输入 |
| 切换输入法 | Android 且在线 | toast | 离线按钮禁用，并说明原因 |
| 返回 | — | 回到 `/settings/runtime` | — |

## 边界

- 列表里没有这个 sn：空态 + 返回。
- 密码接口返回的明文不进入界面状态。
- 非 Android 不显示输入法。

## 不做

- 投屏、页面录制（已下线）。
- 从节点对象本地拼详情。详情以 `/device/list` 为准。
