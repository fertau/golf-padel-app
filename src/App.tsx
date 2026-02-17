import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithCustomToken, signOut } from "firebase/auth";
import AccountSelector from "./components/AccountSelector";
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
import { loginWithPin, registerAccount, type AccountProfile } from "./lib/authApi";
import { useAuthStore } from "./stores/useAuthStore";
import { useUserStore } from "./stores/useUserStore";

type TabId = "mis-partidos" | "mis-reservas" | "perfil";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [expandedReservationId, setExpandedReservationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("mis-partidos");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const currentUserId = useAuthStore((state) => state.currentUserId);
  const rememberedIds = useAuthStore((state) => state.rememberedIds);
  const setCurrentUserId = useAuthStore((state) => state.setCurrentUserId);
  const remember = useAuthStore((state) => state.remember);
  const forget = useAuthStore((state) => state.forget);
  const logoutStore = useAuthStore((state) => state.logout);

  const profilesById = useUserStore((state) => state.profilesById);
  const upsertProfiles = useUserStore((state) => state.upsertProfiles);
  const loadRememberedProfiles = useUserStore((state) => state.loadRememberedProfiles);
  const searchExactByName = useUserStore((state) => state.searchExactByName);

  const currentProfile = currentUserId ? profilesById[currentUserId] : undefined;
  const currentUser: User | null = currentProfile
    ? {
        id: currentProfile.id,
        name: currentProfile.name
      }
    : null;

  const rememberedAccounts = useMemo(
    () =>
      rememberedIds
        .map((id) => profilesById[id])
        .filter((profile): profile is AccountProfile => Boolean(profile)),
    [profilesById, rememberedIds]
  );

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setShowSplash(false), 3000);
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setReservations([]);
      return;
    }
    const unsubscribe = subscribeReservations(setReservations);
    return unsubscribe;
  }, [currentUserId]);

  useEffect(() => {
    const firebaseAuth = auth;
    if (!isCloudDbEnabled() || !firebaseAuth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (!firebaseUser) {
        logoutStore();
      }
    });

    return unsubscribe;
  }, [logoutStore]);

  useEffect(() => {
    const pathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9-]+)$/);
    if (!pathMatch) {
      return;
    }

    setExpandedReservationId(pathMatch[1]);
    setActiveTab("mis-partidos");
  }, []);

  useEffect(() => {
    const idsToLoad = Array.from(new Set([...(currentUserId ? [currentUserId] : []), ...rememberedIds]));
    if (idsToLoad.length === 0) {
      return;
    }

    void loadRememberedProfiles(idsToLoad).then((profiles) => {
      if (!currentUserId) {
        return;
      }
      const exists = profiles.some((profile) => profile.id === currentUserId);
      if (!exists) {
        logoutStore();
      }
    });
  }, [currentUserId, loadRememberedProfiles, logoutStore, rememberedIds]);

  const activeReservations = useMemo(
    () => reservations.filter((reservation) => reservation.status === "active"),
    [reservations]
  );

  const myMatches = useMemo(() => activeReservations, [activeReservations]);

  const myReservations = useMemo(
    () =>
      activeReservations.filter((reservation) =>
        Boolean(currentUser && reservation.createdBy.id === currentUser.id)
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

  const onLogin = async (playerId: string, pin: string) => {
    const result = await loginWithPin(playerId, pin);
    if (auth) {
      await signInWithCustomToken(auth, result.customToken);
    }
    upsertProfiles([result.profile]);
    setCurrentUserId(result.profile.id);
    remember(result.profile.id);
  };

  const onCreate = async (name: string, pin: string) => {
    const result = await registerAccount(name, pin);
    if (result.status === "exists") {
      upsertProfiles([result.profile]);
      return {
        redirectedToLogin: true,
        player: result.profile
      };
    }

    if (auth) {
      await signInWithCustomToken(auth, result.customToken);
    }
    upsertProfiles([result.profile]);
    setCurrentUserId(result.profile.id);
    remember(result.profile.id);
    return {
      redirectedToLogin: false,
      player: result.profile
    };
  };

  const logout = async () => {
    if (auth) {
      await signOut(auth);
    }
    logoutStore();
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

  if (!currentUser) {
    return (
      <>
        <SplashScreen visible={showSplash} />
        <AccountSelector
          rememberedAccounts={rememberedAccounts}
          onForgetRemembered={forget}
          onSearchExact={searchExactByName}
          onLogin={onLogin}
          onCreate={onCreate}
        />
      </>
    );
  }

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
              currentUser={currentUser}
              onOpen={(id) => setExpandedReservationId((current) => (current === id ? null : id))}
              isExpanded={expandedReservationId === reservation.id}
            />
            {expandedReservationId === reservation.id ? (
              <ReservationDetail
                reservation={reservation}
                currentUser={currentUser}
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
