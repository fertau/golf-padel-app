import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import ReservationCard from "./components/ReservationCard";
import ReservationDetail from "./components/ReservationDetail";
import ReservationForm from "./components/ReservationForm";
import SplashScreen from "./components/SplashScreen";
import {
  cancelReservation,
  createReservation,
  isCloudDbEnabled,
  setAttendanceStatus,
  subscribeReservations,
  updateReservationScreenshot
} from "./lib/dataStore";
import { registerPushToken } from "./lib/push";
import type { AttendanceStatus, Reservation, User } from "./lib/types";
import { getSignupsByStatus, slugifyId } from "./lib/utils";
import { auth } from "./lib/firebase";

const USER_KEY = "golf-padel-local-user";

const loadLocalUser = (): User => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    const fallback = {
      id: "organizador",
      name: "Organizador"
    };
    localStorage.setItem(USER_KEY, JSON.stringify(fallback));
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as User;
    if (!parsed.name?.trim()) {
      throw new Error("Invalid user");
    }
    return parsed;
  } catch {
    const fallback = {
      id: "organizador",
      name: "Organizador"
    };
    localStorage.setItem(USER_KEY, JSON.stringify(fallback));
    return fallback;
  }
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [currentUser, setCurrentUser] = useState<User>(() => loadLocalUser());
  const [nameInput, setNameInput] = useState(currentUser.name);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setShowSplash(false), 3000);
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeReservations(setReservations);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const firebaseAuth = auth;
    if (!isCloudDbEnabled() || !firebaseAuth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (!firebaseUser) {
        void signInAnonymously(firebaseAuth);
      }
    });

    if (!firebaseAuth.currentUser) {
      void signInAnonymously(firebaseAuth);
    }

    return unsubscribe;
  }, []);

  const selectedReservation = useMemo(
    () => reservations.find((reservation) => reservation.id === selectedId) ?? null,
    [reservations, selectedId]
  );

  const activeReservations = useMemo(
    () => reservations.filter((reservation) => reservation.status === "active"),
    [reservations]
  );

  const totalConfirmedAttendances = useMemo(
    () =>
      activeReservations.reduce(
        (acc, reservation) => acc + getSignupsByStatus(reservation, "confirmed").length,
        0
      ),
    [activeReservations]
  );

  const saveCurrentUser = () => {
    const nextName = nameInput.trim() || "Organizador";
    const nextUser = {
      id: slugifyId(nextName),
      name: nextName
    };
    setCurrentUser(nextUser);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  };

  const onCreateReservation: React.ComponentProps<typeof ReservationForm>["onCreate"] = async (payload) => {
    try {
      setBusy(true);
      await createReservation(payload, currentUser);
      setShowCreateForm(false);

      if (Notification.permission === "granted") {
        new Notification("Nueva reserva creada", {
          body: `${payload.courtName} - ${new Date(payload.startDateTime).toLocaleString()}`
        });
      }
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSetAttendanceStatus = async (reservationId: string, status: AttendanceStatus) => {
    try {
      setBusy(true);
      await setAttendanceStatus(reservationId, currentUser, status);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async (reservationId: string) => {
    try {
      setBusy(true);
      await cancelReservation(reservationId, currentUser);

      if (Notification.permission === "granted") {
        new Notification("Reserva cancelada", {
          body: "Se canceló una reserva en la que participabas"
        });
      }
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onUpdateScreenshot: React.ComponentProps<typeof ReservationDetail>["onUpdateScreenshot"] = async (
    reservationId,
    screenshotUrl
  ) => {
    try {
      setBusy(true);
      await updateReservationScreenshot(reservationId, screenshotUrl, currentUser);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const requestNotifications = async () => {
    try {
      const token = await registerPushToken();
      if (token) {
        alert("Notificaciones activadas");
        return;
      }

      alert("Permiso activado. Falta configurar VAPID para Web Push.");
    } catch (error) {
      alert((error as Error).message);
    }
  };

  return (
    <>
      <SplashScreen visible={showSplash} />

      <main className="app mobile-shell">
        <header className="header court-header">
          <div>
            <p className="eyebrow">Golf Padel</p>
            <div className="brand-shell">
              <img src="/icon-192.png" alt="Golf Padel icon" className="brand-icon" />
              <h1>Golf Padel App</h1>
            </div>
            <p>Flujo simple para registrar reservas y confirmar asistencias.</p>
          </div>
          <div className="header-pill">{isCloudDbEnabled() ? "Modo Firebase" : "Modo Local"}</div>
        </header>

        {!showCreateForm ? (
          <>
            <section className="panel">
              <h2>Inicio</h2>
              <p className="private-hint">Usuario actual: {currentUser.name}</p>
              <label>
                Cambiar usuario
                <input
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder="Tu nombre"
                />
              </label>
              <button onClick={saveCurrentUser} disabled={busy}>
                Guardar usuario
              </button>
              <button onClick={() => setShowCreateForm(true)} disabled={busy}>
                Registrar nueva reserva
              </button>
              <button onClick={requestNotifications} disabled={busy}>
                Activar notificaciones
              </button>
            </section>

            <section className="panel">
              <h2>Reservas activas</h2>
              <p className="private-hint">
                {activeReservations.length} reservas activas · {totalConfirmedAttendances} asistencias confirmadas
              </p>

              <div className="list">
                {activeReservations.length === 0 ? <p>No hay reservas activas por ahora.</p> : null}
                {activeReservations.map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    currentUser={currentUser}
                    onOpen={setSelectedId}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          <ReservationForm
            currentUser={currentUser}
            onCreate={onCreateReservation}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {selectedReservation ? (
          <ReservationDetail
            reservation={selectedReservation}
            currentUser={currentUser}
            appUrl={window.location.origin + window.location.pathname}
            onSetAttendanceStatus={onSetAttendanceStatus}
            onCancel={onCancel}
            onUpdateScreenshot={onUpdateScreenshot}
          />
        ) : null}
      </main>
    </>
  );
}
