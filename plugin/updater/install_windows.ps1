$rootDir = (Get-Location).Path | Split-Path -Parent | Split-Path -Parent
$appPath = Join-Path -Path $rootDir -ChildPath "app"
$appsrcPath = Join-Path -Path $rootDir -ChildPath "appsrc"
$windowHTMLPath = Join-Path -Path $rootDir -ChildPath "window.html"
$windowHTMLBakPath = Join-Path -Path $rootDir -ChildPath "window.html.bak"
$pluginScript = "<script src=`"./plugin/index.js`" defer=`"defer`"></script>"
$oldFrameScript = "<script src=`"./app/window/frame.js`" defer=`"defer`"></script>"
$newFrameScript = "<script src=`"./appsrc/window/frame.js`" defer=`"defer`"></script>"
$frameScript = ""
$banner = @"
____________________________________________________________________
   ______                                      __            _
  /_  __/_  ______  ____  _________ _   ____  / /_  ______ _(_)___
   / / / / / / __ \/ __ \/ ___/ __ ``/  / __ \/ / / / / __ ``/ / __ \
  / / / /_/ / /_/ / /_/ / /  / /_/ /  / /_/ / / /_/ / /_/ / / / / /
 /_/  \__, / .___/\____/_/   \__,_/  / .___/_/\__,_/\__, /_/_/ /_/
     /____/_/                       /_/            /____/
                        Designed by obgnail
              https://github.com/obgnail/typora_plugin
____________________________________________________________________
"@

function echo {[CmdletBinding()]param ($msg) Write-Host $msg; CMD /c PAUSE; Exit}
function panic {[CmdletBinding()]param ($msg) Write-Error $msg; CMD /c PAUSE; Exit}

Write-Host $banner
Write-Host ""
Write-Host "[1/5] check whether file window.html exists in $rootDir"
if (!(Test-Path -Path $windowHTMLPath)) {
    panic "window.html does not exist in $rootDir"
}

Write-Host "[2/5] check whether folder app/appsrc exists in $rootDir"
if (Test-Path -Path $appsrcPath) {
    $frameScript = $newFrameScript
} elseif (Test-Path -Path $appPath) {
    $frameScript = $oldFrameScript
} else {
    panic "appsrc/app does not exist in $rootDir"
}

$fileContent = Get-Content -Path $windowHTMLPath -Encoding UTF8 -Raw
$replacement = -Join($frameScript, $pluginScript)

Write-Host "[3/5] check window.html content"
if (!$fileContent.Contains($frameScript)) {
    panic "window.html does not contains $frameScript"
}
if ($fileContent.Contains($pluginScript)) {
    echo "plugin has already been installed"
}

Write-Host "[4/5] backup window.html"
Copy-Item -Path $windowHTMLPath -Destination $windowHTMLBakPath

Write-Host "[5/5] update window.html"
$newFileContent = $fileContent -Replace [Regex]::Escape($frameScript), $replacement
Set-Content -Path $windowHTMLPath -Value $newFileContent -Encoding UTF8
echo "plugin installed successfully"
