$ErrorActionPreference = "Stop"

# Mortal推論環境（問題生成専用）を .mortal/ に構築する。Webサービスからは使わない。
# 版はTHIRD_PARTY_NOTICES.mdの固定値と一致させる。
$sourceCommit = "0cff2b52982be5b1163aa9a62fb01f03ce91e0d2"
$modelRevision = "dbbea7e3d34f99ec43fc4834ab7f2aaaed70b6ee"
$expectedSha256 = "bfb3a6c072aa0bfd4171a9cdc77cb6c02ae42cde920843f9e5784394f23447d8"
$expectedSize = 130774416
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$mortalRoot = Join-Path $repoRoot ".mortal"
$sourceRoot = Join-Path $mortalRoot "source"
$weightPath = Join-Path $mortalRoot "mortal_298k.pth"
$venvRoot = Join-Path $mortalRoot "venv"
$runtimeRoot = Join-Path $mortalRoot "libriichi"
$markerPath = Join-Path $mortalRoot "setup.json"
$hfWeightUrl = "https://huggingface.co/VoidShine/mortal-298k/resolve/$modelRevision/mortal_298k.pth?download=true"

function Assert-ExitCode([string]$commandName) {
	if ($LASTEXITCODE -ne 0) { throw "$commandName が失敗しました (exit code: $LASTEXITCODE)" }
}

function Find-CommandPath([string]$name) {
	$command = Get-Command $name -ErrorAction SilentlyContinue
	if ($null -ne $command) { return $command.Source }
	return $null
}

function Test-Weight([string]$path) {
	$info = Get-Item -LiteralPath $path
	$hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
	return $info.Length -eq $expectedSize -and $hash -eq $expectedSha256
}

New-Item -ItemType Directory -Force -Path $mortalRoot | Out-Null

$python = Find-CommandPath "python"
if ($null -eq $python) { throw "Python 3.12が見つかりません。" }
$pythonVersion = (& $python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')").Trim()
if ($pythonVersion -ne "3.12") { throw "Python 3.12が必要ですが、$pythonVersion を検出しました。" }
$git = Find-CommandPath "git"
if ($null -eq $git) { throw "gitが見つかりません。" }
$cargo = Find-CommandPath "cargo"
if ($null -eq $cargo -and $env:USERPROFILE) {
	$userCargo = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
	if (Test-Path -LiteralPath $userCargo -PathType Leaf) { $cargo = $userCargo }
}
if ($null -eq $cargo) { throw "cargoが見つかりません。Rustを導入して再実行してください。" }

# 重み: 既存ファイル → MORTAL_WEIGHT_SOURCE（ローカルの既存コピー） → Hugging Face固定revisionの順に使う
if (-not ((Test-Path -LiteralPath $weightPath -PathType Leaf) -and (Test-Weight $weightPath))) {
	$downloadTemp = Join-Path $mortalRoot "mortal_298k.download.tmp"
	if ($env:MORTAL_WEIGHT_SOURCE) {
		Copy-Item -LiteralPath $env:MORTAL_WEIGHT_SOURCE -Destination $downloadTemp -Force
	} else {
		Write-Output "重みを固定revisionからダウンロードします: $modelRevision"
		Invoke-WebRequest -Uri $hfWeightUrl -OutFile $downloadTemp
	}
	if (-not (Test-Weight $downloadTemp)) {
		Remove-Item -LiteralPath $downloadTemp -Force
		throw "Mortal重みのサイズ/SHA256が期待値と一致しません。"
	}
	Move-Item -LiteralPath $downloadTemp -Destination $weightPath -Force
}
Write-Output "重み検証済み: $weightPath"

if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
	& $git clone --no-checkout https://github.com/Equim-chan/Mortal.git $sourceRoot
	Assert-ExitCode "Mortal source clone"
	& $git -C $sourceRoot checkout --detach $sourceCommit
	Assert-ExitCode "Mortal source checkout"
}
$actualCommit = (& $git -C $sourceRoot rev-parse HEAD).Trim()
if ($actualCommit -ne $sourceCommit) { throw "Mortal source commitが不一致です: $actualCommit (expected $sourceCommit)" }
# 自己対局を1seed1対局で回すためのパッチ（未適用のときだけ当てる）
$patch = Join-Path $PSScriptRoot "libriichi-selfplay.patch"
& $git -C $sourceRoot apply --reverse --check $patch 2>$null
if ($LASTEXITCODE -ne 0) {
	& $git -C $sourceRoot apply $patch
	Assert-ExitCode "libriichi patch"
}

if (-not (Test-Path -LiteralPath $venvRoot -PathType Container)) {
	& $python -m venv $venvRoot
	Assert-ExitCode "python -m venv"
}
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
& $venvPython -m pip install --upgrade pip
Assert-ExitCode "pip upgrade"
& $venvPython -m pip install --index-url https://download.pytorch.org/whl/cpu torch
Assert-ExitCode "CPU PyTorch install"
& $venvPython -m pip install numpy pytest
Assert-ExitCode "numpy/pytest install"

$env:PYO3_PYTHON = $venvPython
& $cargo build --release --lib --manifest-path (Join-Path $sourceRoot "libriichi\Cargo.toml")
Assert-ExitCode "cargo build libriichi"
$native = Get-ChildItem -LiteralPath (Join-Path $sourceRoot "target\release") -File |
	Where-Object { $_.Name -in @("riichi.dll", "libriichi.dll", "libriichi.so", "libriichi.dylib") } |
	Select-Object -First 1
if ($null -eq $native) { throw "libriichiの共有ライブラリが見つかりません。" }
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$extensionName = if ($IsWindows -or [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT) { "libriichi.pyd" } else { "libriichi.so" }
Copy-Item -LiteralPath $native.FullName -Destination (Join-Path $runtimeRoot $extensionName) -Force
& $venvPython -c "import sys; sys.path.insert(0, r'$runtimeRoot'); import libriichi; print(libriichi.__version__)"
Assert-ExitCode "libriichi import smoke"

[ordered]@{
	sourceCommit = $sourceCommit
	modelRevision = $modelRevision
	modelSha256 = $expectedSha256
} | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding UTF8
Write-Output "Mortal setup完了: $mortalRoot"
