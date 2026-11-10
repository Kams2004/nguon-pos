; Nguon POS installer hooks (Tauri NSIS). The till's local server runs as
; the Windows service "NguonEdge" (WinSW, LocalSystem); its data — the
; encrypted database and the DPAPI-protected key — lives in
; %ProgramData%\NguonPOS and is kept on update and uninstall.

!macro NSIS_HOOK_PREINSTALL
  ; Update: stop the running service before its files are replaced.
  IfFileExists "$INSTDIR\edge\nguon-edge.exe" 0 +2
    nsExec::Exec '"$INSTDIR\edge\nguon-edge.exe" stop'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Data folder: SYSTEM and Administrators only (SIDs, so localized Windows works too).
  CreateDirectory "$COMMONAPPDATA\NguonPOS\edge"
  nsExec::Exec 'icacls "$COMMONAPPDATA\NguonPOS" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F"'
  ; Register (first install) and start the service.
  nsExec::Exec '"$INSTDIR\edge\nguon-edge.exe" install'
  nsExec::Exec '"$INSTDIR\edge\nguon-edge.exe" start'
  ; The service writes its UI token on first start; local users may read it
  ; (the till app runs as the logged-in user), nothing else in the folder.
  StrCpy $0 0
  nguon_wait_token:
    IfFileExists "$COMMONAPPDATA\NguonPOS\edge\ui-token" nguon_token_ready
    Sleep 1000
    IntOp $0 $0 + 1
    IntCmp $0 60 nguon_token_ready nguon_wait_token nguon_token_ready
  nguon_token_ready:
  nsExec::Exec 'icacls "$COMMONAPPDATA\NguonPOS\edge\ui-token" /grant "*S-1-5-32-545:R"'
  ; Tills of the same gate sync with each other on the LAN (TLS with device
  ; certificates on TCP 47310, announcements on UDP 47311): open them for the
  ; service's Java, on private and domain networks only — never public Wi-Fi.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Nguon POS peers"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Nguon POS peers" dir=in action=allow protocol=TCP localport=47310 profile=private,domain program="$INSTDIR\edge\jre\bin\java.exe"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Nguon POS peers" dir=in action=allow protocol=UDP localport=47311 profile=private,domain program="$INSTDIR\edge\jre\bin\java.exe"'
  ; A "Nguon POS" icon on the desktop of every account (perMachine: the
  ; public desktop), also restored by updates if someone deleted it.
  SetShellVarContext all
  CreateShortCut "$DESKTOP\Nguon POS.lnk" "$INSTDIR\nguon-pos.exe" "" "$INSTDIR\nguon-pos.exe" 0
  ; Automatic updates run this installer silently from a SYSTEM task, which
  ; closes the till app. This task reopens it in the session of whoever is
  ; logged on (group Users, by SID).
  nsExec::Exec `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$a = New-ScheduledTaskAction -Execute '$INSTDIR\nguon-pos.exe'; $$p = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited; Register-ScheduledTask -TaskPath '\NguonPOS\' -TaskName 'Launch' -Action $$a -Principal $$p -Force | Out-Null"`
  IfSilent 0 nguon_not_silent
    nsExec::Exec 'schtasks /Run /TN "NguonPOS\Launch"'
  nguon_not_silent:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec '"$INSTDIR\edge\nguon-edge.exe" stop'
  nsExec::Exec '"$INSTDIR\edge\nguon-edge.exe" uninstall'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Nguon POS peers"'
  nsExec::Exec 'schtasks /Delete /TN "NguonPOS\Launch" /F'
  nsExec::Exec 'schtasks /Delete /TN "NguonPOS\Update" /F'
  SetShellVarContext all
  Delete "$DESKTOP\Nguon POS.lnk"
!macroend
