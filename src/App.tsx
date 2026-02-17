import { useEffect, useMemo, useState } from "react";
import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User as FirebaseUser
} from "firebase/auth";
import ReservationCard from "./components/ReservationCard";
import ReservationDetail from "./components/ReservationDetail";
import ReservationForm from "./components/ReservationForm";
import SplashScreen from "./components/SplashScreen";
import AuthView from "./components/AuthView"; // [NEW]
import Navbar from "./components/Navbar";     // [NEW]
import ProfileView from "./components/ProfileView"; // [NEW]
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
import { getUserAttendance } from "./lib/utils";
import { auth } from "./lib/firebase";

type TabId = "mis-partidos" | "mis-reservas" | "perfil";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
const ONE_TIME_CLEANUP_KEY = "golf-padel-cleanup-v1";
const LOGIN_PENDING_KEY = "golf-padel-google-login-pending";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [expandedReservationId, setExpandedReservationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("mis-partidos");
  const [matchesFilter, setMatchesFilter] = useState<"all" | "pending" | "confirmed">("all");
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setShowSplash(false), 3000);
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (localStorage.getItem(ONE_TIME_CLEANUP_KEY) === "done") {
      return;
    }

    const legacyKeys = [
      "golf-padel-auth",
      "golf-padel-accounts",
      "current_player_id",
      "remembered_accounts",
      "golf-padel-local-user"
    ];
    legacyKeys.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(ONE_TIME_CLEANUP_KEY, "done");
  }, []);

  useEffect(() => {
    const firebaseAuth = auth;
    if (!firebaseAuth) {
      setAuthLoading(false);
      return;
    }

    let cancelled = false;
    let gotAuthState = false;
    const setupRedirectFlow = async () => {
      try {
        await setPersistence(firebaseAuth, browserLocalPersistence);
        const result = await getRedirectResult(firebaseAuth);
        if (result?.user && !cancelled) {
          setFirebaseUser(result.user);
          sessionStorage.removeItem(LOGIN_PENDING_KEY);
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError((error as Error).message);
          sessionStorage.removeItem(LOGIN_PENDING_KEY);
        }
      }
    };

    void setupRedirectFlow();

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      if (cancelled) {
        return;
      }
      gotAuthState = true;
      setFirebaseUser(nextUser);
      setAuthLoading(false);
      if (nextUser) {
        setAuthError(null);
        sessionStorage.removeItem(LOGIN_PENDING_KEY);
      } else if (sessionStorage.getItem(LOGIN_PENDING_KEY) === "1") {
        setAuthError(
          "Google devolvió sin sesión activa. Revisá dominios autorizados y volvé a intentar."
        );
      }
    });

    const timeout = window.setTimeout(() => {
      if (cancelled || gotAuthState) {
        return;
      }
      setAuthLoading(false);
      if (sessionStorage.getItem(LOGIN_PENDING_KEY) === "1") {
        setAuthError("No se pudo completar el login con Google en este intento.");
      }
    }, 4500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      unsubscribe();
    };
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
      name: firebaseUser.displayName || firebaseUser.email || "Jugador",
      avatar: firebaseUser.photoURL || undefined
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

  const myConfirmedCount = useMemo(
    () =>
      activeReservations.filter(
        (reservation) =>
          getUserAttendance(reservation, currentUser?.id ?? "")?.attendanceStatus === "confirmed"
      ).length,
    [activeReservations, currentUser]
  );

  const myPendingResponseCount = useMemo(
    () =>
      activeReservations.filter(
        (reservation) => !getUserAttendance(reservation, currentUser?.id ?? "")
      ).length,
    [activeReservations, currentUser]
  );

  const myUpcomingConfirmed = useMemo(
    () =>
      activeReservations
        .filter(
          (reservation) =>
            getUserAttendance(reservation, currentUser?.id ?? "")?.attendanceStatus === "confirmed" &&
            new Date(reservation.startDateTime).getTime() >= Date.now()
        )
        .sort(
          (a, b) =>
            new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
        ),
    [activeReservations, currentUser]
  );

  const visibleUpcoming = useMemo(
    () => (showAllUpcoming ? myUpcomingConfirmed : myUpcomingConfirmed.slice(0, 3)),
    [myUpcomingConfirmed, showAllUpcoming]
  );

  const myMatchesFiltered = useMemo(() => {
    if (matchesFilter === "pending") {
      return myMatches.filter((reservation) => !getUserAttendance(reservation, currentUser?.id ?? ""));
    }

    if (matchesFilter === "confirmed") {
      return myMatches.filter(
        (reservation) => getUserAttendance(reservation, currentUser?.id ?? "")?.attendanceStatus === "confirmed"
      );
    }

    return myMatches;
  }, [matchesFilter, myMatches, currentUser]);

  const isSynchronized = Boolean(
    currentUser && isCloudDbEnabled() && isOnline
  );

  const loginGoogle = async () => {
    if (!auth) {
      alert("Firebase Auth no está configurado.");
      return;
    }

    try {
      setBusy(true);
      setAuthError(null);
      await setPersistence(auth, browserLocalPersistence);
      sessionStorage.setItem(LOGIN_PENDING_KEY, "1");
      try {
        await signInWithPopup(auth, googleProvider);
        sessionStorage.removeItem(LOGIN_PENDING_KEY);
      } catch (popupError) {
        const code = (popupError as { code?: string }).code ?? "";
        const shouldFallbackToRedirect =
          code === "auth/popup-blocked" ||
          code === "auth/cancelled-popup-request" ||
          code === "auth/popup-closed-by-user" ||
          code === "auth/operation-not-supported-in-this-environment";

        if (shouldFallbackToRedirect) {
          await signInWithRedirect(auth, googleProvider);
          return;
        }

        throw popupError;
      }
    } catch (error) {
      setAuthError((error as Error).message);
      sessionStorage.removeItem(LOGIN_PENDING_KEY);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (!auth) {
      return;
    }
    try {
      setBusy(true);
      await signOut(auth);
      setExpandedReservationId(null);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBusy(false);
    }
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

  const renderReservationList = (title: string, items: Reservation[], emptyText: string) => (
    <section className="panel">
      <h2 className="section-title">{title}</h2>
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
          <section className="panel" style={{ textAlign: "center", padding: "4rem 2rem" }}>
            <p>Cargando...</p>
          </section>
        </main>
      </>
    );
  }

  if (!currentUser) {
    return (
      <>
        <SplashScreen visible={showSplash} />
        <AuthView onLoginWithGoogle={loginGoogle} busy={busy} error={authError} />
      </>
    );
  }

  return (
    <>
      <SplashScreen visible={showSplash} />

      <main className="app mobile-shell">
        <header className="header court-header">
          <div className="brand-shell">
            <img src="/apple-touch-icon.png" alt="Golf Padel" className="brand-icon" />
            <h1 className="name-logo">
              GOLF <span>PADEL</span> APP
            </h1>
          </div>
          <div className={`header-pill sync-pill ${isSynchronized ? "ok" : "off"}`}>
            <span className="sync-dot" />
            {isSynchronized ? "Sincronizado" : "No sincronizado"}
          </div>
        </header>

        {activeTab === "mis-partidos" ? (
          <section className="panel my-summary">
            <h2 className="section-title">Mis partidos</h2>
            <div className="detail-kpis summary-kpis">
              <button
                type="button"
                className={`kpi-card kpi-action ${matchesFilter === "pending" ? "kpi-active" : ""}`}
                onClick={() => setMatchesFilter("pending")}
              >
                <span className="kpi-label">Por responder</span>
                <strong>{myPendingResponseCount}</strong>
              </button>
              <button
                type="button"
                className={`kpi-card kpi-action ${matchesFilter === "confirmed" ? "kpi-active" : ""}`}
                onClick={() => setMatchesFilter("confirmed")}
              >
                <span className="kpi-label">Confirmados por mí</span>
                <strong>{myConfirmedCount}</strong>
              </button>
            </div>
            {matchesFilter !== "all" ? (
              <button type="button" className="link-btn active" onClick={() => setMatchesFilter("all")}>
                Ver todas
              </button>
            ) : null}
          </section>
        ) : null}

        {activeTab === "mis-partidos" ? (
          <section className="panel upcoming-widget">
            <h2 className="section-title">Próximos partidos</h2>
            {myUpcomingConfirmed.length === 0 ? (
              <p className="private-hint">Todavía no confirmaste próximos partidos.</p>
            ) : (
              <>
                <ul className="upcoming-list">
                  {visibleUpcoming.map((reservation) => (
                    <li key={`upcoming-${reservation.id}`}>
                      <div className="upcoming-date">
                        <span>
                          {new Date(reservation.startDateTime).toLocaleDateString("es-AR", {
                            month: "short"
                          })}
                        </span>
                        <strong>
                          {new Date(reservation.startDateTime).toLocaleDateString("es-AR", {
                            day: "2-digit"
                          })}
                        </strong>
                      </div>
                      <div className="upcoming-content">
                        <p>{reservation.courtName}</p>
                        <span>
                          {new Date(reservation.startDateTime).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false
                          })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {myUpcomingConfirmed.length > 3 ? (
                  <button
                    type="button"
                    className="link-btn active"
                    onClick={() => setShowAllUpcoming((value) => !value)}
                  >
                    {showAllUpcoming ? "Ver menos" : "Ver más"}
                  </button>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {activeTab === "mis-partidos"
          ? renderReservationList(
            "Reservas activas",
            myMatchesFiltered,
            matchesFilter === "pending"
              ? "No tenés partidos pendientes de respuesta."
              : matchesFilter === "confirmed"
                ? "No tenés partidos confirmados por vos."
                : "No hay reservas activas por ahora."
          )
          : null}

        {activeTab === "mis-reservas" ? (
          <>
            {!showCreateForm ? (
              <section className="panel">
                <button onClick={() => setShowCreateForm(true)} disabled={busy}>
                  Reservá un partido
                </button>
              </section>
            ) : (
              <ReservationForm
                currentUser={currentUser}
                onCreate={onCreateReservation}
                onCancel={() => setShowCreateForm(false)}
              />
            )}
            {renderReservationList(
              "Mis reservas activas",
              myReservations,
              "Todavía no reservaste ningún partido."
            )}
          </>
        ) : null}

        {activeTab === "perfil" ? (
          <ProfileView
            user={currentUser}
            onLogout={logout}
            onRequestNotifications={requestNotifications}
            busy={busy}
          />
        ) : null}

        <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      </main>
    </>
  );
}
