<?php
/**
 * Mailer.php — Helper d'envoi d'email via PHPMailer (SMTP)
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  CONFIGURATION SMTP — à adapter selon votre fournisseur         │
 * │                                                                  │
 * │  Gmail (recommandé):                                             │
 * │    SMTP_HOST = 'smtp.gmail.com'                                  │
 * │    SMTP_PORT = 587                                               │
 * │    SMTP_USER = 'votre@gmail.com'                                 │
 * │    SMTP_PASS = 'mot_de_passe_application_gmail'                  │
 * │    (Créer un "App Password" dans les paramètres de sécurité)     │
 * │                                                                  │
 * │  Brevo / Sendinblue (gratuit 300 mails/jour):                    │
 * │    SMTP_HOST = 'smtp-relay.brevo.com'                            │
 * │    SMTP_PORT = 587                                               │
 * │    SMTP_USER = 'votre@email.com'                                 │
 * │    SMTP_PASS = 'cle_api_brevo'                                   │
 * │                                                                  │
 * │  Mailjet (gratuit 200 mails/jour) :                              │
 * │    SMTP_HOST = 'in-v3.mailjet.com'                               │
 * │    SMTP_PORT = 587                                               │
 * │    SMTP_USER = 'api_key_public'                                  │
 * │    SMTP_PASS = 'api_key_secret'                                  │
 * └─────────────────────────────────────────────────────────────────┘
 */

// ─── Configuration SMTP ──────────────────────────────────────────────────────
define('SMTP_HOST', 'smtp.gmail.com');       // Hôte SMTP
define('SMTP_PORT', 587);                    // Port (587 = STARTTLS, 465 = SSL)
define('SMTP_USER', 'votre@gmail.com');      // Votre adresse email SMTP
define('SMTP_PASS', 'votre_app_password');   // Mot de passe ou clé API
define('SMTP_FROM_EMAIL', 'votre@gmail.com'); // Expéditeur
define('SMTP_FROM_NAME', 'GoodFriends');     // Nom affiché

// ─── PHPMailer ───────────────────────────────────────────────────────────────
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . '/PHPMailer/Exception.php';
require_once __DIR__ . '/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/SMTP.php';

/**
 * Crée et configure une instance PHPMailer prête à l'envoi.
 */
function createMailer(): PHPMailer {
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host       = SMTP_HOST;
    $mail->SMTPAuth   = true;
    $mail->Username   = SMTP_USER;
    $mail->Password   = SMTP_PASS;
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = SMTP_PORT;
    $mail->CharSet    = 'UTF-8';
    $mail->setFrom(SMTP_FROM_EMAIL, SMTP_FROM_NAME);
    return $mail;
}

/**
 * Envoie le code de vérification par email via SMTP.
 */
function sendVerificationEmail(string $email, string $firstName, string $code): bool {
    try {
        $mail = createMailer();
        $mail->addAddress($email);
        $mail->isHTML(true);
        $mail->Subject = 'Votre code de vérification GoodFriends';
        $mail->Body = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f4ea;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#9c6b3c;padding:32px 40px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:1px;">GoodFriends</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Gardons le contact</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <h2 style="color:#383830;font-size:20px;margin:0 0 12px;">Bonjour ' . htmlspecialchars($firstName) . ' !</h2>
        <p style="color:#65655c;font-size:15px;line-height:1.6;margin:0 0 28px;">
          Merci de vous inscrire sur <strong>GoodFriends</strong> ! Entrez le code ci-dessous pour activer votre compte.
        </p>
        <div style="background:#f8f4ea;border-radius:12px;padding:28px;text-align:center;margin:0 0 28px;">
          <p style="margin:0 0 8px;color:#65655c;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Code de vérification</p>
          <p style="margin:0;font-size:42px;font-weight:bold;letter-spacing:10px;color:#9c6b3c;">' . htmlspecialchars($code) . '</p>
        </div>
        <p style="color:#aaa;font-size:13px;margin:0;">Ce code expire dans <strong>30 minutes</strong>. Ne le partagez avec personne.</p>
      </td></tr>
      <tr><td style="background:#f8f4ea;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#aaa;font-size:12px;">&copy; ' . date('Y') . ' GoodFriends</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>';
        $mail->AltBody = "Bonjour $firstName,\n\nVotre code de vérification GoodFriends est : $code\n\nCe code expire dans 30 minutes.";
        $mail->send();
        return true;
    } catch (Exception $e) {
        error_log('[Mailer] sendVerificationEmail failed: ' . $e->getMessage());
        return false;
    }
}

/**
 * Envoie l'email de bienvenue après validation du compte.
 */
function sendWelcomeEmail(string $email, string $firstName): bool {
    try {
        $mail = createMailer();
        $mail->addAddress($email);
        $mail->isHTML(true);
        $mail->Subject = 'Bienvenue sur GoodFriends !';
        $mail->Body = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f4ea;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#9c6b3c;padding:32px 40px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:1px;">GoodFriends</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Gardons le contact</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <h2 style="color:#383830;font-size:22px;margin:0 0 12px;">Bienvenue, ' . htmlspecialchars($firstName) . ' !</h2>
        <p style="color:#65655c;font-size:15px;line-height:1.6;margin:0 0 20px;">
          Votre compte <strong>GoodFriends</strong> est activé. Connectez-vous et commencez à entretenir vos relations avec ceux qui comptent.
        </p>
        <div style="background:#f8f4ea;border-radius:12px;padding:24px;margin:0 0 28px;">
          <p style="margin:0 0 10px;color:#383830;font-size:15px;font-weight:bold;">Avec GoodFriends vous pouvez :</p>
          <ul style="margin:0;padding-left:20px;color:#65655c;font-size:14px;line-height:2;">
            <li>Organiser vos contacts et ne plus oublier un anniversaire</li>
            <li>Prendre des nouvelles de vos proches au bon moment</li>
            <li>Envoyer des messages directement depuis l\'app</li>
          </ul>
        </div>
        <p style="color:#aaa;font-size:13px;margin:0;">Besoin d\'aide ? <a href="mailto:support@goodfriends.app" style="color:#9c6b3c;">support@goodfriends.app</a></p>
      </td></tr>
      <tr><td style="background:#f8f4ea;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#aaa;font-size:12px;">&copy; ' . date('Y') . ' GoodFriends</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>';
        $mail->AltBody = "Bienvenue $firstName ! Votre compte GoodFriends est activé.";
        $mail->send();
        return true;
    } catch (Exception $e) {
        error_log('[Mailer] sendWelcomeEmail failed: ' . $e->getMessage());
        return false;
    }
}
