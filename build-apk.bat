@echo off
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=C:\Users\winst\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%PATH%
cd /d D:\COFI PROJECTS\TRADELINE GIT PROJECTS\loanmanagementapp\android
echo Starting build at %date% %time% > build-output.log
call gradlew.bat assembleRelease >> build-output.log 2>&1
echo Build finished at %date% %time% >> build-output.log
