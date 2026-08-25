param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $GraphifyArguments
)

$env:UV_CACHE_DIR = "$env:LOCALAPPDATA\Temp\uv-graphify-cache"
$env:UV_PYTHON_INSTALL_DIR = "$env:LOCALAPPDATA\Temp\uv-graphify-python"
$env:UV_TOOL_DIR = "$env:LOCALAPPDATA\Temp\uv-graphify-tools"
$env:TEMP = "$env:LOCALAPPDATA\Temp"
$env:TMP = "$env:LOCALAPPDATA\Temp"

# LocalAppData\Temp can be cleaned by Windows. In that case uv may retain a
# partially installed managed Python (standard library present, python.exe
# missing). Detect that state through a real Graphify invocation and rebuild
# only the dedicated uv runtime when necessary.
& uv tool run --from graphifyy graphify --version *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host '[graphify] Runtime uv incomplet ou absent; reparation automatique...'

  & uv python uninstall 3.14 *> $null
  & uv python install 3.14 --force
  if ($LASTEXITCODE -ne 0) {
    throw 'Impossible de reparer le runtime Python gere par uv pour Graphify.'
  }

  & uv tool install --force --python 3.14 graphifyy
  if ($LASTEXITCODE -ne 0) {
    throw 'Impossible de reinstaller Graphify dans son environnement uv dedie.'
  }
}

& uv tool run --from graphifyy graphify @GraphifyArguments
exit $LASTEXITCODE
