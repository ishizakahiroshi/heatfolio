Option Explicit

' run-fetch.vbs runs heatfolio's price-fetch batch (fetch-prices.mjs) via Node with
' NO console window, for Windows Task Scheduler use. Modeled on ShotTTL's
' run-hidden.vbs: it resolves paths relative to this script, uses an absolute
' node.exe path (falling back to PATH), fails loud into a log if node or the target
' script is missing, and runs synchronously so Task Scheduler receives the real
' Node exit code.
'
' Task Scheduler action:
'   Program/script : wscript.exe
'   Add arguments  : "<repo>\scripts\run-fetch.vbs"  (このファイルの絶対パス)

Dim shell
Dim fso
Dim scriptDir
Dim jsScript
Dim nodeExe
Dim command
Dim exitCode

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
jsScript = fso.BuildPath(scriptDir, "fetch-prices.mjs")

If Not fso.FileExists(jsScript) Then
    LogStartupError "fetch-prices.mjs not found at " & jsScript
    WScript.Quit 2
End If

nodeExe = fso.BuildPath(shell.ExpandEnvironmentStrings("%ProgramFiles%"), "nodejs\node.exe")
If Not fso.FileExists(nodeExe) Then
    ' Fall back to PATH resolution so unusual layouts still work.
    nodeExe = "node.exe"
End If

' fetch-prices.mjs resolves its data paths from its own location, so no working
' directory is required here.
command = Quote(nodeExe) & " " & Quote(jsScript)

' Window style 0 keeps Node hidden (no black console window).
' bWaitOnReturn = True so that Node's exit code propagates to Task Scheduler.
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode

' Quote a single argument following the rules CommandLineToArgvW expects:
'   - Embedded backslash runs that precede a double quote are doubled.
'   - Each embedded double quote is then escaped as \".
'   - Trailing backslashes (right before the closing quote) are doubled.
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

' Append a one-line ERROR record to %APPDATA%\heatfolio\logs\run-fetch_yyyymmdd.log
' so launch-time failures (missing node / fetch-prices.mjs) are visible without a console.
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
    logFile = fso.BuildPath(logDir, "run-fetch_" & Year(Now) & Right("0" & Month(Now), 2) & Right("0" & Day(Now), 2) & ".log")
    Set stream = fso.OpenTextFile(logFile, 8, True)
    If Not stream Is Nothing Then
        stream.WriteLine stamp & " [ERROR] " & message
        stream.Close
    End If
    On Error Goto 0
End Sub
