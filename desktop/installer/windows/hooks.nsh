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
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec '"$INSTDIR\edge\nguon-edge.exe" stop'
  nsExec::Exec '"$INSTDIR\edge\nguon-edge.exe" uninstall'
!macroend
