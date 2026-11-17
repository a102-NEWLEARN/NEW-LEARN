# git 훅 설치 (Windows PowerShell). 저장소마다 한 번씩 돌린다.
#
#   powershell -ExecutionPolicy Bypass -File .claude/hooks/install.ps1          # core.hooksPath 가 다른 곳을 가리키면 멈춘다
#   powershell -ExecutionPolicy Bypass -File .claude/hooks/install.ps1 -Force   # 알고 덮을 때
#
# install.sh 와 하는 일이 같다(chmod 만 뺀다). PowerShell 에서 bash 는 Git Bash 가 아니라
# WSL 을 부르거나 없을 수 있어서 따로 둔다.
#
# ⚠️ core.hooksPath 는 로컬 git 설정이라 커밋해도 팀원에게 자동 적용되지 않는다.

# 🔴 이 파일은 UTF-8 BOM 으로 저장해야 한다.
# PowerShell 5.1 은 BOM 이 없으면 .ps1 을 시스템 인코딩으로 읽어 한글이 깨진다.

param([switch]$Force)

# 콘솔 출력 쪽 인코딩을 맞춘다 (파일 인코딩과는 별개 문제다).
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 모르는 인자는 $args 로 조용히 빠져서 오타가 그냥 지나간다. 그래서 막는다.
if ($args.Count -gt 0) {
    Write-Host "!! 모르는 인자: $args (쓸 수 있는 것: -Force)"
    exit 1
}

$root = (git rev-parse --show-toplevel 2>$null)
if (-not $root) {
    Write-Host "!! git 저장소가 아니다. 먼저 'git init' 을 할 것."
    exit 1
}
Set-Location $root

# 저장소를 확인한 뒤에 켠다. 5.1 은 Stop 상태에서 2>$null 로 버린 stderr 까지 종료 오류로 바꿔
# 위 안내 대신 NativeCommandError 를 띄운다.
$ErrorActionPreference = 'Stop'

$hookDir = ".claude/hooks"
if (-not (Test-Path $hookDir)) {
    Write-Host "!! $hookDir 가 없다. 저장소 루트에서 돌릴 것."
    exit 1
}

Write-Host "== git 훅 설치 =="
Write-Host "   저장소: $root"

# ---------------------------------------------------------------------------
# 1) 기존 훅 확인 — 파일을 고치기 전에 본다. 멈출 일이면 아무것도 안 바꾼 채 멈춘다
# ---------------------------------------------------------------------------
# core.hooksPath 를 바꾸면 기본 훅 폴더는 통째로 무시된다.
# 워크트리에서는 .git 이 파일이라 .git/hooks 를 못 읽는다. 공용 git 폴더에 묻는다.
# --git-path hooks 는 이미 걸린 core.hooksPath 를 돌려줘서 쓰지 않는다.
$oldDir = (git rev-parse --git-common-dir) + "/hooks"
if (Test-Path $oldDir) {
    $existing = Get-ChildItem $oldDir -File | Where-Object { $_.Name -notlike "*.sample" }
    if ($existing) {
        Write-Host ""
        Write-Host "[!] $oldDir 에 이미 훅이 있다:"
        foreach ($e in $existing) { Write-Host "     $($e.Name)" }
        Write-Host "   설치하면 이 훅들은 더 이상 실행되지 않는다."
        Write-Host "   계속 쓰려면 $hookDir 로 옮긴 뒤 다시 돌릴 것."
        Write-Host ""
    }
}

# 훅 도구는 저마다 core.hooksPath 나 .git/hooks 를 차지해서 이 설치와 나란히 돌 수 없다.
# 고쳐 주지는 않는다. 그 도구 쪽에서 부르는 길만 알린다.
$tools = @()
if (Test-Path ".husky" -PathType Container) { $tools += "husky" }
if (Test-Path ".pre-commit-config.yaml" -PathType Leaf) { $tools += "pre-commit" }
# lefthook 은 yml 말고 toml · json 도 읽고 .config/ 아래도 찾는다
if ((Test-Path "lefthook.*" -PathType Leaf) -or (Test-Path ".lefthook.*" -PathType Leaf) -or (Test-Path ".config/lefthook.*" -PathType Leaf)) { $tools += "lefthook" }
if ($tools.Count -gt 0) {
    Write-Host ""
    Write-Host "[!] 다른 훅 도구를 쓰는 저장소다: $($tools -join ' ')"
    Write-Host "   그 도구를 계속 쓰려면 이 설치 대신, 그 도구의 pre-commit 에서 bash $hookDir/pre-commit,"
    Write-Host ('   commit-msg 에서 bash ' + $hookDir + '/commit-msg "$1" 를 부르게 한다.')
}

# 말없이 덮으면 그쪽 훅이 조용히 꺼진다
$cur = (git config core.hooksPath)
if ($cur -and ($cur -ne $hookDir)) {
    Write-Host ""
    Write-Host "!! core.hooksPath 가 이미 $cur 다. 덮으면 그쪽 훅이 안 돈다 (husky 면 npm install 때 되돌린다)."
    if (-not $Force) {
        Write-Host "   알고 덮으려면 -Force 를 붙여 다시 돌린다."
        exit 1
    }
    Write-Host "   -Force 라서 덮는다."
}

# ---------------------------------------------------------------------------
# 2) 줄바꿈(CRLF) 교정
# ---------------------------------------------------------------------------
# 훅은 bash 가 실행한다. CRLF 가 섞이면 `$'\r': command not found` 로 죽는다.
# .ps1 은 CRLF 가 정상이므로 건드리지 않는다.
$fixed = 0
foreach ($f in (Get-ChildItem $hookDir -File)) {
    if ($f.Extension -eq ".ps1") { continue }
    $text = [System.IO.File]::ReadAllText($f.FullName)
    if ($text.Contains("`r`n")) {
        $text = $text.Replace("`r`n", "`n")
        # WriteAllText 는 줄바꿈을 변환하지 않는다 — LF 그대로 저장된다.
        [System.IO.File]::WriteAllText($f.FullName, $text, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "   줄바꿈 교정: $($f.Name)"
        $fixed = 1
    }
}
if ($fixed -eq 0) { Write-Host "   줄바꿈: 이상 없음" }

# ---------------------------------------------------------------------------
# 3) 배선
# ---------------------------------------------------------------------------
# Windows 에는 실행 권한 개념이 없다. Git for Windows 가 bash 로 훅을 실행하므로 필요 없다.
git config core.hooksPath $hookDir

# ---------------------------------------------------------------------------
# 4) 확인 — 설정만 하고 끝내지 않는다
# ---------------------------------------------------------------------------
$got = (git config core.hooksPath)
if ($got -ne $hookDir) {
    Write-Host "!! 배선 실패 (core.hooksPath='$got')"
    exit 1
}
if (-not (Test-Path "$hookDir/pre-commit")) {
    Write-Host "!! $hookDir/pre-commit 가 없다 — 커밋 게이트가 안 걸린다."
    exit 1
}

# Windows 에서 커밋하면 실행 비트가 git 에 안 실려서 맥 · 리눅스에서 받은 사람 쪽에서는 git 이 훅을 무시한다.
$modes = (git ls-files -s -- "$hookDir/pre-commit" "$hookDir/commit-msg")
if ($modes | Where-Object { $_ -like '100644*' }) {
    Write-Host ""
    Write-Host "[!] git 에 훅의 실행 비트가 기록돼 있지 않다 — 맥 · 리눅스 팀원은 받은 뒤 훅이 꺼진다."
    Write-Host "   git add --chmod=+x $hookDir/pre-commit $hookDir/commit-msg $hookDir/*.sh 뒤 커밋할 것."
}

Write-Host ""
Write-Host "설치 완료."
Write-Host "   core.hooksPath = $got"
Write-Host ""
Write-Host "확인해 보려면:"
Write-Host '   git commit --allow-empty -m " "'
Write-Host "   -> 「커밋 전 게이트」가 찍히고 empty commit message 로 멈추면 훅이 걸렸다. 커밋은 남지 않는다."
Write-Host "      아무것도 안 뜨면 설치가 안 됐다."
Write-Host ""
Write-Host "해제:  git config --unset core.hooksPath"
