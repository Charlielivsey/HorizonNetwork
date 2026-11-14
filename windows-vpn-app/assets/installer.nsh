; HN Secure Access Terminal's Windows installer additions (electron-builder nsis.include).
; The app was called HN Secure Network until 31 October 2026. Installing or updating removes the shortcuts made under
; the old name, so Start, search and the desktop only show "HN Secure Access Terminal" (the user's report, 5 November 2026).
!macro customInstall
  Delete "$SMPROGRAMS\HN Secure Gateway.lnk"
  Delete "$DESKTOP\HN Secure Gateway.lnk"
  Delete "$SMPROGRAMS\HN Secure Gateway\HN Secure Gateway.lnk"
  RMDir "$SMPROGRAMS\HN Secure Gateway"
  Delete "$SMPROGRAMS\HN Secure Network.lnk"
  Delete "$DESKTOP\HN Secure Network.lnk"
  Delete "$SMPROGRAMS\HN Secure Network\HN Secure Network.lnk"
  RMDir "$SMPROGRAMS\HN Secure Network"
!macroend
