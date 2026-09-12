$ErrorActionPreference = 'Stop'
if (Get-Process LaptopSolo -ErrorAction SilentlyContinue) { throw 'Quit Laptop Solo from the tray first.' }
Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name LaptopSolo -ErrorAction SilentlyContinue
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Laptop Solo.lnk'
Remove-Item $shortcutPath -ErrorAction SilentlyContinue
$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs\LaptopSolo'
if (Test-Path $installDirectory) { Remove-Item $installDirectory -Recurse -Force }
Write-Host 'Uninstalled. Preferences remain in LocalAppData\LaptopSolo.'
