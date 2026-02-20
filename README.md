# Padel App

PWA para gestionar reservas de pádel y anotados (titulares/suplentes) para grupos de WhatsApp.

## Features implementadas
- Acceso por cuentas recordadas + búsqueda por nombre + PIN de 4 dígitos.
- Registro de perfil con unicidad case-insensitive de username.
- PIN hasheado con PBKDF2-SHA256 + salt aleatoria (backend).
- Reserva manual mobile-first: fecha, cancha y horario sugerido/custom.
- Soporte multi-grupo y alcance por grupo o “Todos mis grupos”.
- Complejos/canchas reutilizables entre grupos con confirmación por grupo.
- Invitaciones por WhatsApp/email/link (grupo y partido puntual).
- Confirmar / Quizás / Cancelar asistencia.
- Secciones: `Mis partidos`, `Mis reservas`, `Perfil`.
- Compartir por WhatsApp con mensaje estructurado.
- Splash animation estilo cancha azul de pádel.
- UI modernizada con estética padel.
- Gestión de ciclo de vida de grupos: salir del grupo, quitar miembros y soft-delete de grupo.
- Al eliminar grupo: reservas quedan en modo `link_only` (no se borran).
- Reservas `link_only`: se pueden crear y editar sin grupo, visibles solo por link/participantes.

## Stack
- React + TypeScript + Vite
- PWA con `vite-plugin-pwa`
- Firebase (Auth + Firestore + Messaging opcional)
- API routes en Vercel para auth/PIN (`/api/auth/*`)

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
git commit -m "feat: initial Padel App"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/golf-padel-app.git
git push -u origin main
```

### 2) Firebase (Consola)
1. Crear proyecto Firebase.
2. Agregar app Web y copiar credenciales.
3. Activar Authentication (necesario para custom tokens).
4. Crear Firestore (modo production).
5. En Firestore Rules pegar `firestore.rules`.
6. En Cloud Messaging generar Web Push certificate (VAPID key).

### 3) Variables de entorno
Completar `.env` con los datos de Firebase:
```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
VITE_USE_FIREBASE_DB=true
VITE_SHARE_BASE_URL=https://tu-dominio-corto.com
VITE_GOOGLE_MAPS_API_KEY=...
```

`VITE_SHARE_BASE_URL` es opcional. Si lo definís, los links compartidos por WhatsApp usan ese dominio (por ejemplo uno más corto) en lugar del `origin` actual.

`VITE_GOOGLE_MAPS_API_KEY` es opcional. Si lo definís, se habilita la búsqueda de complejos desde Google Maps al crear reservas.

Variables server-side para Vercel API (`/api/auth/*`):
```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

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
6. Cargar `VITE_FIREBASE_*` en Project Settings > Environment Variables.
7. Cargar `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` en Vercel.
8. Deploy.

`vercel.json` ya incluye rewrite SPA para soportar rutas internas.

## Migración legacy de PIN
- Online automático: en `/api/auth/login`, si detecta `pin` legacy en texto plano, migra a hash y loguea en servidor.
- Script manual:
```bash
node scripts/migrateLegacyPins.mjs
```

## Migración de reservas legacy a "Mi grupo"
Para forzar que todas las reservas históricas de un owner queden bajo el grupo `Mi grupo`:
```bash
npm run migrate:mi-grupo -- <ownerAuthUid>
```
Requiere variables server-side:
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

## Reparación completa de "Mi grupo" (duplicados + reservas sin grupo)
Si aparecen grupos duplicados llamados `Mi grupo` o reservas sin `groupId/groupName`:
```bash
npm run repair:mi-grupo -- <ownerAuthUid>
```
Este script:
- Elige un grupo canónico `Mi grupo`.
- Renombra duplicados a `Mi grupo (legacy X)`.
- Completa `groupId/groupName` en reservas legacy del owner.

Para forzar backfill de **todas** las reservas legacy sin grupo (aunque no estén vinculadas al owner):
```bash
npm run repair:mi-grupo -- <ownerAuthUid> --all-missing
```

## Backfill de visibilidad de reservas (Stage 1 grupos/permisos)
Para normalizar `visibilityScope` y migrar reservas legacy (`default-group` / sin grupo) al grupo del creador cuando corresponda:
```bash
npm run backfill:reservation-visibility -- --dry-run
npm run backfill:reservation-visibility
```

Resultado esperado:
- Reservas con grupo válido => `visibilityScope: "group"`.
- Reservas sin grupo legacy => se asignan al grupo del creador (si existe) y quedan `group`.
- Si no hay grupo asignable => quedan `link_only`.

## Limpieza one-time de grupos "Mi grupo" forzados
Elimina grupos `Mi grupo` que cumplan todos estos criterios de seguridad:
- no están borrados,
- tienen solo owner como único miembro/admin,
- no tienen reservas asociadas.

Primero simulá:
```bash
npm run cleanup:forced-mi-grupo
```

Luego aplicá:
```bash
npm run cleanup:forced-mi-grupo -- --apply
```

## Seguridad
- Firestore bloquea writes anónimas.
- `players` solo accesible por dueño autenticado.
- Unicidad de username en backend vía colección índice `usernames/{normalized}`.

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
