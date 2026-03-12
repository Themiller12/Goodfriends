# Script pour générer les icônes Android à partir du logo

# Vérifier si ImageMagick est installé
$imageMagickPath = Get-Command magick -ErrorAction SilentlyContinue

if (-not $imageMagickPath) {
    Write-Host "ImageMagick n'est pas installe." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "OPTION 1 - Installation automatique (recommande):" -ForegroundColor Green
    Write-Host "winget install ImageMagick.ImageMagick"
    Write-Host ""
    Write-Host "OPTION 2 - Utilisation d'un service en ligne:" -ForegroundColor Cyan
    Write-Host "1. Allez sur https://icon.kitchen ou https://appicon.co"
    Write-Host "2. Televersez le fichier 'goodfriends.png'"
    Write-Host "3. Generez les icones Android"
    Write-Host "4. Telechargez et extrayez dans android/app/src/main/res/"
    Write-Host ""
    Write-Host "OPTION 3 - Copie manuelle (temporaire):" -ForegroundColor Yellow
    Write-Host "Copiez manuellement goodfriends.png vers chaque dossier mipmap-*"
    Write-Host "et renommez-le en ic_launcher.png"
    exit
}

# Tailles des icônes pour Android
$sizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

$sourceLogo = "goodfriends.png"
$resPath = "android\app\src\main\res"

Write-Host "Generation des icones Android..." -ForegroundColor Green

foreach ($folder in $sizes.Keys) {
    $size = $sizes[$folder]
    $outputPath = "$resPath\$folder"
    
    if (-not (Test-Path $outputPath)) {
        New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
    }
    
    # Générer ic_launcher.png
    Write-Host "Generation de $folder/ic_launcher.png (${size}x${size})..."
    & magick $sourceLogo -resize "${size}x${size}" "$outputPath\ic_launcher.png"
    
    # Copier aussi pour ic_launcher_round.png (version simplifiée)
    Write-Host "Generation de $folder/ic_launcher_round.png (${size}x${size})..."
    & magick $sourceLogo -resize "${size}x${size}" "$outputPath\ic_launcher_round.png"
}

Write-Host ""
Write-Host "Icones generees avec succes!" -ForegroundColor Green
Write-Host "Les fichiers ont ete crees dans: $resPath" -ForegroundColor Cyan
