; Bear's additions to the Windows (NSIS) installer. electron-builder includes build/installer.nsh
; automatically.
;
; The second screen depends on whether Bear is already installed (for the choice made on the
; first screen, "Only for me" or "Anyone who uses this computer"):
;   - not installed: Choose Install Location
;   - installed:     Repair or Update, in the folder Bear is already in
; electron-builder's own location page is turned off (allowToChangeInstallationDirectory: false
; in electron-builder.yml) and recreated here, so the two pages can share that slot.

!macro customHeader
  ; Visual styles, so Repair and Update render as modern Windows command-link buttons.
  XPStyle on
!macroend

!ifndef BUILD_UNINSTALLER

Var bearInstalledFolder
Var bearInstalledVersion
Var bearAction        ; "repair" or "update", chosen on the Repair or Update screen
Var bearDefaultAction ; what Next does on that screen; "" when neither applies
Var bearChoseFolder   ; "1" once the user has been through Choose Install Location
Var bearRepairButton
Var bearUpdateButton

!macro customPageAfterChangeDir
  !include WordFunc.nsh

  Page custom bearMaintenancePre bearMaintenanceLeave

  !define MUI_PAGE_CUSTOMFUNCTION_PRE bearDirectoryPre
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE bearDirectoryLeave
  !insertmacro MUI_PAGE_DIRECTORY

  ; Applies to the install page that electron-builder adds next.
  !define MUI_PAGE_CUSTOMFUNCTION_PRE bearInstFilesPre
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW bearInstFilesShow

  ; Where Bear is installed for the install mode chosen on the first screen, or "".
  Function bearFindInstall
    ${if} $installMode == "all"
      StrCpy $bearInstalledFolder $perMachineInstallationFolder
    ${else}
      StrCpy $bearInstalledFolder $perUserInstallationFolder
    ${endif}
    ReadRegStr $bearInstalledVersion SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  FunctionEnd

  Function bearMaintenancePre
    StrCpy $bearAction ""
    Call bearFindInstall
    ${if} $bearInstalledFolder == ""
      Abort ; fresh install: show Choose Install Location instead
    ${endif}

    !insertmacro MUI_HEADER_TEXT "Bear is already installed" "Repair it, or update it to version ${VERSION}."

    nsDialogs::Create 1018
    Pop $0

    ${if} $bearInstalledVersion == ""
      StrCpy $1 "Bear is installed in $bearInstalledFolder."
    ${else}
      StrCpy $1 "Bear $bearInstalledVersion is installed in $bearInstalledFolder."
    ${endif}
    ${NSD_CreateLabel} 0u 0u 100% 18u "$1"
    Pop $0
    ${NSD_CreateLabel} 0u 20u 100% 10u "Your documents, notebooks, tasks and settings are kept either way."
    Pop $0

    ; 0 = same version, 1 = this setup is newer, 2 = the installed Bear is newer.
    ${if} $bearInstalledVersion == ""
      StrCpy $2 1
    ${else}
      ${VersionCompare} "${VERSION}" "$bearInstalledVersion" $2
    ${endif}

    ; BS_COMMANDLINK (0x0E): a large button with a title and a description (set with BCM_SETNOTE).
    nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${WS_TABSTOP}|0x0E 0 0u 36u 100% 40u "Repair"
    Pop $bearRepairButton
    nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${WS_TABSTOP}|0x0E 0 0u 80u 100% 40u "Update"
    Pop $bearUpdateButton
    ${NSD_OnClick} $bearRepairButton bearRepairClicked
    ${NSD_OnClick} $bearUpdateButton bearUpdateClicked

    ${if} $2 == 2
      SendMessage $bearRepairButton 0x1609 0 "STR:Not available: the installed Bear ($bearInstalledVersion) is newer than this setup (${VERSION})."
      EnableWindow $bearRepairButton 0
      SendMessage $bearUpdateButton 0x1609 0 "STR:Not available: you already have a newer version. To go back to ${VERSION}, uninstall Bear first."
      EnableWindow $bearUpdateButton 0
      StrCpy $bearDefaultAction ""
    ${else}
      SendMessage $bearRepairButton 0x1609 0 "STR:Reinstall Bear's program files, shortcuts and file types, and clear its caches. Fixes Bear if it won't start or behaves oddly."
      ${if} $2 == 1
        SendMessage $bearUpdateButton 0x1609 0 "STR:Replace Bear $bearInstalledVersion with Bear ${VERSION}."
        StrCpy $bearDefaultAction "update"
      ${else}
        SendMessage $bearUpdateButton 0x1609 0 "STR:You already have the latest version (${VERSION}). To update, run a newer Bear setup."
        EnableWindow $bearUpdateButton 0
        StrCpy $bearDefaultAction "repair"
      ${endif}
    ${endif}

    ; Next does the recommended action; with nothing to do, only Back and Cancel are left.
    GetDlgItem $0 $HWNDPARENT 1
    ${if} $bearDefaultAction == ""
      EnableWindow $0 0
    ${else}
      EnableWindow $0 1
    ${endif}

    nsDialogs::Show
  FunctionEnd

  ; Clicking Repair or Update starts it straight away, as if the user pressed Next.
  Function bearRepairClicked
    Pop $0
    StrCpy $bearAction "repair"
    SendMessage $HWNDPARENT 0x408 1 0
  FunctionEnd

  Function bearUpdateClicked
    Pop $0
    StrCpy $bearAction "update"
    SendMessage $HWNDPARENT 0x408 1 0
  FunctionEnd

  Function bearMaintenanceLeave
    ${if} $bearAction == ""
      StrCpy $bearAction $bearDefaultAction
    ${endif}
  FunctionEnd

  Function bearDirectoryPre
    StrCpy $bearChoseFolder "0"
    ${if} $bearInstalledFolder != ""
      Abort ; repairing or updating: keep the folder Bear is already in
    ${endif}
  FunctionEnd

  Function bearDirectoryLeave
    StrCpy $bearChoseFolder "1"
  FunctionEnd

  Function bearInstFilesPre
    ; A folder picked on Choose Install Location gets its own Bear sub-folder (as electron-builder's
    ; page does), so installing to e.g. D:\Apps doesn't spread Bear's files across D:\Apps.
    ${if} $bearChoseFolder == "1"
      StrLen $0 "\${APP_FILENAME}"
      StrCpy $1 $INSTDIR "" -$0
      ${if} $1 != "\${APP_FILENAME}"
        StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
      ${endif}
    ${endif}
  FunctionEnd

  ; Replaces the "Installing" header (MUI sets that after the pre function, so this runs on show).
  Function bearInstFilesShow
    ${if} $bearAction == "repair"
      !insertmacro MUI_HEADER_TEXT "Repairing" "Please wait while Bear is being repaired."
    ${elseif} $bearAction == "update"
      !insertmacro MUI_HEADER_TEXT "Updating" "Please wait while Bear is being updated to ${VERSION}."
    ${endif}
  FunctionEnd
!macroend

; Runs at the end of installation. Program files, shortcuts and file types have just been written
; fresh, which is the bulk of a repair; a repair also clears Electron's caches, a common cause of a
; blank or broken window. User data (documents, notebooks, settings) is never touched.
!macro customInstall
  ${if} $bearAction == "repair"
    ; Caches live in the current user's profile, also for a machine-wide install.
    SetShellVarContext current
    ; Electron names the folder after package.json "name" (@bear/desktop).
    StrCpy $0 "$APPDATA\@bear\desktop"
    RMDir /r "$0\Cache"
    RMDir /r "$0\Code Cache"
    RMDir /r "$0\GPUCache"
    RMDir /r "$0\DawnGraphiteCache"
    RMDir /r "$0\DawnWebGPUCache"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
    DetailPrint "Bear has been repaired."
  ${elseif} $bearAction == "update"
    DetailPrint "Bear has been updated from $bearInstalledVersion to ${VERSION}."
  ${endif}
!macroend

!endif
