# Regenerates the Android launcher icons and splash screens from the desktop icon
# (apps/desktop/build/icon.png). Run on Windows after changing the icon:
#   powershell -ExecutionPolicy Bypass -File apps/mobile/scripts/icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Resolve-Path "$PSScriptRoot\.."
$src = [System.Drawing.Image]::FromFile((Resolve-Path "$root\..\desktop\build\icon.png"))
$res = "$root\android\app\src\main\res"
$paper = [System.Drawing.ColorTranslator]::FromHtml('#f5f4f1')

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'
  return $bmp, $g
}

function Save([System.Drawing.Bitmap]$bmp, [string]$path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}

# Launcher icons: legacy square + round (48dp), adaptive foreground (108dp, art in the 72dp safe zone).
$densities = @{ mdpi = 1; hdpi = 1.5; xhdpi = 2; xxhdpi = 3; xxxhdpi = 4 }
foreach ($d in $densities.Keys) {
  $s = [int](48 * $densities[$d]); $dir = "$res\mipmap-$d"

  $bmp, $g = New-Canvas $s $s
  $g.DrawImage($src, 0, 0, $s, $s); $g.Dispose(); Save $bmp "$dir\ic_launcher.png"

  $bmp, $g = New-Canvas $s $s
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath; $path.AddEllipse(0, 0, $s, $s); $g.SetClip($path)
  $g.DrawImage($src, 0, 0, $s, $s); $g.Dispose(); Save $bmp "$dir\ic_launcher_round.png"

  $f = [int](108 * $densities[$d]); $art = [int](72 * $densities[$d]); $o = [int](($f - $art) / 2)
  $bmp, $g = New-Canvas $f $f
  $g.DrawImage($src, $o, $o, $art, $art); $g.Dispose(); Save $bmp "$dir\ic_launcher_foreground.png"
}

# Adaptive icon background: the icon's own paper colour, so the art blends into the mask.
$px = (New-Object System.Drawing.Bitmap $src).GetPixel(256, 24)
$hex = '#{0:X2}{1:X2}{2:X2}' -f $px.R, $px.G, $px.B
Set-Content "$res\values\ic_launcher_background.xml" "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<resources>`n    <color name=`"ic_launcher_background`">$hex</color>`n</resources>"

# Splash screens: the icon centred on Bear's window colour, at each existing splash size.
Get-ChildItem "$res\drawable*\splash.png" | ForEach-Object {
  $old = [System.Drawing.Image]::FromFile($_.FullName); $w = $old.Width; $h = $old.Height; $old.Dispose()
  $bmp, $g = New-Canvas $w $h
  $g.Clear($paper)
  $size = [int]([Math]::Min($w, $h) * 0.28)
  $g.DrawImage($src, [int](($w - $size) / 2), [int](($h - $size) / 2), $size, $size); $g.Dispose()
  Save $bmp $_.FullName
}
"icons written (background $hex)"
