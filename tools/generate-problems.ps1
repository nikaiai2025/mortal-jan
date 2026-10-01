param(
	[int]$Hanchan = 1250,
	[int]$Problems = 10000
)
$ErrorActionPreference = "Stop"

# 問題生成の全段を順に実行する。中断しても再実行すれば続きから処理する
# （自己対局は64半荘単位、評価は1半荘単位で済んだ分を飛ばす）。
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$python = Join-Path $repoRoot ".mortal\venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
	throw "Mortal環境がありません。先に pwsh -File tools/mortal/setup.ps1 を実行してください。"
}

# The published problem set uses secret seeds (see generator/runtime.py). Keep this file:
# without it the same problems cannot be regenerated.
$seedsPath = Join-Path $repoRoot "generator\seeds.local.json"
if (-not (Test-Path -LiteralPath $seedsPath -PathType Leaf)) {
	$bytes = [byte[]]::new(8)
	[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
	[ordered]@{ seedKey = [BitConverter]::ToUInt32($bytes, 0); extractSeed = [BitConverter]::ToUInt32($bytes, 4) } |
		ConvertTo-Json | Set-Content -LiteralPath $seedsPath -Encoding UTF8
	Write-Output "非公開の乱数seedを作成しました: generator\seeds.local.json（リポジトリに入れず、バックアップしてください）"
}

Push-Location $repoRoot
try {
	$steps = @(
		@("generator.selfplay", "--count", $Hanchan),
		@("generator.evaluate"),
		@("generator.calibrate"),
		@("generator.extract", "--count", $Problems)
	)
	foreach ($step in $steps) {
		Write-Output "=== $($step -join ' ') ($(Get-Date -Format HH:mm:ss))"
		& $python -m @step
		if ($LASTEXITCODE -ne 0) { throw "$($step[0]) が失敗しました (exit code: $LASTEXITCODE)" }
	}
	Write-Output "完了: generated/problems.jsonl"
} finally {
	Pop-Location
}
