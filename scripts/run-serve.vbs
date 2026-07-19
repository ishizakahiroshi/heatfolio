Option Explicit

' run-serve.vbs starts heatfolio's local dashboard via Node with
' NO console window, for HKCU Run (sign-in autostart). Modeled on run-fetch.vbs:
' absolute node.exe path (PATH fallback), repo cwd for one-time migration, and
' async launch so login is not blocked by the long-running server.
'
' HKCU\Software\Microsoft\Windows\CurrentVersion\Run\heatfolio-server:
'   wscript.exe "<repo>\scripts\run-serve.vbs"

Dim shell
Dim fso
Dim scriptDir
Dim jsScript
Dim nodeExe
Dim command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
jsScript = fso.BuildPath(scriptDir, "heatfolio.mjs")

If Not fso.FileExists(jsScript) Then
    LogStartupError "heatfolio.mjs not found at " & jsScript
    WScript.Quit 2
End If

nodeExe = fso.BuildPath(shell.ExpandEnvironmentStrings("%ProgramFiles%"), "nodejs\node.exe")
If Not fso.FileExists(nodeExe) Then
    nodeExe = "node.exe"
End If

' Repo root as cwd so legacy data migration can see data/holdings.json once.
shell.CurrentDirectory = fso.GetParentFolderName(scriptDir)
command = Quote(nodeExe) & " " & Quote(jsScript) & " serve"

' Window style 0 = hidden. bWaitOnReturn = False so Run does not block logon.
shell.Run command, 0, False
WScript.Quit 0

Function Quote(value)
    Dim s, i, ch, backslashes, j, result
    s = CStr(value)
    result = Chr(34)
    i = 1
    Do While i <= Len(s)
        backslashes = 0
        Do While i <= Len(s) And Mid(s, i, 1) = "\"
            backslashes = backslashes + 1
            i = i + 1
        Loop
        If i > Len(s) Then
            For j = 1 To backslashes * 2
                result = result & "\"
            Next
        ElseIf Mid(s, i, 1) = Chr(34) Then
            For j = 1 To backslashes * 2
                result = result & "\"
            Next
            result = result & "\" & Chr(34)
            i = i + 1
        Else
            For j = 1 To backslashes
                result = result & "\"
            Next
            result = result & Mid(s, i, 1)
            i = i + 1
        End If
    Loop
    result = result & Chr(34)
    Quote = result
End Function

Sub LogStartupError(message)
    Dim appData, baseDir, logDir, logFile, stream, stamp

    On Error Resume Next
    appData = shell.ExpandEnvironmentStrings("%APPDATA%")
    If Len(appData) = 0 Or appData = "%APPDATA%" Then
        Exit Sub
    End If

    baseDir = fso.BuildPath(appData, "heatfolio")
    logDir = fso.BuildPath(baseDir, "logs")
    If Not fso.FolderExists(baseDir) Then
        fso.CreateFolder baseDir
    End If
    If Not fso.FolderExists(logDir) Then
        fso.CreateFolder logDir
    End If

    stamp = FormatDateTime(Now, vbGeneralDate)
    logFile = fso.BuildPath(logDir, "run-serve_" & Year(Now) & Right("0" & Month(Now), 2) & Right("0" & Day(Now), 2) & ".log")
    Set stream = fso.OpenTextFile(logFile, 8, True)
    If Not stream Is Nothing Then
        stream.WriteLine stamp & " [ERROR] " & message
        stream.Close
    End If
    On Error Goto 0
End Sub
