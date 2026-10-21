Option Explicit

' Starts backup.ps1 with no console window, for the nightly scheduled task.
'
' Waits for it (the last argument, True), so the task stays "running" for as
' long as the backup does and MultipleInstances=IgnoreNew can refuse a second
' one that a late wake-up would otherwise start on top of it.

Dim shell, here, command
Set shell = CreateObject("WScript.Shell")

here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ _
    & here & "\backup.ps1"""

shell.Run command, 0, True
