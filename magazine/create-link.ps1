$ws = New-Object -ComObject WScript.Shell
$desktop = $ws.SpecialFolders("Desktop")
$sc = $ws.CreateShortcut("$desktop\卜桐乐 - 个人网站.lnk")
$sc.TargetPath = "C:\Users\卜\Desktop\kimi\level18-room\magazine\启动网站.bat"
$sc.WorkingDirectory = "C:\Users\卜\Desktop\kimi\level18-room\magazine"
$sc.IconLocation = "%SystemRoot%\System32\shell32.dll,14"
$sc.Description = "Personal Website"
$sc.Save()
