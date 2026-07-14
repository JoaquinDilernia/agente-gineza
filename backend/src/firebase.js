import admin from 'firebase-admin';

export function initFirebase() {
  // Dos formatos soportados:
  //  A) FIREBASE_SERVICE_ACCOUNT = JSON completo del service account (una sola línea)
  //  B) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (los 3 campos sueltos)
  // En B, la private key suele venir con \n literales desde el .env — se convierten a saltos reales.
  let creds;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    creds = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  } else if (process.env.FIREBASE_PRIVATE_KEY) {
    creds = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  } else {
    creds = admin.credential.applicationDefault();
  }
  const app = admin.initializeApp({
    credential: creds,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  // Sin bucket configurado el server igual arranca (Firestore y Auth funcionan);
  // solo falla la subida/bajada de creativos, con error claro en ese momento.
  const bucket = process.env.FIREBASE_STORAGE_BUCKET ? admin.storage(app).bucket() : null;
  return { db: admin.firestore(app), auth: admin.auth(app), bucket };
}
