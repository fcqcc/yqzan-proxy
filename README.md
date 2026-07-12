# yqzan 国外站点反代 · 部署指南

> 目标：让国内用户访问 yqzan 工具箱里收录的国外站点也能秒开。
> 实现：Cloudflare Worker 反代 + 前端 JS 注入双按钮，一次部署 8 个站开箱即用。

---

## 架构

```
用户点工具卡 (index.html)
    ↓
卡片 href 自动改成 https://proxy.yqzan.cn/?d=photopea.com
    ↓
CF Worker (proxy.yqzan.cn) 反代请求
    ↓
原站 photopea.com 响应 HTML
    ↓
HTMLRewriter 注入 <base> + 用户提示条
    ↓
用户看到 photopea 页面，左下角"⚡yqzan 代理"提示条
```

---

## 目录结构

```
cloudflare-proxy/
├── worker.js                       # CF Worker 反代脚本（白名单 8 个站）
├── wrangler.toml                   # 部署配置（绑 proxy.yqzan.cn）
├── inject_proxy_buttons.js         # 前端注入脚本（卡片双按钮 + auto-detect）
├── test.html                       # 本地预览页
├── setup.ps1                       # 一键 push 脚本（git init + commit + push）
├── .github/workflows/deploy.yml    # GitHub Actions 自动部署
├── .gitignore                      # 排除 debug 文件
├── replace-urls.py                 # 工具脚本（已废弃，被 inject_proxy_buttons.js 取代）
└── README.md                       # 本文档
```

---

## 3 步上线（自动化）

### Step 1：在 GitHub 建空仓库 + 配 Secret

**1.1 建仓库**
- 打开 https://github.com/new
- Repository name: `yqzan-proxy`
- 选 **Private**（白名单站点列表不公开）
- ⚠️ **不要勾选** "Add a README file" / "Add .gitignore" / "Choose a license"
- 点 **Create repository**

**1.2 创建 Cloudflare API Token**
1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 点 **Create Token** → 选 **Edit Cloudflare Workers** 模板
3. 权限保持默认（Account → Workers Scripts: Edit）
4. **Account Resources** 选你托管 yqzan.cn 的账号
5. 点 **Continue to summary** → **Create Token**
6. 复制 token（**只显示一次！**）

**1.3 拿 Cloudflare Account ID**
- 打开 https://dash.cloudflare.com/
- 右侧栏 Workers & Pages → 点 **Account ID** 旁边的复制按钮

**1.4 在 GitHub 仓库配 2 个 Secret**
- 仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | Value |
|------|-------|
| `CLOUDFLARE_API_TOKEN` | 1.2 步骤复制的 token |
| `CLOUDFLARE_ACCOUNT_ID` | 1.3 步骤复制的 ID |

### Step 2：跑 setup.ps1 一键 push

打开 PowerShell：

```powershell
cd C:\Users\72770\workspace\cloudflare-proxy
.\setup.ps1 -GitHubUser fcqcc
```

脚本会：
1. 检查 Git 环境
2. 初始化本地 git 仓库
3. 提交所有文件
4. 关联远程仓库
5. **问你确认 push**（输 `yes` 继续）
6. push 到 GitHub → **自动触发 Actions 部署**

### Step 3：等 2 分钟 + 验证

**3.1 看部署状态**
- 打开 https://github.com/fcqcc/yqzan-proxy/actions
- 第一次部署会有 1 个 "Deploy yqzan-proxy Worker" 跑
- 等 2 分钟（CF 配 DNS + SSL 证书）

**3.2 验证**

打开浏览器：
- https://proxy.yqzan.cn/ → 看到使用说明页面
- https://proxy.yqzan.cn/?d=photopea.com → 看到 photopea 主页，左下角"⚡yqzan 代理 · photopea.com"提示条

**3.3 工具箱前端验证**
- 把 `inject_proxy_buttons.js` 集成到 `index.html`（已集成，参考下方）
- 刷新 https://yqzan.cn → 国外工具卡自动从"国内代理"（演示）变成"国内秒开"（生产）

---

## 工具箱前端集成（已做）

`inject_proxy_buttons.js` 已集成到 `C:\Users\72770\workspace\index.html`：

```html
<!-- yqzan-proxy: 国外工具卡国内代理入口（auto-detect：worker 部署后自动走代理，未部署时弹 toast） -->
<script src="cloudflare-proxy/inject_proxy_buttons.js" defer></script>
```

**auto-detect 模式**：
- 默认：探测 `proxy.yqzan.cn/` 是否可达
- 不可达 → **演示模式**（点击弹 toast 提示，告诉你"还没部署"）
- 可达 → **生产模式**（点击直接走代理秒开）
- 缓存 24h（localStorage）

**调试接口**（控制台）：
```js
__yqzanProxy.setDeployed()   // 强制切生产模式（模拟"已部署"）
__yqzanProxy.setDemo()        // 强制切演示模式
__yqzanProxy.status()         // 看当前缓存
```

---

## 部署后验证清单

| 检查项 | 命令 / 方式 | 预期 |
|--------|------------|------|
| Worker 部署成功 | GitHub Actions 看绿色 ✓ | ✓ 跑通 |
| Worker 域名解析 | `curl -I https://proxy.yqzan.cn/` | 200 |
| 反代 photopea | 浏览器开 `?d=photopea.com` | 看到 photopea + 提示条 |
| 白名单外拒绝 | `curl -I "https://proxy.yqzan.cn/?d=facebook.com"` | 403 |
| 工具箱前端 | 刷新 yqzan.cn → 国外卡 chip 变"国内秒开" | ✓ |

---

## 白名单维护

白名单在**两个文件**维护（必须保持一致）：

**1. `worker.js`（服务端白名单）**
```js
const WHITELIST = new Set([
  'photopea.com', 'www.photopea.com',
  'remove.bg', 'www.remove.bg',
  // ... 加新站
]);
```

**2. `inject_proxy_buttons.js`（前端白名单）**
```js
const WHITELIST = new Set([
  'photopea.com', 'www.photopea.com',
  'remove.bg', 'www.remove.bg',
  // ... 加新站
]);
```

**加新站 3 步**：
1. 两个文件都加上域名
2. `git add . && git commit -m "feat: add xxx.com to whitelist" && git push`
3. GitHub Actions 自动部署，~30 秒生效

---

## 调试

### 本地起 worker（用 wrangler dev）

```bash
npm install -g wrangler
wrangler login

cd cloudflare-proxy
wrangler dev

# 另开终端测试
curl "http://localhost:8787/?d=photopea.com"
```

### 看 worker 日志

CF Dashboard → Workers & Pages → yqzan-proxy → Logs
或
```bash
wrangler tail
```

### GitHub Actions 失败排查

仓库 → Actions → 点失败的 run → 看报错
常见问题：
- **Token 无效**：检查 `CLOUDFLARE_API_TOKEN` secret
- **Account ID 错**：检查 `CLOUDFLARE_ACCOUNT_ID` secret
- **Worker name 已存在**：去 CF Dashboard 删掉旧的

---

## 成本

| 项目 | 额度 | 你的体量 | 月成本 |
|------|------|---------|--------|
| Workers 请求 | 10万/天 | 工具箱 8 站 × 50 点击 = 400/天 | **$0** |
| Workers CPU | 10ms/请求 免费 | 平均 5ms | **$0** |
| 自定义域名 | 无限 | 1 个 proxy.yqzan.cn | **$0** |
| GitHub Actions | 2000 分钟/月 | 每次部署 1 分钟 | **$0** |

**总成本：$0 / 月**

---

## 风险与限制

| 风险 | 说明 | 应对 |
|------|------|------|
| 登录态丢失 | Worker 无持久 cookie，反代后台型网站会跳登录 | 白名单里不放需要登录的站（GitHub 已剔除） |
| 原站检测 CF ASN | 少数站会屏蔽 CF IP 段 | 反代失败的站从白名单移除 |
| Worker 被滥用 | 别人扫到 proxy.yqzan.cn 拿你反代黄赌毒 | 已加 Referer 校验（仅 yqzan.cn 来源放行）|
| Cloudflare ToS | 反代被 CF 视为灰色地带 | 不放敏感内容，目前体量不会被盯 |

---

## 当前白名单（8 个）

| 域名 | 用途 | 工具箱使用频次 |
|------|------|--------------|
| photopea.com | 在线 PS | 106 |
| remove.bg | 一键抠图 | 21 |
| unsplash.com | 免费图片 | 34 |
| pixabay.com | 免费图片/视频 | 188 |
| poki.com | 在线小游戏 | 44 |
| canva.com | 在线设计 | 14 |
| mixkit.co | 视频/音频素材 | 47 |
| ezgif.com | GIF 工具 | 9 |

> 跑通后扩到 30+ 站，再扩到所有非 .cn 工具类站。

---

## 路线图

- [x] v1: 8 个高频工具站 + GitHub Actions 自动部署
- [x] v1: 前端集成（auto-detect 双模式）
- [ ] v2: 扩到 30 个工具站
- [ ] v3: 加 KV 缓存静态资源（节省 CPU + 加速二次访问）
- [ ] v4: 加监控面板（CF Analytics + 自建请求日志）

---

## 常见问题

**Q: GitHub 仓库要 public 还是 private？**
A: Private。白名单站点列表不算机密，但避免无关人员 fork。

**Q: 部署失败怎么办？**
A: 仓库 → Actions → 看报错。99% 是 secret 配错了。

**Q: proxy.yqzan.cn 在国内访问会不会被墙？**
A: 不会。Cloudflare 走的是自家的 1.1.1.1 网络，国内出口走香港/日本/新加坡节点，比直连快 5-10 倍。

**Q: Worker 有配额限制吗？**
A: 免费版每天 10 万次请求，CPU 时间 10ms/次。工具箱体量完全够。

**Q: 怎么加新站点？**
A: 改 `worker.js` + `inject_proxy_buttons.js` 两个文件的 WHITELIST，commit + push 即可。

**Q: 为什么不用 Cloudflare Pages + Functions？**
A: Workers 更轻量、部署更快。Functions 要 Pages 仓库结构，复杂。

<!-- Last deploy trigger: 2026-07-12 -->

