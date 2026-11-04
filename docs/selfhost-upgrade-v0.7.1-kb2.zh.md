# 自托管升级记录：v0.4.44-kb3 → v0.7.1-kb2（2026-11-01）

服务器 `10.15.42.27` 从 **v0.4.44-kb3** 升到 **v0.7.1-kb2**（代码提交 `3a8f8ef91`）。本文记录实际执行的步骤和踩到的问题，下次升级照此办理。

部署形态、端口、`.env` 说明见 [selfhost-offline-deploy.zh.md](./selfhost-offline-deploy.zh.md)；桌面端发版见 [desktop-fork-release.zh.md](./desktop-fork-release.zh.md)。

## 速览

| 项 | 值 |
|---|---|
| 升级前 | `v0.4.44-kb3`（`/api/config` 里的 `server_version`） |
| 升级后 | `v0.7.1-kb2`，镜像标签 `VERSION=v0.7.1-kb1 COMMIT=3a8f8ef91`（与 kb2 同提交） |
| 跨度 | 跨 6 个上游 minor（v0.5.x → v0.7.1） |
| 迁移 | `490` → `594`，新增 100 组迁移 |
| 文件变化 | 删除 27 个、重命名 2 个 |
| 基础镜像 | `golang:1.27.3-alpine`、`node:22.23.4-alpine`、`alpine:3.21` |
| 构建阻塞 | 2 次，见下文「遇到的问题」 |

## 前置条件

- 服务器无法访问 GitHub，源码必须由开发机打包上传。
- 服务器可访问国内公网（goproxy.cn、npmmirror），Docker 基础镜像走服务器自己的 registry mirror。
- 服务器 CPU 为 **x86-64-v1**（缺 SSE4.2），前端镜像必须用 `SHARP_WASM=1` 构建。
- 备份磁盘空间 ≥ 数据库体积，镜像重建需要数 GB 余量。

## 升级步骤

### 1. 开发机打包

用仓库自带脚本，避免 Finder/rsync 带出 `._*` 资源分叉文件（会破坏迁移的 `*.up.sql` 匹配）：

```bash
./scripts/selfhost-pack-local.sh ~/Downloads/multica-deploy-<sha>.tar.gz
shasum -a 256 ~/Downloads/multica-deploy-<sha>.tar.gz   # 记下校验和
```

脚本用 `git archive HEAD`，天然不含 `.env`、`.git`、`node_modules`、`._*`。**打包前确认版本号**：工作区脏时 `git describe --dirty` 会带 `-dirty` 后缀，务必从干净 tag（如 `v0.7.1-kb2`）打包。

### 2. 服务器备份数据库

```bash
mkdir -p ~/backups
docker compose -f docker-compose.selfhost.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-multica}" -d "${POSTGRES_DB:-multica}" -Fc \
  > ~/backups/multica-$(date +%F-%H%M).dump
```

迁移只能前进，这份 dump 是唯一的退路。

### 3. 给当前镜像打回滚标签

自建镜像 tag 恒为 `multica-backend:dev` / `multica-web:dev`，重建会直接覆盖：

```bash
docker tag multica-backend:dev multica-backend:pre-v071 2>/dev/null || true
docker tag multica-web:dev     multica-web:pre-v071     2>/dev/null || true
```

### 4. 上传、校验、解到**新目录**

```bash
sha256sum /tmp/multica-deploy-<sha>.tar.gz     # 与开发机一致
mkdir -p ~/multica-0.7.1
tar -xzf /tmp/multica-deploy-<sha>.tar.gz -C ~/multica-0.7.1 --strip-components=1
cp <旧部署目录>/.env ~/multica-0.7.1/.env       # 复制，不要覆盖旧目录的
```

为什么不用 `scripts/selfhost-unpack-on-server.sh` 覆盖式解包：它是 rsync 覆盖、**不删除**文件，而 v0.4.44 → v0.7.1 之间有 27 个文件被上游删除、2 个被重命名（如 `repositories-tab.tsx` → `repositories-section.tsx`），残留文件会混进前端构建。跨大版本一律用干净目录。

Compose 的 `name: multica` 没变，所以新目录 `up -d` 会复用同一个 `pgdata` 卷，数据不丢。

### 5. 预拉基础镜像

```bash
docker pull golang:1.27.3-alpine
docker pull node:22.23.4-alpine
docker pull alpine:3.21
```

### 6. 只构建，不启动

```bash
cd ~/multica-0.7.1
SHARP_WASM=1 VERSION=v0.7.1-kb2 COMMIT=3a8f8ef91 \
docker compose -f docker-compose.selfhost.yml \
               -f docker-compose.selfhost.build.yml \
               -f docker-compose.selfhost.build.china.yml \
               build
```

构建后可选校验二进制里确实有知识库路由：

```bash
docker run --rm --entrypoint sh multica-backend:dev -c "strings /app/server | grep -c '/knowledge/'"
```

### 7. 启动新版本

```bash
SHARP_WASM=1 VERSION=v0.7.1-kb2 COMMIT=3a8f8ef91 \
./scripts/selfhost-rebuild.sh --china --lan
```

`--lan` 不能省：上游新版 compose 默认绑 `127.0.0.1`，不加会让局域网客户端连不上。

### 8. 验收

```bash
curl -sS http://127.0.0.1:8082/api/config | head -c 160   # server_version
curl -sS -o /dev/null -w '%{http_code}\n' http://10.15.42.27:3002/
docker compose -f docker-compose.selfhost.yml logs --tail=80 backend | grep -iE "migrat|error"
ss -lntp | grep -E '8082|3002'                             # 应为 *:8082 / *:3002
```

再看浏览器与桌面客户端：能登录、任务加载正常、WebSocket 已连接、侧边栏「知识库」能打开并浏览文件。

## 遇到的问题

### 1. `SHARP_WASM=0` 构建失败：sharp 需要 v2 微架构

```
Error: Could not load the "sharp" module using the linuxmusl-x64 runtime
Unsupported CPU: Prebuilt binaries for Linux x64 require v2 microarchitecture
  at .../sharp@0.35.4/dist/sharp.cjs
```

服务器 CPU 缺 SSE4.2。**必须 `SHARP_WASM=1`**，它会把 sharp 固定到 0.32.6（有兼容 v1 的预编译包），并从 npmmirror 下载二进制。

### 2. `ERR_PNPM_UNUSED_PATCH`（已修复，提交 `3a8f8ef91`）

开了 `SHARP_WASM=1` 后构建卡在：

```
ERR_PNPM_UNUSED_PATCH  The following patches were not used: expo-modules-core@57.0.21
Either remove them from "patchedDependencies" or update them to match packages in your dependencies.
```

原因：上游从 v0.6.3 起在根 `package.json` 加了 `pnpm.patchedDependencies`（mobile 的 expo 补丁）。`SHARP_WASM` 分支要执行 `pnpm install --no-frozen-lockfile` 重新解析依赖，而 web 镜像的构建阶段没有 mobile 包，pnpm 校验补丁时直接报错退出，走不到 sharp 覆盖那一步。

修复：在覆盖 sharp 前先删掉该字段（`Dockerfile.web` 里那行 `node -e` 增加 `delete pkg.pnpm.patchedDependencies`）。web 构建本来也用不到 mobile 的补丁。

> 顺带澄清一个易错结论：pnpm 10.28.2 会警告「`pnpm.overrides` 已不被读取」，但**实测仍然生效**——sharp 能正常锁到 0.32.6。真正失效的只有 `patchedDependencies` 在裁剪后的 workspace 里的校验。

### 3. 包里没有 `.git`，版本号会退化成 `dev`

`selfhost-rebuild.sh` 用 `git describe` 推导版本，解包目录没有 `.git` 时会得到 `dev`，镜像里的版本号就错了。必须显式传 `VERSION=` / `COMMIT=`。

### 4. 直接 `node scripts/package.mjs` 打包桌面端会失败（同类注意）

在桌面发版时遇到过：不通过 `pnpm package` 而是直接 `node scripts/package.mjs`，electron-builder 会误判包管理器为 npm，把 pnpm store 里的文件当成“包外路径”拒绝拷贝，报 `denied access to system or unsafe path`。桌面打包一律用 `pnpm package -- …`。

## 回滚

```bash
cd <旧部署目录>
docker tag multica-backend:pre-v071 multica-backend:dev
docker tag multica-web:pre-v071     multica-web:dev
docker compose -f docker-compose.selfhost.yml -f docker-compose.selfhost.build.yml up -d
```

迁移单向：镜像回滚后数据库 schema 仍是新的。若新版迁移本身失败、服务起不来，才需要恢复备份：

```bash
docker compose -f docker-compose.selfhost.yml stop backend frontend
docker compose -f docker-compose.selfhost.yml exec -T postgres \
  pg_restore -U "${POSTGRES_USER:-multica}" -d "${POSTGRES_DB:-multica}" --clean --if-exists \
  < ~/backups/multica-<时间>.dump
docker compose -f docker-compose.selfhost.yml -f docker-compose.selfhost.build.yml up -d
```

**永远不要** `docker compose down -v`。

## 下次照做

1. 干净 tag 上 `selfhost-pack-local.sh` 打包 → 校验 sha256。
2. 先 `pg_dump`，再给 `:dev` 镜像打回滚 tag。
3. 解到新目录（跨大版本不要覆盖式解包），复制 `.env`。
4. 预拉三个基础镜像 → `SHARP_WASM=1 VERSION=… COMMIT=…` 构建 → `--china --lan` 启动。
5. 验收 `server_version`、前端 200、迁移日志、局域网端口绑定。
