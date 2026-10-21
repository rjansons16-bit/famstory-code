Option Explicit

' Starts supervisor.ps1 with no console window.
'
' The last argument, True, keeps this wscript process alive for as long as the
' supervisor runs. That is what lets the scheduled task's
' MultipleInstances=IgnoreNew refuse a second copy: while this script is waiting,
' the task still counts as running.

Dim shell, here, command
Set shell = CreateObject("WScript.Shell")

here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ _
    & here & "\supervisor.ps1"""

shell.Run command, 0, True
