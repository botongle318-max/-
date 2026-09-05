$WS = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$SC = $WS.CreateShortcut("$desktop\Level 18 - 3D Room.lnk")
$SC.TargetPath = "C:\Users\卜\Desktop\kimi\level18-room\双击启动.bat"
$SC.WorkingDirectory = "C:\Users\卜\Desktop\kimi\level18-room"
$SC.IconLocation = "C:\Windows\System32\shell32.dll,14"
$SC.Description = "Launch Level 18 3D Personal Website"
$SC.Save()
Write-Host "Done"
