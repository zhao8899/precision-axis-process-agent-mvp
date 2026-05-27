param(
    [string]$BaseUrl = "http://localhost:8080",
    [string]$ConfigPath = ".\tests\smoke.config.example.json",
    [int]$TimeoutSec = 10,
    [int]$RetryCount = 12,
    [int]$RetryDelaySec = 5
)

$ErrorActionPreference = "Stop"

function Resolve-SmokePath {
    param([string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }

    return (Join-Path (Get-Location) $Path)
}

function Join-Url {
    param(
        [string]$Root,
        [string]$Path
    )

    if ($Path -match '^https?://') {
        return $Path
    }

    return ($Root.TrimEnd('/') + '/' + $Path.TrimStart('/'))
}

function ConvertTo-HeaderMap {
    param($Headers)

    $headerMap = @{}
    if ($null -eq $Headers) {
        return $headerMap
    }

    foreach ($property in $Headers.PSObject.Properties) {
        $headerMap[$property.Name] = [string]$property.Value
    }

    return $headerMap
}

function Invoke-SmokeRequest {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [int[]]$ExpectedStatus,
        $Headers,
        $Body,
        [string[]]$RequiredText,
        [string[]]$ForbiddenText,
        [switch]$AllowEmptyBody
    )

    $requestParams = @{
        Uri             = $Url
        Method          = $Method
        TimeoutSec      = $TimeoutSec
        UseBasicParsing = $true
        Headers         = (ConvertTo-HeaderMap $Headers)
    }

    if ($null -ne $Body) {
        $requestParams["Body"] = ($Body | ConvertTo-Json -Depth 20 -Compress)
        if (-not $requestParams.Headers.ContainsKey("Content-Type")) {
            $requestParams.Headers["Content-Type"] = "application/json; charset=utf-8"
        }
    }

    try {
        $response = Invoke-WebRequest @requestParams
        $statusCode = [int]$response.StatusCode
        $content = [string]$response.Content
    }
    catch {
        $webResponse = $_.Exception.Response
        if ($null -eq $webResponse) {
            throw
        }

        $statusCode = [int]$webResponse.StatusCode
        $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
        $content = $reader.ReadToEnd()
        $reader.Dispose()
    }

    if ($ExpectedStatus -notcontains $statusCode) {
        throw "[$Name] expected HTTP $($ExpectedStatus -join ',') but got $statusCode from $Url"
    }

    if (-not $AllowEmptyBody -and [string]::IsNullOrWhiteSpace($content)) {
        throw "[$Name] response body is empty: $Url"
    }

    foreach ($text in $RequiredText) {
        if (-not $content.Contains($text)) {
            throw "[$Name] missing required text '$text' in response from $Url"
        }
    }

    foreach ($text in $ForbiddenText) {
        if ($content.Contains($text)) {
            throw "[$Name] contains forbidden text '$text' in response from $Url"
        }
    }

    [PSCustomObject]@{
        name   = $Name
        method = $Method
        url    = $Url
        status = $statusCode
        result = "pass"
    }
}

$resolvedConfig = Resolve-SmokePath $ConfigPath
if (-not (Test-Path $resolvedConfig)) {
    throw "Smoke config not found: $resolvedConfig"
}

$config = Get-Content $resolvedConfig -Raw -Encoding UTF8 | ConvertFrom-Json
$results = New-Object System.Collections.Generic.List[object]

$health = $config.health
if ($null -ne $health) {
    $healthPath = if ($health.path) { $health.path } else { "/health" }
    $healthMethod = if ($health.method) { $health.method } else { "GET" }
    $healthExpected = if ($health.expectedStatus) { [int[]]$health.expectedStatus } else { @(200) }
    $healthUrl = Join-Url $BaseUrl $healthPath

    $lastError = $null
    for ($attempt = 1; $attempt -le $RetryCount; $attempt++) {
        try {
            $results.Add((Invoke-SmokeRequest `
                -Name "health" `
                -Method $healthMethod `
                -Url $healthUrl `
                -ExpectedStatus $healthExpected `
                -Headers $health.headers `
                -RequiredText $health.requiredText `
                -ForbiddenText $health.forbiddenText `
                -AllowEmptyBody:([bool]$health.allowEmptyBody)))
            $lastError = $null
            break
        }
        catch {
            $lastError = $_
            if ($attempt -lt $RetryCount) {
                Start-Sleep -Seconds $RetryDelaySec
            }
        }
    }

    if ($null -ne $lastError) {
        throw $lastError
    }
}

foreach ($ui in @($config.ui)) {
    $expected = if ($ui.expectedStatus) { [int[]]$ui.expectedStatus } else { @(200) }
    $method = if ($ui.method) { $ui.method } else { "GET" }
    $results.Add((Invoke-SmokeRequest `
        -Name $ui.name `
        -Method $method `
        -Url (Join-Url $BaseUrl $ui.path) `
        -ExpectedStatus $expected `
        -Headers $ui.headers `
        -RequiredText $ui.requiredText `
        -ForbiddenText $ui.forbiddenText `
        -AllowEmptyBody:([bool]$ui.allowEmptyBody)))
}

foreach ($api in @($config.api)) {
    $expected = if ($api.expectedStatus) { [int[]]$api.expectedStatus } else { @(200) }
    $method = if ($api.method) { $api.method } else { "GET" }
    $results.Add((Invoke-SmokeRequest `
        -Name $api.name `
        -Method $method `
        -Url (Join-Url $BaseUrl $api.path) `
        -ExpectedStatus $expected `
        -Headers $api.headers `
        -Body $api.body `
        -RequiredText $api.requiredText `
        -ForbiddenText $api.forbiddenText `
        -AllowEmptyBody:([bool]$api.allowEmptyBody)))
}

$results | Format-Table -AutoSize
Write-Host "MVP smoke passed: $($results.Count) checks against $BaseUrl"
