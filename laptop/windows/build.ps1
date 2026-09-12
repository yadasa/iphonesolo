param([ValidateSet('win-x64','win-arm64')][string]$Runtime = 'win-x64')
$ErrorActionPreference = 'Stop'
$outputDirectory = Join-Path $PSScriptRoot "out\$Runtime"
dotnet publish (Join-Path $PSScriptRoot 'LaptopSolo.csproj') -c Release -r $Runtime --self-contained true -o $outputDirectory
if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
Copy-Item (Join-Path $PSScriptRoot 'install.ps1'),(Join-Path $PSScriptRoot 'uninstall.ps1') $outputDirectory
Copy-Item (Join-Path $PSScriptRoot '..\README.md') $outputDirectory
Write-Host "Ready: $outputDirectory"
