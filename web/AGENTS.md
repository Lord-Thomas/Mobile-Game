## graphify

On Windows, do not call `graphify` directly and do not duplicate the uv setup
inline. Always use the project's self-healing wrapper:

```powershell
.\scripts\graphify.ps1 query "question" --budget 2000
.\scripts\graphify.ps1 explain "SymbolName"
.\scripts\graphify.ps1 affected "SymbolName"
.\scripts\graphify.ps1 update .
```

The wrapper routes uv to LocalAppData Temp and automatically reinstalls only
Graphify's dedicated managed Python/tool environment if Windows has partially
cleaned those temporary directories.

PowerShell must route uv's runtime/cache directories to LocalAppData Temp first,
otherwise uv may fail with `AppData\Local\uv\cache ... Acces refuse` or rename
errors under `Documents`. `scripts/graphify.ps1` owns this setup.

The wrapper internally uses this form:

```powershell
$env:UV_CACHE_DIR = "$env:LOCALAPPDATA\Temp\uv-graphify-cache"
$env:UV_PYTHON_INSTALL_DIR = "$env:LOCALAPPDATA\Temp\uv-graphify-python"
$env:UV_TOOL_DIR = "$env:LOCALAPPDATA\Temp\uv-graphify-tools"
$env:TEMP = "$env:LOCALAPPDATA\Temp"
$env:TMP = "$env:LOCALAPPDATA\Temp"
uv tool run --from graphifyy graphify ...
```

N’essaie pas de trouver un autre Python pour lancer graphify.exe.

Le launcher Windows graphify.exe pointe vers un ancien Python supprimé, donc
utilise le wrapper auto-réparateur à la place :

```powershell
.\scripts\graphify.ps1 query "chargement lent warmup runtime customize OutdoorNeighborhood main thread long tasks player.glb ballon.glb" --budget 2000
```

Si cette commande échoue aussi, continue sans Graphify et lis seulement les zones de code liées à loadTiming, ShaderWarmupGate, OutdoorNeighborhood et aux chargements GLB/FBX.

Examples:
```powershell
.\scripts\graphify.ps1 query "question" --budget 2000
.\scripts\graphify.ps1 explain "SymbolName"
.\scripts\graphify.ps1 affected "SymbolName"
```

The direct `graphify.exe` launcher may point to an invalid local Python installation.

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `.\scripts\graphify.ps1 update .` to keep the graph current (AST-only, no API cost).
