Set WshShell = CreateObject("WScript.Shell")
Set Shortcut = WshShell.CreateShortcut(WshShell.SpecialFolders("Desktop") & "\卜桐乐 - 个人网站.lnk")
Shortcut.TargetPath = "C:\Users\卜\Desktop\kimi\level18-room\magazine\启动网站.bat"
Shortcut.WorkingDirectory = "C:\Users\卜\Desktop\kimi\level18-room\magazine"
Shortcut.IconLocation = "%SystemRoot%\System32\shell32.dll,14"
Shortcut.Description = "卜桐乐个人网站"
Shortcut.Save
WScript.Echo "快捷方式已创建到桌面"
