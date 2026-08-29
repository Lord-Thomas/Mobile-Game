param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $GraphifyArguments
)

$env:UV_CACHE_DIR = "$env:LOCALAPPDATA\Temp\uv-graphify-cache"
$env:UV_PYTHON_INSTALL_DIR = "$env:LOCALAPPDATA\Temp\uv-graphify-python"
$env:UV_TOOL_DIR = "$env:LOCALAPPDATA\Temp\uv-graphify-tools"
$env:TEMP = "$env:LOCALAPPDATA\Temp"
$env:TMP = "$env:LOCALAPPDATA\Temp"

$graphifyExe = Join-Path $env:UV_TOOL_DIR 'graphifyy\Scripts\graphify.exe'

# LocalAppData\Temp can be cleaned by Windows. Test the already-installed tool
# directly so a healthy invocation never contacts PyPI. If Windows removed part
# of either the managed Python or the tool environment, rebuild only these
# dedicated directories. --no-bin and --no-registry prevent uv from touching a
# global Python launcher or the Windows registry.
$graphifyHealthy = $false
if (Test-Path -LiteralPath $graphifyExe) {
  & $graphifyExe --version *> $null
  $graphifyHealthy = $LASTEXITCODE -eq 0
}

if (-not $graphifyHealthy) {
  Write-Host '[graphify] Runtime uv incomplet ou absent; reparation automatique...'

  & uv python install 3.14 --reinstall --no-bin --no-registry
  if ($LASTEXITCODE -ne 0) {
    throw 'Impossible de reparer le runtime Python gere par uv pour Graphify.'
  }

  & uv tool install --force --python 3.14 graphifyy
  if ($LASTEXITCODE -ne 0) {
    throw 'Impossible de reinstaller Graphify dans son environnement uv dedie.'
  }
}

& $graphifyExe @GraphifyArguments
exit $LASTEXITCODE
