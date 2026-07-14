import admin from 'firebase-admin';

export function initFirebase() {
  // En Railway: FIREBASE_SERVICE_ACCOUNT = JSON del service account (una sola línea).
  // Local: apuntar GOOGLE_APPLICATION_CREDENTIALS a un archivo, o usar la misma env var.
  const creds = process.env.FIREBASE_SERVICE_ACCOUNT
    ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : admin.credential.applicationDefault();
  const app = admin.initializeApp({
    credential: creds,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  return { db: admin.firestore(app), auth: admin.auth(app), bucket: admin.storage(app).bucket() };
}
