# Golf Padel App

PWA para gestionar reservas de pádel y anotados (titulares/suplentes) para grupos de WhatsApp.

## Features implementadas
- Creación de reserva con captura opcional.
- Reglas por reserva (creador):
  - `maxPlayersAccepted`
  - `priorityUserIds`
  - `allowWaitlist`
  - `signupDeadline`
- Algoritmo titulares/suplentes con prioridad y timestamp.
- Re-cálculo automático cuando alguien se baja.
- Compartir por Web Share API y copiar mensaje para WhatsApp.
- Splash animation estilo cancha azul de pádel.
- UI modernizada con estética padel.
- Modo Firebase (si hay variables `VITE_FIREBASE_*`) o modo local automático.

## Stack
- React + TypeScript + Vite
- PWA con `vite-plugin-pwa`
- Firebase (Firestore + Storage + Auth/Messaging opcional)

## Desarrollo local
```bash
cp .env.example .env
npm install
npm run dev
```

## Guía completa: GitHub + Firebase + Vercel

### 1) GitHub
1. Crear repo nuevo en GitHub (ejemplo: `golf-padel-app`).
2. En este proyecto correr:
```bash
git init
git add .
git commit -m "feat: initial Golf Padel app"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/golf-padel-app.git
git push -u origin main
```

### 2) Firebase (Consola)
1. Crear proyecto Firebase.
2. Agregar app Web y copiar credenciales.
3. Activar Authentication:
- Sign-in method: `Anonymous` (rápido) o `Google`.
4. Crear Firestore (modo production).
5. Crear Storage.
6. En Firestore Rules pegar `firestore.rules`.
7. En Storage Rules pegar `storage.rules`.
8. En Cloud Messaging generar Web Push certificate (VAPID key).

### 3) Variables de entorno
Completar `.env` con los datos de Firebase:
```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
VITE_USE_FIREBASE_DB=true
```

Si no querés usar Firestore todavía:
- `VITE_USE_FIREBASE_DB=false` y la app funciona en modo local (localStorage).

### 4) Service Worker de Firebase Messaging
Editar `public/firebase-messaging-sw.js` y completar `firebaseConfig` con los valores de tu app Firebase.

Importante:
- No subas esos valores a repos públicos.
- Si necesitás mantener el repo público, usá una key rotada y restringida.

### 5) Vercel deploy
1. En Vercel: `Add New Project`.
2. Importar repo de GitHub.
3. Framework: Vite (auto-detectado).
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Cargar las mismas variables `VITE_FIREBASE_*` en Project Settings > Environment Variables.
7. Deploy.

`vercel.json` ya incluye rewrite SPA para soportar rutas internas.

## Seguridad y privacidad
En este MVP, las reglas internas se ocultan en UI para no-creadores.
Para aislamiento fuerte de reglas privadas entre usuarios, el siguiente paso recomendado es mover reglas sensibles a documentos privados gestionados por Cloud Functions.

### Respuesta a filtración de API key (Google abuse alert)
1. Rotar la key comprometida en Google Cloud Console (`APIs & Services > Credentials > Regenerate key`).
2. Aplicar restricciones:
- `Application restrictions`: `HTTP referrers (web sites)`.
- Permitir solo tus dominios:
  - `https://golf-padel-app.vercel.app/*`
  - `https://*.vercel.app/*` (si usás previews)
  - `http://localhost:5173/*` (desarrollo local)
3. Revisar actividad y costos en Cloud Logging/Billing para detectar abuso.
4. Actualizar la key nueva en Vercel (`VITE_FIREBASE_API_KEY`) y redeploy.
5. Nunca guardar keys reales en archivos versionados como `public/firebase-messaging-sw.js`.

## Build
```bash
npm run build
npm run preview
```
