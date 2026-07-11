/**
 * inject_proxy_buttons.js — 给国外工具卡片注入"国内代理"入口
 *
 * 用法：在 index.html 末尾（所有 .card 渲染后）加载
 *   <script src="cloudflare-proxy/inject_proxy_buttons.js"></script>
 *
 * 效果：
 *   - 检测 .card[href] 的 host 是否在白名单
 *   - 是的话：卡片 href 改成代理 URL（点卡 = 走代理）
 *   - 卡片底部追加一个 chip + 按钮：
 *       ⚡国内秒开 | 原站 ↗
 *   - 收藏按钮、tag、desc 等不动
 *
 * 双模式：
 *   - production（默认）：Worker 部署后自动走代理
 *   - demo（自动 fallback）：Worker 未部署时弹 toast 提示
 *
 * 依赖：worker.js 里同步维护 WHITELIST（部署前两边对齐）
 */
(function() {
  'use strict';

  // ====== 配置 ======
  const PROXY_DOMAIN = 'proxy.yqzan.cn';
  const PROBE_URL = `https://${PROXY_DOMAIN}/`;
  const PROBE_TIMEOUT_MS = 3000;          // 探测超时
  const STATUS_CACHE_KEY = 'yqzan-proxy-status';
  const STATUS_CACHE_TTL = 24 * 60 * 60 * 1000;  // 24h 缓存

  // ====== 和 worker.js 保持完全一致 ======
  const WHITELIST = new Set([
    'photopea.com', 'www.photopea.com',
    'remove.bg', 'www.remove.bg',
    'unsplash.com', 'www.unsplash.com',
    'pixabay.com', 'www.pixabay.com',
    'poki.com', 'www.poki.com',
    'canva.com', 'www.canva.com',
    'mixkit.co', 'www.mixkit.co',
    'ezgif.com', 'www.ezgif.com',
  ]);

  // ====== 模式判断（URL 参数可强制覆盖）======
  function getMode() {
    const params = new URLSearchParams(location.search);
    const override = params.get('proxy');
    if (override === 'force') return 'production';
    if (override === 'force-demo') return 'demo';
    // 读缓存
    try {
      const cached = JSON.parse(localStorage.getItem(STATUS_CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.ts < STATUS_CACHE_TTL) {
        return cached.status === 'ok' ? 'production' : 'demo';
      }
    } catch {}
    return 'demo';  // 默认 demo（保守策略）
  }

  function setMode(status) {
    try {
      localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({
        status,
        ts: Date.now()
      }));
    } catch {}
  }

  // ====== 探测 proxy 状态（不阻塞）======
  function probeProxy() {
    if (new URLSearchParams(location.search).get('proxy')) return; // 强制模式不探测

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    fetch(PROBE_URL, { method: 'HEAD', mode: 'no-cors', signal: controller.signal })
      .then(() => {
        clearTimeout(timer);
        setMode('ok');
      })
      .catch(() => {
        clearTimeout(timer);
        setMode('fail');
      });
  }

  // ====== 注入样式（只注入一次）======
  function injectStyles() {
    if (document.getElementById('yqzan-proxy-styles')) return;
    const css = `
      .card-proxy-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        flex-wrap: wrap;
        font-family: inherit;
      }
      .card-proxy-chip {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 8px;
        border-radius: 11px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: white;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.3px;
        line-height: 1.4;
        box-shadow: 0 2px 6px rgba(99,102,241,0.25);
        white-space: nowrap;
        pointer-events: none;
      }
      .card-proxy-chip svg {
        width: 10px;
        height: 10px;
        fill: currentColor;
      }
      .card-original-btn {
        padding: 2px 8px;
        border-radius: 11px;
        background: rgba(99,102,241,0.08);
        color: #6366f1;
        font-size: 10px;
        font-weight: 500;
        border: 1px solid rgba(99,102,241,0.15);
        cursor: pointer;
        font-family: inherit;
        line-height: 1.4;
        transition: all 0.15s;
        white-space: nowrap;
        text-decoration: none;
      }
      .card-original-btn:hover {
        background: rgba(99,102,241,0.15);
        border-color: rgba(99,102,241,0.3);
      }
      .card-original-btn:active {
        transform: scale(0.96);
      }
      [data-theme="dark"] .card-original-btn {
        background: rgba(165,180,252,0.1);
        color: #a5b4fc;
        border-color: rgba(165,180,252,0.2);
      }
      [data-theme="dark"] .card-original-btn:hover {
        background: rgba(165,180,252,0.18);
        border-color: rgba(165,180,252,0.35);
      }
      @media (max-width: 640px) {
        .card-proxy-chip { font-size: 9px; padding: 1px 6px; }
        .card-original-btn { font-size: 9px; padding: 1px 6px; }
      }

      /* Toast 样式 */
      .yqzan-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(120px);
        background: rgba(15,23,42,0.96);
        color: white;
        padding: 14px 44px 14px 20px;
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.65;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
        max-width: 92vw;
        z-index: 999999;
        opacity: 0;
        transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        pointer-events: none;
      }
      .yqzan-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: auto;
      }
      .yqzan-toast strong { color: #fbbf24; }
      .yqzan-toast a {
        color: #a5b4fc;
        text-decoration: underline;
      }
      .yqzan-toast code {
        background: rgba(255,255,255,0.12);
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 12px;
      }
      .yqzan-toast-close {
        position: absolute;
        top: 8px;
        right: 10px;
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        line-height: 1;
        font-family: inherit;
      }
    `;
    const style = document.createElement('style');
    style.id = 'yqzan-proxy-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ====== Toast 提示 ======
  let toastEl = null;
  let toastTimer = null;
  function showToast(html, duration = 5000) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'yqzan-toast';
      toastEl.innerHTML = '<button class="yqzan-toast-close" type="button">×</button><div class="yqzan-toast-msg"></div>';
      document.body.appendChild(toastEl);
      toastEl.querySelector('.yqzan-toast-close').addEventListener('click', hideToast);
    }
    toastEl.querySelector('.yqzan-toast-msg').innerHTML = html;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, duration);
  }
  function hideToast() {
    if (toastEl) toastEl.classList.remove('show');
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  }

  // ====== 注入单张卡 ======
  function injectCard(card) {
    if (card.querySelector('.card-proxy-bar')) return;

    const url = card.getAttribute('href');
    if (!url) return;

    let host;
    try { host = new URL(url).host; } catch { return; }
    if (!WHITELIST.has(host)) return;

    const mode = getMode();
    const proxyUrl = `https://${PROXY_DOMAIN}/?d=${host}`;

    // 1) 改卡片 href
    card.setAttribute('data-original-href', url);
    card.setAttribute('data-proxy', 'true');
    card.setAttribute('title', mode === 'production'
      ? '已开启国内代理加速 · 点击进入'
      : '点击体验国内代理（演示模式）');

    if (mode === 'production') {
      card.setAttribute('href', proxyUrl);
    }
    // demo 模式：保持原 href，让 click 拦截弹 toast

    // 2) 注入 bar
    const bar = document.createElement('div');
    bar.className = 'card-proxy-bar';
    bar.innerHTML = `
      <span class="card-proxy-chip">
        <svg viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
        ${mode === 'production' ? '国内秒开' : '国内代理'}
      </span>
      <button type="button" class="card-original-btn" title="新窗口打开原站">原站 ↗</button>
    `;

    bar.addEventListener('click', e => e.stopPropagation(), true);

    bar.querySelector('.card-original-btn').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    card.appendChild(bar);
  }

  // ====== Demo 模式：拦截代理卡点击，弹 toast ======
  function setupDemoInterceptor() {
    if (getMode() === 'production') return;

    document.addEventListener('click', e => {
      const card = e.target.closest('a.card[data-proxy="true"]');
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      const originalUrl = card.getAttribute('data-original-href') || card.getAttribute('href');
      const host = (() => { try { return new URL(originalUrl).host; } catch { return ''; } })();
      showToast(`
        <strong>⚡ 演示模式</strong><br>
        Worker 还没部署到 Cloudflare，<br>
        所以"国内代理"暂时不会真跳转。<br>
        <br>
        部署后点这里就能秒开 <code>${host}</code>
        <br><br>
        📖 <a href="cloudflare-proxy/README.md" target="_blank" rel="noopener">查看 5 步部署文档</a>
      `, 6000);
    }, true);
  }

  // ====== 主流程 ======
  function run() {
    injectStyles();
    const cards = document.querySelectorAll('.card[href]');
    let count = 0;
    cards.forEach(card => {
      if (card.querySelector('.card-proxy-bar')) return;
      injectCard(card);
      if (card.getAttribute('data-proxy') === 'true') count++;
    });
    if (count > 0) {
      const mode = getMode();
      console.log(`[yqzan-proxy] 已为 ${count} 张国外工具卡开启国内代理 · 模式: ${mode}`);
    }
    setupDemoInterceptor();
  }

  // DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // 启动探测
  probeProxy();

  // 监听 DOM 变化
  if (window.MutationObserver) {
    const mo = new MutationObserver(() => {
      if (mo._throttle) return;
      mo._throttle = setTimeout(() => {
        mo._throttle = null;
        run();
      }, 200);
    });
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        mo.observe(document.body, { childList: true, subtree: true });
      });
    }
  }

  // 暴露调试接口
  window.__yqzanProxy = {
    setDeployed: () => { setMode('ok'); console.log('[yqzan-proxy] 强制切到 production 模式，刷新页面生效'); },
    setDemo: () => { setMode('fail'); console.log('[yqzan-proxy] 强制切到 demo 模式，刷新页面生效'); },
    status: () => {
      try {
        return JSON.parse(localStorage.getItem(STATUS_CACHE_KEY) || 'null');
      } catch { return null; }
    }
  };
})();
