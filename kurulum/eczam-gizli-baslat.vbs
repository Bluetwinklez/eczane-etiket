' Eczam sunucusunu pencere acmadan baslatir (Windows acilisinda kullanilir)
Set kabuk = CreateObject("WScript.Shell")
klasor = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
kabuk.Run """" & klasor & "\eczam-sunucu.bat""", 0, False
