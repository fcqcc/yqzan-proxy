#!/usr/bin/env python3
"""
replace-urls.py — 批量改 index.html 里的国外工具卡 URL

输入：index.html（卡片数据结构在文件里）
输出：index.html.new（每张国外工具卡的 href 前面加一个"⚡国内访问"按钮）

用法：
    python replace-urls.py --input index.html --output index.html.new

注意：
    - 先用 .bak 备份原文件
    - 跑完后用 diff 看一下改动再合并
"""
import argparse
import re
import sys
from pathlib import Path


# 国内站后缀白名单（这些不需要代理）
DOMESTIC_HOST_SUFFIXES = (
    '.cn',
    'gitee.com',
    'baidu.com',
    'qq.com',
    'weixin.qq.com',
    'weixin.sogou.com',
    'bilibili.com',
    'zhihu.com',
    'douyin.com',
    'kuaishou.com',
    'xiaohongshu.com',
    'weibo.com',
    'csdn.net',
    'jianshu.com',
    'juejin.cn',
    'oschina.net',
    'aliyun.com',
    'tencent.com',
    'jd.com',
    'taobao.com',
    'tmall.com',
    'aminer.cn',
    'aigei.com',
    'gamersky.com',
    '3dmgame.com',
    'liantu.com',
    'iconfont.cn',
    'kimi.moonshot.cn',
    'lifelong.smartedu.cn',
    'liflag.cn',
    'muhou.net',  # 用户工具库，国内
    'newcger.com',  # 国内 CG 站
    'lookae.com',  # 国内 CG 站
    'shenyandayi.com',
    'xuetangx.com',
    'zhihuishu.com',
    'tophub.today',
    'hotbox.fun',
    'fuun.fun',
    'kbhgames.com',  # 实际国外但已确认能直连，跳过
    'magiconch.com',  # 国内
    'imagestool.com',
    'koukoutu.com',
    'gaituya.com',
    'ttsmaker.cn',
    'tosound.com',
    'xzgtool.com',
    'xbeibeix.com',
    'moakt.com',
    'lizhi.shop',
    'lang123.top',
    'flipclocker.com',
    'cdkm.com',
    'dlpanda.com',
    'v.magiconch.com',
    'x.magiconch.com',
    'feigua.cn',
    'chanmama.com',
    'anyknew.com',
    'jiumodiary.com',
    'open.163.com',
    'capcut.cn',
    'chatglm.cn',
    'tool.liumingye.cn',
    'tools.liumingye.cn',
    'digitaling.com',
    'ear0.com',
    'jiexi.anxinxia.com',
    'chongbuluo.com',
    'z2h.cn',
    'cli.im',
    'freenom.com',
    'wangyiyun.com',
    'pubscholar.cn',
    'gaoding.com',
    'aigei.com',
    'jandan.net',  # 国内（虽然 .net，但实际是国内煎蛋）
    'weibo.iiilab.com',  # 微博第三方工具，国内
    'sogou.com',
    '5118.com',
    'gaoding.com',
    'zh.wikihow.com',  # 中文版，国内
    'juhe.cn',
    'relangdata.cn',
    'mazwai.com',  # 国外视频素材
    'remove.photos',  # 国内
    'remove.bg',  # 国外
    'unsplash.com',  # 国外
    'pixabay.com',  # 国外
    'github.com',  # 国外
    'convertio.co',  # 国外
    '123apps.com',  # 国外
    'photopea.com',  # 国外
    'poki.com',  # 国外
    'canva.com',  # 国外
    'ezgif.com',  # 国外
    'coolbackgrounds.io',  # 国外
    'aconvert.com',  # 国外
    'virustotal.com',  # 国外
    'aha-music.com',  # 国外
    'drivenlisten.com',  # 国外
    'sleepcalculator.com',  # 国外
    'skylinewebcams.com',  # 国外
    'sweezy-cursors.figma.site',  # 国外（figma 子域）
    'doodle-cursor-maker.figma.site',  # 国外
    'wormhole.app',  # 国外
    'saucenao.com',  # 国外
    'autodraw.com',  # 国外
    'obsproject.com',  # 国外
    'hotkeycheatsheet.com',  # 国外
    'learn-anything.xyz',  # 国外
    'gutenberg.org',  # 国外
    'fmhy.net',  # 国外
    'mixkit.co',  # 国外
    'coverr.co',  # 国外
    'phet.colorado.edu',  # 国外
    'aidn.jp',  # 日本站
)

# 国外站标记词（在 host 里出现就算国外）
FOREIGN_MARKERS = (
    '.com',  # .com 不一定国外，但大多数 .com 的工具站是
    '.io',
    '.co',
    '.org',
    '.net',
    '.app',
    '.dev',
    '.xyz',
    '.site',
    '.jp',
    '.edu',
)


def is_foreign(host: str) -> bool:
    """判断 host 是否是国外站点（需要走代理）"""
    if not host:
        return False
    host = host.lower().strip()
    # 1) 优先匹配白名单（精确）
    if any(host == d or host.endswith('.' + d) for d in DOMESTIC_HOST_SUFFIXES if not d.endswith('.com')):
        return False
    # 2) 国内后缀
    if host.endswith('.cn'):
        return False
    # 3) 在已知国内列表里
    if host in DOMESTIC_HOST_SUFFIXES:
        return False
    # 4) 默认按 TLD 判断
    return True


def extract_host(url: str) -> str:
    """从 URL 提取 host"""
    m = re.match(r'^https?://([^/]+)', url)
    return m.group(1) if m else ''


# proxy 域名（部署后改这个）
PROXY_DOMAIN = 'proxy.yqzan.cn'


def make_proxy_url(host: str) -> str:
    """生成代理 URL"""
    return f'https://{PROXY_DOMAIN}/?d={host}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='输入 HTML 文件')
    parser.add_argument('--output', required=True, help='输出 HTML 文件')
    parser.add_argument('--mode', choices=['rewrite', 'add-button', 'report-only'],
                        default='report-only',
                        help='rewrite=改 href；add-button=加按钮；report-only=只统计')
    args = parser.parse_args()

    src = Path(args.input).read_text(encoding='utf-8')
    out = src

    # 找所有 href
    # 数据结构推测：每张卡是一个 <a class="card" href="https://host/...">
    # 也可能是 <a href="..."> 在某段 JSON 里
    # 这里用宽松匹配：所有 https?://... 的 href
    href_pattern = re.compile(r'href="(https?://[^"]+)"')

    seen_hosts = {}  # host -> [原URL]
    for m in href_pattern.finditer(src):
        url = m.group(1)
        host = extract_host(url)
        if not host:
            continue
        seen_hosts.setdefault(host, []).append(url)

    # 统计
    foreign_hosts = [h for h in seen_hosts if is_foreign(h)]
    domestic_hosts = [h for h in seen_hosts if not is_foreign(h)]

    print(f'\n=== 扫描结果 ===')
    print(f'总 host: {len(seen_hosts)}')
    print(f'国外 host: {len(foreign_hosts)}')
    print(f'国内 host: {len(domestic_hosts)}')
    print(f'\n=== 国外 host 清单（前 30）===')
    for h in sorted(foreign_hosts)[:30]:
        print(f'  {h}  ({len(seen_hosts[h])} 次)')

    if args.mode == 'report-only':
        print('\n[report-only] 没改文件')
        return

    if args.mode == 'rewrite':
        # 把所有指向国外 host 的 href 改成代理 URL
        def repl(m):
            url = m.group(1)
            host = extract_host(url)
            if is_foreign(host):
                return f'href="{make_proxy_url(host)}" data-original="{url}"'
            return m.group(0)

        out = href_pattern.sub(repl, src)
        Path(args.output).write_text(out, encoding='utf-8')
        print(f'\n[rewrite] 已改 {len(foreign_hosts)} 个 host 的 href，输出到 {args.output}')

    elif args.mode == 'add-button':
        # 给每张国外卡加一个"⚡国内访问"小按钮
        # 需要找到卡片结构：暂时只做 demo，把所有国外 host 的链接后追加一个按钮
        # 这里只是统计信息，真正改卡片结构需要看 HTML 模板
        print(f'\n[add-button] 模式：需要你提供卡片结构')
        print('外卡识别完成后，给 <a class="card"> 标签后追加：')
        print('  <a class="proxy-btn" href="https://proxy.yqzan.cn/?d=HOST">⚡国内访问</a>')


if __name__ == '__main__':
    main()
