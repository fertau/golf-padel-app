import { useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User as FirebaseUser
} from "firebase/auth";
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
  updateReservationDetails
} from "./lib/dataStore";
import { registerPushToken } from "./lib/push";
import type { AttendanceStatus, Reservation, User } from "./lib/types";
import { getSignupsByStatus } from "./lib/utils";
import { auth } from "./lib/firebase";

type TabId = "mis-partidos" | "mis-reservas" | "perfil";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [expandedReservationId, setExpandedReservationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("mis-partidos");
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setShowSplash(false), 3000);
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setFirebaseUser(nextUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      setReservations([]);
      return;
    }
    const unsubscribe = subscribeReservations(setReservations);
    return unsubscribe;
  }, [firebaseUser]);

  useEffect(() => {
    const pathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9-]+)$/);
    if (!pathMatch) {
      return;
    }
    setExpandedReservationId(pathMatch[1]);
    setActiveTab("mis-partidos");
  }, []);

  const currentUser: User | null = firebaseUser
    ? {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || firebaseUser.email || "Jugador"
      }
    : null;

  const activeReservations = useMemo(
    () => reservations.filter((reservation) => reservation.status === "active"),
    [reservations]
  );

  const myMatches = useMemo(() => activeReservations, [activeReservations]);

  const myReservations = useMemo(
    () =>
      activeReservations.filter((reservation) =>
        Boolean(currentUser && reservation.createdByAuthUid === currentUser.id)
      ),
    [activeReservations, currentUser]
  );

  const totalConfirmedAttendances = useMemo(
    () =>
      activeReservations.reduce(
        (acc, reservation) => acc + getSignupsByStatus(reservation, "confirmed").length,
        0
      ),
    [activeReservations]
  );

  const loginGoogle = async () => {
    if (!auth) {
      alert("Firebase Auth no está configurado.");
      return;
    }

    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      await signInWithRedirect(auth, googleProvider);
    }
  };

  const logout = async () => {
    if (!auth) {
      return;
    }
    await signOut(auth);
    setExpandedReservationId(null);
  };

  const onCreateReservation: React.ComponentProps<typeof ReservationForm>["onCreate"] = async (payload) => {
    if (!currentUser) {
      return;
    }
    try {
      setBusy(true);
      await createReservation(payload, currentUser);
      setShowCreateForm(false);
      setActiveTab("mis-reservas");
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSetAttendanceStatus = async (reservationId: string, status: AttendanceStatus) => {
    if (!currentUser) {
      return;
    }
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
    if (!currentUser) {
      return;
    }
    try {
      setBusy(true);
      await cancelReservation(reservationId, currentUser);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onUpdateReservation: React.ComponentProps<typeof ReservationDetail>["onUpdateReservation"] = async (
    reservationId,
    updates
  ) => {
    if (!currentUser) {
      return;
    }
    try {
      setBusy(true);
      await updateReservationDetails(reservationId, updates, currentUser);
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
      alert("Push no disponible en este navegador. Usá compartir por WhatsApp.");
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const renderReservationList = (items: Reservation[], emptyText: string) => (
    <section className="panel">
      <p className="private-hint">
        {items.length} reservas · {totalConfirmedAttendances} asistencias confirmadas en activas
      </p>
      <div className="list">
        {items.length === 0 ? <p>{emptyText}</p> : null}
        {items.map((reservation) => (
          <article key={reservation.id} className="panel reservation-item">
            <ReservationCard
              reservation={reservation}
              currentUser={currentUser as User}
              onOpen={(id) => setExpandedReservationId((current) => (current === id ? null : id))}
              isExpanded={expandedReservationId === reservation.id}
            />
            {expandedReservationId === reservation.id ? (
              <ReservationDetail
                reservation={reservation}
                currentUser={currentUser as User}
                appUrl={window.location.origin}
                onSetAttendanceStatus={onSetAttendanceStatus}
                onCancel={onCancel}
                onUpdateReservation={onUpdateReservation}
              />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );

  if (authLoading) {
    return (
      <>
        <SplashScreen visible={showSplash} />
        <main className="app mobile-shell">
          <section className="panel">
            <p>Cargando sesión...</p>
          </section>
        </main>
      </>
    );
  }

  if (!currentUser) {
    return (
      <>
        <SplashScreen visible={showSplash} />
        <main className="app mobile-shell">
          <section className="panel account-selector">
            <h2>Ingresar</h2>
            <p className="private-hint">Usá tu cuenta de Google para entrar.</p>
            <button onClick={loginGoogle}>Ingresar con Google</button>
          </section>
        </main>
      </>
    );
  }

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
            <p>{currentUser.name}</p>
          </div>
          <div className="header-pill">{isCloudDbEnabled() ? "Modo Firebase" : "Modo Local"}</div>
        </header>

        <nav className="tabs">
          <button
            className={activeTab === "mis-partidos" ? "choice-btn active" : "choice-btn"}
            onClick={() => setActiveTab("mis-partidos")}
          >
            Mis partidos
          </button>
          <button
            className={activeTab === "mis-reservas" ? "choice-btn active" : "choice-btn"}
            onClick={() => setActiveTab("mis-reservas")}
          >
            Mis reservas
          </button>
          <button
            className={activeTab === "perfil" ? "choice-btn active" : "choice-btn"}
            onClick={() => setActiveTab("perfil")}
          >
            Perfil
          </button>
        </nav>

        {activeTab === "mis-partidos"
          ? renderReservationList(myMatches, "No hay reservas activas por ahora.")
          : null}

        {activeTab === "mis-reservas" ? (
          <>
            {!showCreateForm ? (
              <section className="panel">
                <button onClick={() => setShowCreateForm(true)} disabled={busy}>
                  Registrar nueva reserva
                </button>
              </section>
            ) : (
              <ReservationForm
                currentUser={currentUser}
                onCreate={onCreateReservation}
                onCancel={() => setShowCreateForm(false)}
              />
            )}
            {renderReservationList(myReservations, "Todavía no creaste reservas.")}
          </>
        ) : null}

        {activeTab === "perfil" ? (
          <section className="panel">
            <h2>Perfil</h2>
            <p className="private-hint">Cuenta: {currentUser.name}</p>
            <button onClick={requestNotifications}>Activar notificaciones</button>
            <button className="danger" onClick={() => void logout()}>
              Cerrar sesión
            </button>
          </section>
        ) : null}
      </main>
    </>
  );
}
