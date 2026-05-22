const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

exports.deleteUser = onCall({ invoker: "public" }, async (request) => {
  // Vérification : seul l'admin peut appeler cette fonction
  if (!request.auth || request.auth.token.email !== "glownails.contact31@gmail.com") {
    throw new HttpsError("permission-denied", "Accès refusé.");
  }

  const uid = request.data.uid;
  if (!uid) {
    throw new HttpsError("invalid-argument", "UID manquant.");
  }

  const db = admin.firestore();

  // Supprimer les RDVs de la cliente
  const rdvs = await db.collection("rdvs").where("uid", "==", uid).get();
  const batch = db.batch();
  rdvs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  // Supprimer le doc Firestore users/{uid}
  await db.collection("users").doc(uid).delete();

  // Supprimer le compte Firebase Auth
  await admin.auth().deleteUser(uid);

  return { success: true };
});

// ═══════════════════════════════════════════════════════
// Notif Marion — Nouvelle demande RDV cliente
// Trigger : création doc rdvs/{id} avec statut "en_attente"
// Action : email à glownails.contact31@gmail.com via Gmail SMTP
// Filtre : ajouts manuels Marion (statut="confirme") sont ignorés
// ═══════════════════════════════════════════════════════
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");

const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

const GMAIL_USER   = "marc-antoine@ninetechnologies.fr";
const MARION_EMAIL = "glownails.contact31@gmail.com";

exports.notifyMarionOnNewRdv = onDocumentCreated(
  {
    document: "rdvs/{rdvId}",
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [GMAIL_APP_PASSWORD]
  },
  async (event) => {
    const snap = event.data;
    if (!snap) { logger.warn("Pas de snapshot"); return; }

    const rdv = snap.data();
    const rdvId = event.params.rdvId;

    if (rdv.statut !== "en_attente") {
      logger.info(`RDV ${rdvId} statut=${rdv.statut}, skip notif`);
      return;
    }

    logger.info(`Nouvelle demande ${rdv.prenom} ${rdv.nom} — ${rdv.date} ${rdv.heure}`);

    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.value() }
      });

      const subject = `Nouvelle demande RDV — ${rdv.prenom || ""} ${rdv.nom || ""} — ${rdv.date || ""}`;

      const html = `
<div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;background:#F8F4EF;color:#1E140A;">
  <div style="background:#FFFFFF;border-radius:12px;padding:32px;box-shadow:0 2px 20px rgba(30,20,10,0.06);">
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;color:#A8834A;margin:0 0 16px;font-weight:400;">
      Nouvelle demande de rendez-vous
    </h1>
    <p style="font-size:15px;margin:0 0 24px;color:#5A4535;">
      Une cliente vient d'envoyer une demande de RDV via votre application Glow Nails.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(168,131,74,0.18);font-size:13px;color:#9A8270;">Cliente</td><td style="padding:10px 0;border-bottom:1px solid rgba(168,131,74,0.18);font-size:15px;font-weight:500;text-align:right;">${rdv.prenom || ""} ${rdv.nom || ""}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(168,131,74,0.18);font-size:13px;color:#9A8270;">Email</td><td style="padding:10px 0;border-bottom:1px solid rgba(168,131,74,0.18);font-size:14px;text-align:right;">${rdv.email || ""}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(168,131,74,0.18);font-size:13px;color:#9A8270;">Date</td><td style="padding:10px 0;border-bottom:1px solid rgba(168,131,74,0.18);font-size:15px;font-weight:500;text-align:right;">${rdv.date || ""}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(168,131,74,0.18);font-size:13px;color:#9A8270;">Heure</td><td style="padding:10px 0;border-bottom:1px solid rgba(168,131,74,0.18);font-size:15px;font-weight:500;text-align:right;">${rdv.heure || ""}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(168,131,74,0.18);font-size:13px;color:#9A8270;">Prestation</td><td style="padding:10px 0;border-bottom:1px solid rgba(168,131,74,0.18);font-size:14px;text-align:right;">${rdv.prestation || ""}</td></tr>
      <tr><td style="padding:10px 0;font-size:13px;color:#9A8270;">Tarif</td><td style="padding:10px 0;font-size:18px;font-weight:600;color:#A8834A;text-align:right;">${rdv.prix || ""}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://glow-nails.vercel.app" style="display:inline-block;background:#A8834A;color:#FFFFFF;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:500;font-size:15px;">
        Ouvrir l'application
      </a>
    </div>
    <p style="font-size:13px;color:#9A8270;margin-top:24px;text-align:center;">
      Glow Nails — Saint-Gaudens
    </p>
  </div>
</div>
      `.trim();

      await transporter.sendMail({
        from: `"Glow Nails" <${GMAIL_USER}>`,
        to: MARION_EMAIL,
        replyTo: rdv.email || GMAIL_USER,
        subject: subject,
        html: html
      });

      logger.info(`Email envoyé à ${MARION_EMAIL}`);
    } catch (e) {
      logger.error("Erreur envoi email :", e);
    }

    // ── Envoi push FCM aux devices admin enregistrés ─────
    try {
      const devicesSnap = await admin.firestore().collection("admin_devices").get();
      const tokens = devicesSnap.docs.map(d => d.id);

      if (tokens.length === 0) {
        logger.info("Aucun device admin enregistré, skip push FCM");
        return;
      }

      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokens,
        notification: {
          title: "Nouvelle demande RDV",
          body: `${rdv.prenom || ""} ${rdv.nom || ""} — ${rdv.date || ""} ${rdv.heure || ""}`.trim()
        },
        data: { rdvId: rdvId, url: "https://glow-nails.vercel.app" },
        webpush: {
          notification: {
            icon: "https://glow-nails.vercel.app/web-app-manifest-192x192.png",
            badge: "https://glow-nails.vercel.app/favicon-96x96.png"
          },
          fcmOptions: { link: "https://glow-nails.vercel.app" }
        }
      });

      logger.info(`Push FCM : ${response.successCount} succès / ${response.failureCount} échecs sur ${tokens.length} devices`);

      // Cleanup tokens invalides
      const tokensToDelete = [];
      response.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error?.code || "";
          if (code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token") {
            tokensToDelete.push(tokens[i]);
          }
        }
      });

      if (tokensToDelete.length > 0) {
        const batch = admin.firestore().batch();
        tokensToDelete.forEach(t => batch.delete(admin.firestore().collection("admin_devices").doc(t)));
        await batch.commit();
        logger.info(`Cleanup : ${tokensToDelete.length} tokens FCM invalides supprimés`);
      }
    } catch (e) {
      logger.error("Erreur envoi push FCM :", e);
    }
  }
);
