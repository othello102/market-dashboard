# 사용법: powershell -File build-apk.ps1   (www 수정 후 APK 재빌드)
# Gradle이 한글 경로를 거부하므로 영문 경로로 복사해서 빌드합니다.
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$src = $PSScriptRoot
node "$src\tools\make-version.js"
$dst = "D:\claude\market-build"
robocopy $src $dst /MIR /XD .gradle build /NFL /NDL /NJH /NJS | Out-Null
Set-Location $dst
npx cap sync android
Set-Location "$dst\android"
.\gradlew.bat assembleDebug --no-daemon
Copy-Item "$dst\android\app\build\outputs\apk\debug\app-debug.apk" "$src\market-dashboard.apk" -Force
Write-Host "완료: $src\market-dashboard.apk"
