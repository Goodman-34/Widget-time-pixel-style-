[Setup]
AppName=Pixel Drive Clock
AppVersion=1.0.2
DefaultDirName={autopf}\Pixel Drive Clock
DefaultGroupName=Pixel Drive Clock
OutputDir=dist
OutputBaseFilename=PixelDriveClock-1.0.2-setup
Compression=lzma
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\PixelDriveClock.exe

[Files]
Source: "dist\PixelDriveClock\PixelDriveClock-win_x64.exe"; DestDir: "{app}"; DestName: "PixelDriveClock.exe"; Flags: ignoreversion
Source: "dist\PixelDriveClock\resources.neu"; DestDir: "{app}"; Flags: ignoreversion
Source: "src\assets\icon.png"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Pixel Drive Clock"; Filename: "{app}\PixelDriveClock.exe"
Name: "{autodesktop}\Pixel Drive Clock"; Filename: "{app}\PixelDriveClock.exe"

[Run]
Filename: "{app}\PixelDriveClock.exe"; Description: "Launch Pixel Drive Clock"; Flags: nowait postinstall skipifsilent
