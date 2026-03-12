# Installation du système de connexion GoodFriends

Write-Host "=== Installation des fonctionnalités GoodFriends ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier si MySQL est accessible
Write-Host "Vérification de la connexion MySQL..." -ForegroundColor Yellow
$mysqlPath = "C:\xampp\mysql\bin\mysql.exe"

if (-not (Test-Path $mysqlPath)) {
    Write-Host "Erreur: MySQL n'est pas trouvé à $mysqlPath" -ForegroundColor Red
    Write-Host "Veuillez ajuster le chemin ou installer MySQL." -ForegroundColor Red
    exit 1
}

Write-Host "MySQL trouvé!" -ForegroundColor Green
Write-Host ""

# Demander les informations de connexion
$dbName = "goodfriends"
$dbUser = Read-Host "Nom d'utilisateur MySQL (défaut: root)"
if ([string]::IsNullOrWhiteSpace($dbUser)) {
    $dbUser = "root"
}

$dbPassword = Read-Host "Mot de passe MySQL" -AsSecureString
$dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword)
)

Write-Host ""
Write-Host "Exécution de la migration..." -ForegroundColor Yellow

# Exécuter la migration
$migrationFile = "migration_goodfriends_users.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "Erreur: Fichier $migrationFile non trouvé" -ForegroundColor Red
    exit 1
}

try {
    & $mysqlPath -u $dbUser -p"$dbPasswordPlain" $dbName -e "source $migrationFile"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Migration réussie!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Les nouvelles tables ont été créées:" -ForegroundColor Cyan
        Write-Host "  - user_profiles" -ForegroundColor White
        Write-Host "  - friend_requests" -ForegroundColor White
        Write-Host ""
        Write-Host "La table contacts a été mise à jour avec:" -ForegroundColor Cyan
        Write-Host "  - is_goodfriends_user" -ForegroundColor White
        Write-Host "  - goodfriends_user_id" -ForegroundColor White
        Write-Host ""
        Write-Host "Vous pouvez maintenant lancer l'application:" -ForegroundColor Yellow
        Write-Host "  npm run android" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "Erreur lors de la migration" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Erreur: $_" -ForegroundColor Red
    exit 1
}
