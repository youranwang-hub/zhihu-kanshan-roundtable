# 看山圆桌

看山圆桌是一个面向知乎讨论场景的多观点对话原型。它将一个开放问题中的不同判断组织成一场由刘看山主持的圆桌讨论：用户可以旁听，也可以带着自己的立场入席，在质询与总结中形成更完整的判断。

## 在线演示

提交材料汇总：[作品材料页](https://roundtable.xiaoshixuji.xyz/submission/index.html)。视频介绍、Markdown 产品说明书、封面和 ICON 见该页；本地填写清单在 [submission/SUBMISSION.md](submission/SUBMISSION.md)。

实时版：<https://roundtable.xiaoshixuji.xyz/>。前后端部署在 Ubuntu 服务器，支持真实知乎检索、三方立场生成和嘉宾追问；访客无需本机 CLI。

GitHub Pages 部署完成后，访问：<https://youranwang-hub.github.io/zhihu-kanshan-roundtable/>

公网演示版保留完整的圆桌交互、角色状态、三回合流程和本地示例内容。由于 GitHub Pages 只能托管静态文件，不能运行 `server.mjs` 或保管知乎 CLI 凭证，点击“刷新知乎来源”时会自动继续使用演示资料。

## 等待与发言体验

场景左下角可开启轻量提示音，并记住开关偏好（首次默认关闭）。开场、嘉宾接话、发送追问、切换回合、生成纪要及手动更换看山提示时会有柔和短音；不逐字播放音效、不循环播放背景音乐。音效由浏览器 Web Audio 合成，无需额外下载音频。

检索期间，刘看山会切换思考动画与讨论提示，用户也可点击“换个思考角度”；等待时长为真实计时。三位嘉宾的开场和总结按席位依次逐字展示，可点击“直接显示本轮全文”跳过动画。

服务器使用 HTTP 提供方时，追问回应通过 SSE 边生成边显示，断流会保留已收到的文字并提示重试。开场与总结由完整方案校验后逐字呈现；本地 CLI 和静态演示的回应也采用逐字动画。系统开启减少动态效果时直接显示已收到的文字。

## 本地实时版本

本地服务可通过官方知乎 CLI 检索公开讨论，并依据检索摘要生成三种有依据的立场及质询回应。Access Secret 由知乎 CLI 保存在本机凭证库，项目不会保存或向浏览器暴露凭证。

```powershell
node server.mjs
```

随后访问 <http://127.0.0.1:4173>。输入问题、选择参与方式后，页面会自动尝试加载知乎公开讨论；也可以使用“刷新知乎来源”重新检索。

### 运行条件

- Node.js 22 或更高版本（推荐与线上保持一致）
- 已完成登录并可用的官方知乎 CLI
- 如 CLI 不在默认位置，可设置环境变量 `ZHIHU_CLI_PATH`

## 体验流程

1. 输入一个值得讨论的问题。
2. 选择“置身事外”旁听，或“置身事内”写下自己的初始观点。
3. 阅读三种立场及各自引用的知乎回答。
4. 在第二回合可 @ 一位嘉宾提出具体追问；旁听模式也可跳过此步。
5. 在总结回合记录最终判断，或直接查看三方总结，生成圆桌纪要。

## 技术结构

| 位置 | 职责 |
| --- | --- |
| `index.html` | 入场、圆桌场景、对话区与证据抽屉 |
| `styles.css` / `refinement.css` | 自适应视觉、人物与桌面构图、界面主题 |
| `app.js` | 回合状态、旁听/参与分流、质询与前端降级逻辑 |
| `server.mjs` | 静态文件服务、知乎检索、立场生成与质询回应 |
| `zhihu-client.mjs` | 直连知乎官方搜索与直答 HTTP API，凭证仅在服务端读取 |
| `deploy/` | Ubuntu、systemd、Nginx、HTTPS 部署与运维说明 |
| `public/assets/` | 刘看山、人物三态和圆桌美术资源 |

## 部署说明

仓库包含 GitHub Actions 的 Pages 部署工作流。首次部署需在仓库 **Settings → Pages → Build and deployment** 将来源选择为 **GitHub Actions**。之后推送到 `main` 会自动发布静态演示版。

Ubuntu 实时版本已采用前后端同域部署，详见 [部署与运维说明](deploy/README.md)。设置 `ZHIHU_PROVIDER=http` 和服务端 `ZHIHU_ACCESS_SECRET` 即可使用官方 HTTP API；默认的本地启动方式仍保留 CLI 支持。此数据检索接口使用 Access Secret 的 Bearer 鉴权与 `X-Request-Timestamp` 秒级时间戳，不使用内容发布接口的 App Key / App Secret。

服务默认仅监听 `127.0.0.1:4173`，由 Nginx 提供公网 HTTPS。后端仅允许读取前端资源，包含有界问题缓存和并发限制，Nginx 另提供访问限流。不要将凭证放进 GitHub Pages 或前端代码。

验证后端：`node --test test/server.test.mjs`。

更多产品定位、场景和后续路线见 [产品说明计划书](PRODUCT_PLAN.md)。
