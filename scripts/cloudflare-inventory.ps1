# Read-only Cloudflare inventory. Only schema metadata is queried from D1.
[CmdletBinding()]
param([string]$OutputPath = 'runtime/cloudflare-inventory.json')
$ErrorActionPreference = 'Stop'
$accountId = '195eca5460da6b1ff32998d01587182d'
$databaseId = 'fb0490a9-6615-47d6-b3c0-2ab66b79b08b'
$credentialPath = Join-Path $env:LOCALAPPDATA 'DeFly/cloudflare-token.dpapi'
$apiToken = $env:CLOUDFLARE_API_TOKEN
if (-not $apiToken) {
    $secureToken = Get-Content -LiteralPath $credentialPath | ConvertTo-SecureString
    $apiToken = [Net.NetworkCredential]::new('', $secureToken).Password
}
$headers = @{ Authorization = "Bearer $apiToken" }
function Read-Cf([string]$Path, [string]$Sql = '') {
    try {
        $requestArgs = @{Uri = "https://api.cloudflare.com/client/v4/$Path"; Headers = $headers}
        if ($Sql) { $requestArgs.Method = 'POST'; $requestArgs.ContentType = 'application/json'; $requestArgs.Body = @{sql=$Sql} | ConvertTo-Json }
        $response = Invoke-RestMethod @requestArgs
        if (-not $response.success) { throw 'Cloudflare returned success=false' }
        return $response.result
    } catch {
        # Do not serialize request objects, response bodies or authentication headers.
        throw "Cloudflare inventory request failed: $Path; HTTP $([int]$_.Exception.Response.StatusCode)"
    }
}
try {
    $prefix = "accounts/$accountId"
    $verified = Read-Cf "$prefix/tokens/verify"
    $project = Read-Cf "$prefix/pages/projects/flydesk-v2-trial"
    $settings = Read-Cf "$prefix/workers/scripts/flydesk-v2-trial-worker/settings"
    $database = Read-Cf "$prefix/d1/database/$databaseId"
    $tables = Read-Cf "$prefix/d1/database/$databaseId/query" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    $migrations = Read-Cf "$prefix/d1/database/$databaseId/query" 'SELECT name, applied_at FROM d1_migrations ORDER BY id'
    $latestDeployment = (Read-Cf "$prefix/workers/scripts/flydesk-v2-trial-worker/deployments").deployments | Select-Object -First 1
    $bindings = @($settings.bindings | ForEach-Object {
        $entry = @{name=$_.name;type=$_.type}
        foreach ($field in @('id','namespace_id','class_name','service','environment')) {
            if ($_.$field) { $entry[$field] = $_.$field }
        }
        if ($_.type -eq 'plain_text' -and $_.name -in @('APP_ENV','PAPER_ONLY','ALLOWED_ORIGIN')) { $entry.value=$_.text }
        $entry
    })
    $snapshot = [ordered]@{
        observed_at_utc = [DateTime]::UtcNow.ToString('o')
        account = @{id=$accountId;name='testcf';token_status=$verified.status}
        pages = @{name=$project.name;id=$project.id;domains=$project.domains;production_branch=$project.production_branch;source_type=$project.source.type;source_owner=$project.source.config.owner;source_repo=$project.source.config.repo_name;uses_functions=$project.uses_functions;deployment=@{id=$project.canonical_deployment.id;url=$project.canonical_deployment.url;created_on=$project.canonical_deployment.created_on;status=$project.canonical_deployment.latest_stage.status;trigger=$project.canonical_deployment.deployment_trigger.type;commit=$project.canonical_deployment.deployment_trigger.metadata.commit_hash}}
        worker = @{name='flydesk-v2-trial-worker';compatibility_date=$settings.compatibility_date;bindings=$bindings;subdomain=(Read-Cf "$prefix/workers/subdomain");schedules=(Read-Cf "$prefix/workers/scripts/flydesk-v2-trial-worker/schedules");deployment=($latestDeployment | Select-Object id,source,created_on,versions)}
        d1 = @{name=$database.name;id=$database.uuid;file_size=$database.file_size;tables=@($tables.results.name);migration_history=@($migrations.results | Where-Object {$_})}
        durable_objects = @(Read-Cf "$prefix/workers/durable_objects/namespaces" | Where-Object script -eq 'flydesk-v2-trial-worker' | Select-Object id,name,script,class,use_sqlite)
    }
    $parent = Split-Path -Parent $OutputPath
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $snapshot | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $OutputPath -Encoding utf8
    Write-Output "Saved sanitized inventory: $OutputPath"
} finally { $apiToken=$null; $headers=$null; $secureToken=$null }
