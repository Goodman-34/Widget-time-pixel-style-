[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=Install Pixel Drive Clock?
DisplayLicense=
FinishMessage=Instalasi selesai. Aplikasi diletakkan di %APPDATA%\PixelDriveClock
TargetName=dist\PixelDriveClock-1.0.2-setup.exe
FriendlyName=Pixel Drive Clock
AppLaunched=cmd /c mkdir "%APPDATA%\PixelDriveClock" & copy /Y PixelDriveClock-1.0.2-portable.exe "%APPDATA%\PixelDriveClock\PixelDriveClock.exe" & "%APPDATA%\PixelDriveClock\PixelDriveClock.exe"
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
[SourceFiles]
SourceFiles0=dist\PixelDriveClock\
[SourceFiles0]
PixelDriveClock-1.0.2-portable.exe=
