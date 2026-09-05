Set WshShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' 使用绝对路径的 npm 和 node
npmPath = "C:\Users\卜\AppData\Roaming\CherryStudio\Toolchain\mise\shims\npm"
nodePath = "C:\Users\卜\AppData\Roaming\CherryStudio\Toolchain\mise\shims\node"

WshShell.CurrentDirectory = scriptDir
WshShell.Run "cmd /c """ & npmPath & """ run dev""", 0, False
