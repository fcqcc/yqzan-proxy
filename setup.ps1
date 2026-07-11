<#
setup.ps1 — 一键把 cloudflare-proxy/ 初始化为 git 仓库并 push 到 GitHub

用法（替换 <your-github-user>）：
    cd C:\Users\72770\workspace\cloudflare-proxy
    .\setup.ps1 -GitHubUser fcqcc

前置：
    1. 已安装 Git（git --version 能跑）
    2. 已登录 GitHub（git config --global user.name/email 已设）
    3. 已在 GitHub 网页上建好空仓库 yqzan-proxy（不要勾选 README/.gitignore）
    4. 已在 GitHub 仓库配 2 个 Secret：
       - CLOUDFLARE_API_TOKEN
       - CLOUDFLARE_ACCOUNT_ID

跑完后：
    - GitHub Actions 自动部署 worker
    - 2 分钟后 https://proxy.yqzan.cn/ 生效
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$GitHubUser,

    [string]$RepoName = "yqzan-proxy",

    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$ProjectDir = $PSScriptRoot
$RepoUrl = "git@github.com:${GitHubUser}/${RepoName}.git"

# 颜色输出
function Write-Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "  [ERR] $msg" -ForegroundColor Red }

# 0) 检查 git
Write-Step "0) 检查 Git 环境"
$gitVer = git --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Git 没装，去 https://git-scm.com/download/win 装"
    exit 1
}
Write-Ok $gitVer

# 检查 git config
$gitName = git config --global user.name
$gitEmail = git config --global user.email
if (-not $gitName -or -not $gitEmail) {
    Write-Warn "Git 没配 user.name/email"
    Write-Host "    请先跑："
    Write-Host "    git config --global user.name `"你的名字`""
    Write-Host "    git config --global user.email `"你的邮箱`""
    exit 1
}
Write-Ok "user: $gitName <$gitEmail>"

# 1) 进入项目目录
Write-Step "1) 进入项目目录"
Set-Location $ProjectDir
Write-Ok "$ProjectDir"

# 2) 初始化 git
Write-Step "2) 初始化 git 仓库"
if (Test-Path ".git") {
    Write-Warn ".git 已存在，跳过 init"
} else {
    git init
    git branch -M $Branch
    Write-Ok "git init 完成（分支: $Branch）"
}

# 3) 添加文件
Write-Step "3) 添加并提交文件"
git add .
$status = git status --short
if (-not $status) {
    Write-Warn "没有改动需要提交"
} else {
    git commit -m "feat: yqzan proxy worker v1 (8 sites whitelist)"
    Write-Ok "commit 完成"
}

# 4) 关联远程仓库
Write-Step "4) 关联远程仓库"
$remotes = git remote -v
if ($remotes -match $RepoUrl) {
    Write-Warn "remote origin 已存在"
} else {
    git remote remove origin 2>$null
    git remote add origin $RepoUrl
    Write-Ok "remote add: $RepoUrl"
}

# 5) push
Write-Step "5) push 到 GitHub"
Write-Host "    （这会触发 GitHub Actions 自动部署）"
Write-Host ""
$pushConfirm = Read-Host "    确认 push? (yes/no)"
if ($pushConfirm -ne "yes") {
    Write-Warn "取消 push"
    exit 0
}

git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Err "push 失败，检查："
    Write-Host "    1) GitHub 仓库是否已建好"
    Write-Host "    2) SSH key 是否配好（github.com 测试：ssh -T git@github.com）"
    exit 1
}
Write-Ok "push 成功"

Write-Step "6) 部署状态"
Write-Host "    GitHub Actions 跑完后访问："
Write-Host "    https://github.com/${GitHubUser}/${RepoName}/actions" -ForegroundColor Cyan
Write-Host ""
Write-Host "    部署成功（~2 分钟）后访问："
Write-Host "    https://proxy.yqzan.cn/  → 看使用说明" -ForegroundColor Cyan
Write-Host "    https://proxy.yqzan.cn/?d=photopea.com  → 实际反代测试" -ForegroundColor Cyan
Write-Host ""
Write-Ok "全部完成！"
