; main.js registers a login item (HKCU Run value "ClaudePet") via
; app.setLoginItemSettings. Remove it on a real uninstall so no dangling
; startup entry is left behind. Skip on updates: the new version
; re-registers it on its first launch.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ClaudePet"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "ClaudePet"
  ${endIf}
!macroend
