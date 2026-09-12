# 看山圆桌

当前版本实现了一个完整的前端演示：刘看山主持、三种动态立场席位、实时对话区、用户第四席、三回合流程，以及知乎证据抽屉。

圆桌视觉使用了 `public/assets/empty-roundtable-background.png` 与分层角色素材：角色会在默认、思考、发言三种状态间切换。

演示中的观点与证据是本地 mock 数据。后续将由后端使用知乎开放数据平台的 Access Secret 检索、聚类并替换为真实回答与原文链接；Access Secret 不会放入前端。

这是一个零依赖 Node 原型。Access Secret 由官方知乎 CLI 保存在本机凭证库，项目不保存 Secret。运行：

```powershell
node server.mjs
```

随后访问 `http://127.0.0.1:4173`，点击“刷新知乎来源”可将当前技术议题的真实知乎公开回答载入证据抽屉。
