import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import ReservationCard from "./components/ReservationCard";
import ReservationDetail from "./components/ReservationDetail";
import ReservationForm from "./components/ReservationForm";
import SplashScreen from "./components/SplashScreen";
import {
  cancelReservation,
  createReservation,
  isCloudMode,
  joinReservation,
  leaveReservation,
  subscribeReservations,
  updateReservationScreenshot
} from "./lib/dataStore";
import { slugifyId } from "./lib/utils";
import type { Reservation, User } from "./lib/types";
import { auth } from "./lib/firebase";
import { registerPushToken } from "./lib/push";

const USER_KEY = "golf-padel-user";

const loadCurrentUser = (): User => {
  const saved = localStorage.getItem(USER_KEY);
  if (saved) {
    return JSON.parse(saved) as User;
  }

  const fallback = { id: "anon-user", name: "Jugador" };
  localStorage.setItem(USER_KEY, JSON.stringify(fallback));
  return fallback;
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUser, setCurrentUser] = useState<User>(() => loadCurrentUser());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setShowSplash(false), 3000);
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    setCurrentUserName(currentUser.name);
  }, [currentUser.name]);

  useEffect(() => {
    const unsubscribe = subscribeReservations(setReservations);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const cloudAuth = auth;
    if (!isCloudMode() || !cloudAuth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(cloudAuth, (firebaseUser) => {
      if (!firebaseUser) {
        void signInAnonymously(cloudAuth);
        return;
      }

      setCurrentUser((prev) => {
        if (prev.id === firebaseUser.uid) {
          return prev;
        }

        const next = {
          id: firebaseUser.uid,
          name: prev.name || "Jugador"
        };

        localStorage.setItem(USER_KEY, JSON.stringify(next));
        return next;
      });
    });

    if (!cloudAuth.currentUser) {
      void signInAnonymously(cloudAuth);
    }

    return unsubscribe;
  }, []);

  const selectedReservation = useMemo(
    () => reservations.find((reservation) => reservation.id === selectedId) ?? null,
    [reservations, selectedId]
  );

  const saveUser = () => {
    const name = currentUserName.trim();
    if (!name) {
      return;
    }

    const user = { id: isCloudMode() && auth?.currentUser ? auth.currentUser.uid : slugifyId(name), name };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setCurrentUser(user);
  };

  const onCreateReservation: React.ComponentProps<typeof ReservationForm>["onCreate"] = async (payload) => {
    try {
      setBusy(true);
      await createReservation(payload, currentUser);

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

  const onJoin = async (reservationId: string) => {
    try {
      setBusy(true);
      await joinReservation(reservationId, currentUser);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async (reservationId: string) => {
    try {
      setBusy(true);
      await leaveReservation(reservationId, currentUser.id);
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

      <main className="app">
        <header className="header court-header">
          <div>
            <p className="eyebrow">PWA para grupos de WhatsApp</p>
            <div className="brand-shell">
              <img src="/icon-padel.svg" alt="Golf Padel icon" className="brand-icon" />
              <h1>Golf Padel App</h1>
            </div>
            <p>Reservas simples para que se anoten todos los que quieran.</p>
          </div>
          <div className="header-pill">{isCloudMode() ? "Modo Firebase" : "Modo Local"}</div>
        </header>

        <section className="panel user-panel">
          <h2>Tu perfil</h2>
          <label>
            Nombre
            <input
              value={currentUserName}
              onChange={(e) => setCurrentUserName(e.target.value)}
              placeholder="Tu nombre"
            />
          </label>
          <div className="actions">
            <button onClick={saveUser} disabled={busy}>
              Guardar usuario
            </button>
            <button onClick={requestNotifications} disabled={busy}>
              Activar notificaciones
            </button>
          </div>
        </section>

        <div className="layout">
          <ReservationForm currentUser={currentUser} onCreate={onCreateReservation} />

          <section className="panel">
            <h2>Reservas activas</h2>
            <div className="list">
              {reservations.length === 0 ? <p>No hay reservas todavía.</p> : null}
              {reservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  currentUser={currentUser}
                  onOpen={setSelectedId}
                />
              ))}
            </div>
          </section>
        </div>

        {selectedReservation ? (
          <ReservationDetail
            reservation={selectedReservation}
            currentUser={currentUser}
            appUrl={window.location.origin + window.location.pathname}
            onJoin={onJoin}
            onLeave={onLeave}
            onCancel={onCancel}
            onUpdateScreenshot={onUpdateScreenshot}
          />
        ) : null}
      </main>
    </>
  );
}
