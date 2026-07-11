/**
 * Cloudflare Worker — 通用国外站点反代
 *
 * 思路：
 *   用户访问 https://proxy.yqzan.cn/?d=photopea.com
 *   → Worker 透传到 https://photopea.com/
 *   → 拿到 HTML 后用 HTMLRewriter 注入 <base> 标签
 *   → 所有相对路径（CSS/JS/img/a）自动走代理
 *
 * 部署：
 *   - 通过 GitHub Actions 自动部署
 *   - 触发条件：push 到 main 分支且改了 cloudflare-proxy/ 目录
 *
 * 白名单：仅放工具类站点（无需登录）
 */

// ====== 白名单：先 8 个高频工具站（跑通后再扩）======
const WHITELIST = new Set([
  'photopea.com',
  'www.photopea.com',
  'remove.bg',
  'www.remove.bg',
  'unsplash.com',
  'www.unsplash.com',
  'pixabay.com',
  'www.pixabay.com',
  'poki.com',
  'www.poki.com',
  'canva.com',
  'www.canva.com',
  'mixkit.co',
  'www.mixkit.co',
  'ezgif.com',
  'www.ezgif.com',
]);

// ====== 不改写的资源类型（避免破坏二进制）======
const PASSTHROUGH_CONTENT_TYPES = /^image\/|^video\/|^audio\/|^font\/|^application\/octet-stream|^application\/pdf|^application\/zip/;

// ====== 入口 ======
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1) 解析目标域名
    // 支持两种 URL 形式：
    //   a) proxy.yqzan.cn/?d=photopea.com           (query 参数)
    //   b) proxy.yqzan.cn/<host>/<path>             (路径形式)
    let targetHost = url.searchParams.get('d');
    let targetPath = '';

    if (!targetHost) {
      // 路径形式：/photopea.com/some/path
      const match = url.pathname.match(/^\/([^/]+)(\/.*)?$/);
      if (match) {
        targetHost = match[1];
        targetPath = match[2] || '/';
      }
    } else {
      targetPath = url.pathname === '/' ? '/' : url.pathname;
    }

    // 兜底：没传 d 也没路径 → 返回使用说明
    if (!targetHost) {
      return new Response(usageHtml(), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    // 2) 白名单校验
    if (!WHITELIST.has(targetHost)) {
      return new Response(`Domain "${targetHost}" not in whitelist.`, {
        status: 403,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    // 3) Referer 校验：只允许从 yqzan.cn 域名跳转过来
    //    防止 worker 被滥用反代黄赌毒
    const referer = request.headers.get('Referer') || '';
    if (referer && !referer.startsWith('https://yqzan.cn') && !referer.startsWith('https://www.yqzan.cn')) {
      return new Response('Forbidden: invalid referer', { status: 403 });
    }

    // 4) 构造目标 URL
    const targetUrl = `https://${targetHost}${targetPath}${url.search.replace(/^\?/, '?')}`;

    // 5) 转发请求（剥 CF 内部头）
    const upstreamHeaders = cleanHeaders(request.headers, targetHost);
    const upstreamRequest = new Request(targetUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: request.body,
      redirect: 'follow',
    });

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(upstreamRequest);
    } catch (e) {
      return new Response(`Upstream fetch failed: ${e.message}`, {
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    // 6) 改写响应
    const contentType = upstreamResponse.headers.get('content-type') || '';

    // 6a) HTML：用 HTMLRewriter 注入 <base>，让所有相对路径自动走代理
    if (contentType.includes('text/html')) {
      const newHeaders = new Headers(upstreamResponse.headers);
      newHeaders.delete('content-security-policy');
      newHeaders.delete('content-security-policy-report-only');
      newHeaders.delete('x-frame-options');
      newHeaders.set('access-control-allow-origin', '*');

      // 注入 <base>：所有相对路径都以 proxy.yqzan.cn/?d=<host> 为基准
      const proxyBase = `${url.origin}/?d=${targetHost}`;

      const transformed = new HTMLRewriter()
        .on('head', {
          element(el) {
            el.append(`<base href="${proxyBase}">`, { html: true });
          }
        })
        .on('body', {
          element(el) {
            // 注入一个用户提示条，告诉用户当前在走代理
            const banner = `
              <div id="yqzan-proxy-banner" style="
                position:fixed;bottom:12px;left:12px;z-index:999999;
                background:rgba(99,102,241,0.95);color:white;
                padding:8px 14px;border-radius:8px;font-family:system-ui;
                font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.2);
                backdrop-filter:blur(8px);max-width:calc(100vw - 24px);">
                <span style="opacity:0.9">⚡ yqzan 代理 · ${targetHost}</span>
                <a href="https://${targetHost}${targetPath}" target="_blank" rel="noopener"
                   style="color:#fef3c7;margin-left:8px;text-decoration:underline;font-size:12px;">
                  切回原站 ↗
                </a>
              </div>`;
            el.prepend(banner, { html: true });
          }
        })
        .transform(upstreamResponse);

      return new Response(transformed.body, {
        status: upstreamResponse.status,
        headers: newHeaders,
      });
    }

    // 6b) CSS / JS：URL 改写
    if (contentType.includes('text/css') || contentType.includes('javascript')) {
      const text = await upstreamResponse.text();
      const proxyOrigin = url.origin;
      const rewritten = text
        .replace(/url\((['"]?)(\/[^)'"]+)\1\)/g, (m, q, p) =>
          `url(${q}${proxyOrigin}/?d=${targetHost}${p}${q})`)
        .replace(/(['"])(\/[a-zA-Z0-9_\-./]+\.(?:js|css|png|jpg|jpeg|svg|gif|webp|ico))(['"])/g,
          (m, q1, p, q2) => `${q1}${proxyOrigin}/?d=${targetHost}${p}${q2}`);

      return new Response(rewritten, {
        status: upstreamResponse.status,
        headers: cleanResponseHeaders(upstreamResponse.headers),
      });
    }

    // 6c) 图片/视频/字体/PDF：原样透传
    if (PASSTHROUGH_CONTENT_TYPES.test(contentType)) {
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers,
      });
    }

    // 6d) 其它（API JSON / 文本）：原样透传 + CORS
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: cleanResponseHeaders(upstreamResponse.headers),
    });
  },
};

// ====== 工具函数 ======
function cleanHeaders(headers, targetHost) {
  const h = new Headers(headers);
  h.set('Host', targetHost);
  h.set('Origin', `https://${targetHost}`);
  h.set('Referer', `https://${targetHost}/`);
  ['cf-connecting-ip', 'cf-worker', 'cf-ray', 'cf-visitor'].forEach(k => h.delete(k));
  h.delete('accept-encoding');
  return h;
}

function cleanResponseHeaders(headers) {
  const h = new Headers(headers);
  h.set('access-control-allow-origin', '*');
  h.delete('content-security-policy');
  h.delete('content-security-policy-report-only');
  h.delete('strict-transport-security');
  return h;
}

function usageHtml() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>yqzan 代理</title></head>
<body style="font-family:system-ui;max-width:640px;margin:40px auto;padding:0 20px;color:#333;">
  <h1>⚡ yqzan 国外站点代理</h1>
  <p>这是 yqzan 工具箱的 CF Worker 反代，帮国内用户访问工具箱里收录的国外站点。</p>
  <h2>使用方式</h2>
  <p>访问：<code>https://proxy.yqzan.cn/?d=&lt;目标域名&gt;</code></p>
  <p>示例：</p>
  <ul>
    <li><a href="?d=photopea.com">?d=photopea.com</a></li>
    <li><a href="?d=remove.bg">?d=remove.bg</a></li>
    <li><a href="?d=poki.com">?d=poki.com</a></li>
  </ul>
  <h2>白名单</h2>
  <p>目前支持 8 个工具类站点（无登录需求）：</p>
  <ul>
    <li>photopea.com（在线 PS）</li>
    <li>remove.bg（一键抠图）</li>
    <li>unsplash.com（免费图片）</li>
    <li>pixabay.com（免费图片/视频）</li>
    <li>poki.com（在线小游戏）</li>
    <li>canva.com（在线设计）</li>
    <li>mixkit.co（视频/音频素材）</li>
    <li>ezgif.com（GIF 工具）</li>
  </ul>
  <h2>状态</h2>
  <p>✅ 部署成功 · 白名单生效中</p>
</body></html>`;
}
