# 离线 / 内网自托管部署指南（从开发机同步源码并本地构建镜像）

适用于：**服务器访问不了 GitHub / Docker Hub / proxy.golang.org / registry.npmjs.org**，需要从开发机传代码、在服务器上 `docker compose build` 的场景。

相关文件：

| 文件 | 作用 |
|------|------|
| [`scripts/selfhost-pack-local.sh`](../scripts/selfhost-pack-local.sh) | 开发机打包（仅 Git 跟踪文件，无 `._*` / `node_modules`） |
| [`scripts/selfhost-unpack-on-server.sh`](../scripts/selfhost-unpack-on-server.sh) | 服务器解压并保留 `.env` |
| [`scripts/selfhost-rebuild.sh`](../scripts/selfhost-rebuild.sh) | 服务器重建并启动镜像 |
| [`docker-compose.selfhost.build.china.yml`](../docker-compose.selfhost.build.china.yml) | 国内 Go / npm 构建镜像源 |

官方在线安装仍见 [SELF_HOSTING.md](../SELF_HOSTING.md)。

本环境参考（可按实际修改）：

| 项 | 值 |
|----|-----|
| 服务器 | `10.15.42.27` / `bj-cpwg-t1-self-byz-agent01` |
| 部署目录 | `/home/worker/multica` |
| API 端口 | `8082`（`.env` 里 `PORT` / `BACKEND_PORT`） |
| Web 端口 | `3002`（`.env` 里 `FRONTEND_PORT`） |
| 桌面客户端 | `~/.multica/desktop.json` → `http://10.15.42.27:8082` |

---

## 推荐流程（下次部署照做）

### A. 开发机（可访问 GitHub）

```bash
cd /path/to/multica
git checkout main
git pull --ff-only origin main

./scripts/selfhost-pack-local.sh
# 产物默认：~/Desktop/multica-deploy-<shortsha>.tar.gz（约几十 MB）
```

把生成的 tar.gz 传到服务器（堡垒机上传、`scp`、内网盘等），例如放到 `/tmp/`。

> 不要用 macOS Finder 直接拷整个目录到 Linux：会带上 `._*` AppleDouble 文件，导致 `go migrate` 把 `._001_init.up.sql` 当成迁移执行并报 `SQLSTATE 08P01`。

### B. 服务器

```bash
cd /home/worker/multica          # 按实际路径改

# 1. 解压覆盖源码（自动备份/恢复 .env，并清理 ._）
./scripts/selfhost-unpack-on-server.sh /tmp/multica-deploy-XXXX.tar.gz

# 2. 核对 .env（解压不会改 .env，但要确认端口/CORS 一致）
grep -E '^(PORT|BACKEND_PORT|FRONTEND_PORT|FRONTEND_ORIGIN|MULTICA_APP_URL|CORS_ALLOWED_ORIGINS)=' .env

# 3. 用国内镜像源重建，并开放局域网端口给桌面客户端
./scripts/selfhost-rebuild.sh --china --lan
```

说明：

- `--china`：构建时用 `goproxy.cn` + `npmmirror`
- `--lan`：把 compose 端口从 `127.0.0.1` 改成 `0.0.0.0`，否则**只有服务器本机能访问**，办公网桌面客户端会一直「正在重新连接」
- 每次解压都会把上游的 `docker-compose.selfhost.yml` 盖回来（又是 `127.0.0.1`），所以 **每次重建都要带 `--lan`**（若仍直连 IP:端口）

若基础镜像拉不下，先修 Docker registry mirrors 或手动：

```bash
docker pull golang:1.26-alpine
docker pull alpine:3.21
docker pull node:22-alpine
```

### C. 验证

**服务器本机：**

```bash
docker compose -f docker-compose.selfhost.yml ps
ss -lntp | grep -E '8082|3002'    # 期望 *:8082 / *:3002（不是 127.0.0.1  alone）
curl -sS "http://127.0.0.1:8082/api/config" | head
```

**开发机 / 客户端所在机器（必须测这一步）：**

```bash
curl -sS "http://10.15.42.27:8082/api/config" | head
```

本机 `127.0.0.1` 通、外网 IP 不通 → 多半忘了 `--lan`，或防火墙未放行。

桌面客户端 `~/.multica/desktop.json` 示例：

```json
{
  "schemaVersion": 1,
  "apiUrl": "http://10.15.42.27:8082",
  "appUrl": "http://10.15.42.27:3002",
  "wsUrl": "ws://10.15.42.27:8082/ws"
}
```

浏览器硬刷新：`Cmd+Shift+R`；桌面端点「重试」或重启 Multica。

---

## `.env` 端口与 CORS（易错）

同一文件里不要重复定义、数值要和真实监听端口一致：

```bash
# 推荐（示例）
PORT=8082
FRONTEND_PORT=3002
FRONTEND_ORIGIN=http://10.15.42.27:3002
MULTICA_APP_URL=http://10.15.42.27:3002
CORS_ALLOWED_ORIGINS=http://10.15.42.27:3002
```

常见错误：

| 错误 | 后果 |
|------|------|
| `PORT=8080` 但实际映射 `8082` | curl/文档端口对不上（compose 可能被后面的 `BACKEND_PORT`/`PORT` 覆盖，以 `docker compose ps` 为准） |
| `FRONTEND_PORT` 写了两次（3000 又 3002） | 以后改配置时极易搞混 |
| `CORS_ALLOWED_ORIGINS=...:3000` 但前端在 `3002` | 浏览器跨域失败 |
| 只测了 `127.0.0.1`，没测局域网 IP | 误以为部署成功，客户端仍连不上 |

改完 `.env` 后：

```bash
docker compose -f docker-compose.selfhost.yml -f docker-compose.selfhost.build.yml up -d
```

---

## 可选：本机 SSH 直连时用 rsync

仅当 `ssh worker@<server>` 正常时：

```bash
cd /path/to/multica
rsync -avz --progress \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'apps/desktop/dist' \
  --exclude 'apps/desktop/out' \
  --exclude 'server/bin' \
  --exclude '.env' \
  --exclude '._*' \
  --exclude '.DS_Store' \
  ./ worker@<server>:/home/worker/multica/

ssh worker@<server> 'cd /home/worker/multica && ./scripts/selfhost-rebuild.sh --china --lan'
```

若出现 `Connection timed out during banner exchange`，改回 **打包上传** 方式。

---

## 不要做的事

- **不要** `docker compose down -v`（会清空数据库卷）
- **不要**用未清理的 macOS 拷贝覆盖 `server/migrations/`
- **不要**在重建时覆盖服务器 `.env` 里的 `JWT_SECRET` / `POSTGRES_PASSWORD`
- **不要**指望服务器上 `git fetch github.com` 一定成功（内网常失败）
- **不要**假设「容器 Up 了客户端就能连」——默认只绑 `127.0.0.1`
- **不要**把 `0.0.0.0` 发布到公网且不改默认密钥（仅限可信内网）

---

## 故障速查

| 现象 | 处理 |
|------|------|
| `proxy.golang.org` i/o timeout | `./scripts/selfhost-rebuild.sh --china` |
| `registry.npmjs.org` / corepack 失败 | 同上（npmmirror） |
| `docker.xuanyuan.me` 403 | 换 Docker registry-mirrors，或手动 `docker pull` 基础镜像 |
| `SQLSTATE 08P01` / 迁移吃到 `._001_init` | `find . -name '._*' -delete` 后重建 backend |
| backend `Restarting`，前端正常 | 先看 `logs backend`；多为迁移/数据库问题 |
| 服务器 `curl 127.0.0.1:8082` 通，客户端「正在重新连接」 | 端口仍绑在 `127.0.0.1` → 加 `--lan` 重建 |
| 本机 curl IP 得到 `Empty reply` | 同上，或中间设备干扰；先看 `ss -lntp` 是否为 `*:8082` |
| `curl` connection refused | backend 未就绪或端口与 `.env` / desktop.json 不一致 |

---

## 等价的手写 compose 命令

```bash
# 若需要 LAN：先把 compose 里 127.0.0.1 改成 0.0.0.0，或用脚本 --lan
docker compose \
  -f docker-compose.selfhost.yml \
  -f docker-compose.selfhost.build.yml \
  -f docker-compose.selfhost.build.china.yml \
  up -d --build
```

无国内网络限制时去掉 `docker-compose.selfhost.build.china.yml`，或直接 `make selfhost-build`（默认仍是 `127.0.0.1`，桌面端直连还需自行 `--lan` / 反代）。
