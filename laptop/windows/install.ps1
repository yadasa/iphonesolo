# Run from the extracted self-contained Windows build. No administrator rights needed.
$ErrorActionPreference = 'Stop'
$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs\LaptopSolo'
$sourceDirectory = $PSScriptRoot
if (-not (Test-Path (Join-Path $sourceDirectory 'LaptopSolo.exe'))) {
    throw 'Extract the Windows build first, then run its install.ps1.'
}
$running = Get-Process LaptopSolo -ErrorAction SilentlyContinue
if ($running) { throw 'Quit Laptop Solo from the tray before installing or updating.' }
if ([IO.Path]::GetFullPath($sourceDirectory) -ne [IO.Path]::GetFullPath($installDirectory)) {
    New-Item -ItemType Directory -Force $installDirectory | Out-Null
    Copy-Item (Join-Path $sourceDirectory '*') $installDirectory -Recurse -Force
}
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Laptop Solo.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcutPath)
$link.TargetPath = Join-Path $installDirectory 'LaptopSolo.exe'
$link.WorkingDirectory = $installDirectory
$link.Save()
Start-Process (Join-Path $installDirectory 'LaptopSolo.exe')
Write-Host 'Installed. Enable launch at sign-in in the app if desired.'
