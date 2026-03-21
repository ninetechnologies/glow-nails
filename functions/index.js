const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.deleteUser = functions.https.onCall(async (data, context) => {
  // Vérification : seul l'admin peut appeler cette fonction
  if (!context.auth || context.auth.token.email !== "glownails.contact31@gmail.com") {
    throw new functions.https.HttpsError("permission-denied", "Accès refusé.");
  }

  const uid = data.uid;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "UID manquant.");
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
