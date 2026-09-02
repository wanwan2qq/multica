# Fork 桌面客户端版本与发布指南

适用于：**业务连自托管服务器**（`~/.multica/desktop.json`），**安装包与自动更新走 fork 仓库**（`wanwan2qq/multica` GitHub Releases）。

与官方客户端的区别：

| 配置 | 作用 | 本 fork |
|------|------|---------|
| `~/.multica/desktop.json` | 连哪个 API / Web / WS | `http://10.15.42.27:8082` 等自托管地址 |
| `apps/desktop/electron-builder.yml` → `publish` | 从哪拉新版本安装包 | `wanwan2qq/multica` Releases |

两者互不影响：`desktop.json` 管数据，`publish` 管版本更新。

本地改客户端代码、连自托管调试见 [desktop-dev.zh.md](./desktop-dev.zh.md)。

---

## 版本命名规范

### 格式

```
v<主>.<次>.<补丁>-kb<序号>
```

示例：

| Tag | 打包后版本号 | 说明 |
|-----|-------------|------|
| `v0.4.28-kb1` | `0.4.28-kb1` | 知识库定制基线 |
| `v0.4.28-kb2` | `0.4.28-kb2` | 下一次正式 fork 发版 |
| `v0.4.28-kb3` | `0.4.28-kb3` | 再下一版 |

### 规则

1. **每次对外发版**：在 `main` 上打新 tag，`kb` 序号 +1（`kb1` → `kb2` → `kb3` …）。
2. **不要**用 `*-dirty` tag；有未提交改动时不要打正式 tag。
3. **未打 tag 的本地包**会带 commit 后缀（如 `0.4.28-kb1-7-g895a9c1a1`），仅适合内测，不作为自动更新目标。
4. **版本号来源**：`git describe --tags --match 'v[0-9]*'`，见 `apps/desktop/scripts/package.mjs`。`package.json` 里的 `0.1.0` 是占位，打包时会被覆盖。
5. **自动更新**：`electron-updater` 按 semver 比较；新版本必须 **大于** 已安装版本才会提示更新。
6. **kb 渠道桥接**：若团队仍停留在 `-kb2` 且无法跨渠道看到 `-kb4`/`-kb5`，可发 **同后缀、更高版本号** 的桥接包（如 `v0.4.38-kb2`），并在 GitHub 上设为 **Latest**；用户自动升到桥接包后，后续 `-kbN` 发版恢复正常。桥接包须含 `updater.ts` 中 `allowPrerelease = false` 修复。

### 与官方版本的关系

仓库里可能有上游 tag（如 `v0.4.32`），但若当前分支不是其子孙，`git describe` 仍以 fork 自己的 `v0.4.28-kbN` 为基准。fork 版本线与官方独立，用 `-kbN` 后缀区分即可。

---

## 发版流程（macOS arm64 示例）

### 1. 提交代码并打 tag

```bash
git checkout main
git pull origin main

# 确认无未提交改动
git status

git tag v0.4.28-kb2
git push origin main
git push origin v0.4.28-kb2
```

Tag 须符合：`vX.Y.Z` 或 `vX.Y.Z-suffix`（CI 校验见 `.github/workflows/release.yml`）。

### 2. 本机打包并发布到 fork Release

需要 [GitHub Personal Access Token](https://github.com/settings/tokens)（`repo` 权限），或本机已 `gh auth login`：

```bash
export GH_TOKEN=ghp_xxxxxxxx   # 可选；未设置时脚本会尝试 gh auth token

cd apps/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package -- \
  --mac --arm64 \
  --publish always
```

未配置 Apple 开发者证书时 `CSC_IDENTITY_AUTO_DISCOVERY=false` 会打**未签名**包，内网分发一般可接受。

也可使用仓库脚本（未 export 时会自动读取 `gh auth login` 的 token）。注意脚本只是把参数原样转发给 `package.mjs`，**不会自动加 `--publish always`**，真正发布必须自己带上：

```bash
./scripts/desktop-release-fork.sh --mac --arm64 --publish always
```

（脚本内部已设 `CSC_IDENTITY_AUTO_DISCOVERY=false`，无需重复。）

### 3. 验证 Release

打开：<https://github.com/wanwan2qq/multica/releases>

确认存在：

- `latest-mac.yml`（arm64 自动更新元数据）
- `multica-desktop-<版本>-mac-arm64.dmg` / `.zip` 及对应 `.blockmap`

Intel Mac 需额外打 x64 并上传 `latest-x64-mac.yml`：

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package -- \
  --mac --x64 \
  --publish always
```

### 4. 分发给用户

- **首次切换更新源**：用户需安装一版由本 fork 配置打出的包；旧官方包不会自动改更新源。
- **之后**：设置 → Updates 中可手动检查；开启自动更新后，后台从 fork Release 拉包。

---

## 用户侧配置

### 连自托管服务器

`~/.multica/desktop.json`：

```json
{
  "schemaVersion": 1,
  "apiUrl": "http://10.15.42.27:8082",
  "appUrl": "http://10.15.42.27:3002",
  "wsUrl": "ws://10.15.42.27:8082/ws"
}
```

### 查看当前版本

客户端 **设置 → Updates → Current version**。

### 关闭官方更新（过渡期）

在装好 fork 包之前，可在旧客户端 **设置 → Updates** 关闭 **Automatic updates**，避免被官方版本覆盖。

---

## 仅本地打包（不上传 Release）

```bash
cd apps/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package -- --mac --arm64 --publish never
```

产物在 `apps/desktop/dist/`。版本号带 `-g<hash>` 后缀，适合内测，不建议作为自动更新渠道。

---

## 常见问题

| 现象 | 原因 / 处理 |
|------|-------------|
| 检查更新仍指向官方 | 安装包是改 `publish` 之前打的；需重装 fork 包 |
| 有新版但不提示更新 | 新版本号未大于当前版（semver）；或 Release 缺少 `latest-mac.yml` |
| kb2 检查更新显示已是最新、但 GitHub 已有 kb4 | electron-updater 把 `-kb2`/`-kb4` 当成不同预发布渠道；发 **桥接包** `v0.4.38-kb2`（同 `-kb2` 后缀、更高 semver、含 updater 修复）可让旧 kb2 自动升级；或手动装带修复的包 |
| 已下载更新、弹窗反复出现但版本不变 | macOS Squirrel 第二阶段（ShipIt 替换 `/Applications/Multica.app`）未完成；需 **Cmd+Q 完全退出**（不是只关窗口），并安装含 macOS 安装修复的包；仍失败则 **手动装 DMG**（见下方） |
| 自动更新下载完成但 Restart now 无效 | 同上；未签名（adhoc）包下 ShipIt 成功率更低，**推荐手动 DMG** |
| `publish` 失败 401 / Bad credentials | 未设置 `GH_TOKEN`；运行 `export GH_TOKEN=$(gh auth token)` 或 `gh auth login`，或直接 `./scripts/desktop-release-fork.sh`（会自动读 gh token） |
| `publish` 失败 403 | `GH_TOKEN` 无 `repo` 权限，或 token 不属于 `wanwan2qq` |
| macOS 提示无法验证开发者 | 未签名包；右键打开或 `xattr -cr /Applications/Multica.app` |
| 客户端访问不了 GitHub | 自动更新失败；可关自动更新，改用手动分发 DMG |

### 手动升级（自动更新失败时）

从 [GitHub Releases](https://github.com/wanwan2qq/multica/releases) 下载对应架构的 `.dmg`，拖入「应用程序」覆盖安装。例如 arm64：

`https://github.com/wanwan2qq/multica/releases/download/v0.4.38-kb2/multica-desktop-0.4.38-kb2-mac-arm64.dmg`

未签名包若被 Gatekeeper 拦截：`xattr -cr /Applications/Multica.app` 或右键 → 打开。

---

## 相关文件

| 文件 | 说明 |
|------|------|
| [`apps/desktop/electron-builder.yml`](../apps/desktop/electron-builder.yml) | `publish.owner` / `publish.repo` |
| [`apps/desktop/scripts/package.mjs`](../apps/desktop/scripts/package.mjs) | 版本号推导、`--publish always` |
| [`scripts/desktop-release-fork.sh`](../scripts/desktop-release-fork.sh) | macOS 一键发布到 fork |
| [`docs/selfhost-offline-deploy.zh.md`](./selfhost-offline-deploy.zh.md) | 服务端离线部署 |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | 推 tag 后 CI 构建 Linux/Windows |
