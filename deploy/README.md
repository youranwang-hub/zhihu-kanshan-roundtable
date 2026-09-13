# Ubuntu 公网部署

公网目标：`https://roundtable.xiaoshixuji.xyz`。前后端使用同一域名，由 Nginx 将请求转发到 `127.0.0.1:4173`，无需 CORS。

## 服务结构

- `/opt/kanshan/current`：当前应用，指向 `releases/` 下的版本目录。
- `/opt/kanshan/node`：独立的 Node 22 LTS 运行时，不替换其他项目的运行时。
- `/etc/kanshan/environment`：仅 root 可读的配置，包含 `ZHIHU_ACCESS_SECRET`。
- `kanshan.service`：以无登录权限的 `kanshan` 用户运行，由 systemd 自动启动和异常重启。
- `/etc/nginx/sites-available/roundtable`：独立圆桌域名配置，不改动原站配置。

后端设置 `ZHIHU_PROVIDER=http`，直接调用官方的 `https://developer.zhihu.com/api/v1/content/zhihu_search` 和 `/v1/chat/completions`。鉴权使用 Access Secret 的 Bearer 请求头及秒级时间戳。参考 [知乎官方文档](https://developer.zhihu.com/console/api/v3/docs)。未配置 HTTP 模式时仍可使用本机知乎 CLI。

## 运维

```bash
sudo systemctl status kanshan
sudo journalctl -u kanshan --since '10 minutes ago' --no-pager
curl http://127.0.0.1:4173/api/health
sudo nginx -t
sudo certbot certificates
```

`/api/health` 检查应用存活和凭证是否配置，不调用知乎；真实连接需以 `/api/roundtable` 的非空来源和 `generated: true`，以及 `/api/reply` 的实际回应验证。

更新时把公开前端文件、`public/assets/`、`server.mjs` 和 `zhihu-client.mjs` 上传至新的版本目录，切换 `current` 软链接后执行 `sudo systemctl restart kanshan`。回退时将软链接切回保留的旧目录并重启。凭证文件应始终留在 `/etc/kanshan/`，不要打包进发布文件或写进终端命令、日志、仓库。

Nginx 对每个 IP 限制约每分钟 6 次 API 请求，允许短时突发，并限制全站调用速率和 API 并发。应用缓存最多 100 个问题，30 分钟内复用相同问题的计划；服务重启后内存缓存清空，旧页面需重新开场。证书到期由系统 Certbot 定时任务续期，续期后需 reload Nginx。

`install.sh` 用于首次安装：要求新的 `/home/ubuntu/kanshan-deploy-时间戳` 暂存目录，包含应用和受限 `environment` 文件。发现同名 Nginx 站点已存在时停止，避免覆盖已有站点。它不会修改 DNS、腾讯云安全组或原网站配置。

## 本地验证

```powershell
node --test test/server.test.mjs
```
