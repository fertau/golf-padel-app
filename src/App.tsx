import { useEffect, useMemo, useState } from "react";
import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "firebase/auth";

// Components
import ReservationCard from "./components/ReservationCard";
import ReservationDetail from "./components/ReservationDetail";
import ReservationForm from "./components/ReservationForm";
import SplashScreen from "./components/SplashScreen";
import AuthView from "./components/AuthView";
import Navbar from "./components/Navbar";
import ProfileView from "./components/ProfileView";
import SmartHandoff from "./components/SmartHandoff";
import { ReservationSkeleton } from "./components/Skeletons";

// Stores & Lib
import { useAuthStore } from "./stores/useAuthStore";
import { useReservationStore } from "./stores/useReservationStore";
import { useUIStore } from "./stores/useUIStore";
import {
  cancelReservation,
  createReservation,
  isCloudDbEnabled,
  setAttendanceStatus,
  subscribeReservations,
  updateReservationDetails
} from "./lib/dataStore";
import { registerPushToken } from "./lib/push";
import type { AttendanceStatus, Reservation } from "./lib/types";
import { getUserAttendance, isReservationCreator, triggerHaptic } from "./lib/utils";
import { auth } from "./lib/firebase";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
const ONE_TIME_CLEANUP_KEY = "golf-padel-cleanup-v1";
const LOGIN_PENDING_KEY = "golf-padel-google-login-pending";

const getDayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const toLocalDayKey = (date: Date): string =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;

const parseReservationDate = (iso: string): Date => {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) {
    const [datePart, timePart] = iso.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  }
  return new Date(iso);
};

const getEndOfWeek = (date: Date): Date => {
  const local = getDayStart(date);
  const day = local.getDay();
  const daysToSunday = day === 0 ? 0 : 7 - day;
  return new Date(local.getFullYear(), local.getMonth(), local.getDate() + daysToSunday);
};

const getReservationDateGroup = (iso: string): "hoy" | "manana" | "esta-semana" | "mas-adelante" => {
  const now = new Date();
  const today = getDayStart(now);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const endOfWeek = getEndOfWeek(now);
  const target = getDayStart(parseReservationDate(iso));

  if (toLocalDayKey(target) === toLocalDayKey(today)) return "hoy";
  if (toLocalDayKey(target) === toLocalDayKey(tomorrow)) return "manana";
  if (target > tomorrow && target <= endOfWeek) return "esta-semana";
  return "mas-adelante";
};

const GROUP_LABELS: Record<string, string> = {
  hoy: "Hoy",
  manana: "Mañana",
  "esta-semana": "Esta semana",
  "mas-adelante": "Más adelante"
};

const getShareBaseUrl = (): string => {
  const configured = import.meta.env.VITE_SHARE_BASE_URL?.trim();
  const fallback = window.location.origin;
  return (configured && configured.length > 0 ? configured : fallback).replace(/\/+$/, "");
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [busy, setBusy] = useState(false);

  // Zustand Stores
  const { firebaseUser, currentUser, authLoading, authError, setFirebaseUser, setAuthLoading, setAuthError } = useAuthStore();
  const { reservations, loading: reservationsLoading, setReservations } = useReservationStore();
  const {
    activeTab, expandedReservationId, showCreateForm, isOnline,
    setActiveTab, setExpandedReservationId, setShowCreateForm, setIsOnline
  } = useUIStore();

  const [matchesFilter, setMatchesFilter] = useState<"all" | "pending" | "confirmed">("all");
  const [quickDateFilter, setQuickDateFilter] = useState<"all" | "hoy" | "manana" | "semana">("all");
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const shareBaseUrl = getShareBaseUrl();

  // 1. Connectivity & Cleanup
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (localStorage.getItem(ONE_TIME_CLEANUP_KEY) !== "done") {
      ["golf-padel-auth", "golf-padel-accounts", "current_player_id", "remembered_accounts", "golf-padel-local-user"]
        .forEach(key => localStorage.removeItem(key));
      localStorage.setItem(ONE_TIME_CLEANUP_KEY, "done");
    }

    const splashTimer = setTimeout(() => setShowSplash(false), 3200);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearTimeout(splashTimer);
    };
  }, []);

  // 2. Firebase Auth Flow
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    let cancelled = false;
    let gotAuthState = false;

    const setupRedirect = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        const result = await getRedirectResult(auth);
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

    setupRedirect();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (cancelled) return;
      setFirebaseUser(user);
      setAuthLoading(false);
      if (user) {
        setAuthError(null);
        sessionStorage.removeItem(LOGIN_PENDING_KEY);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // 3. Subscription
  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeReservations(setReservations);
  }, [firebaseUser]);

  // 4. Initial Path Detection
  useEffect(() => {
    const pathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9-]+)$/);
    if (pathMatch) {
      setExpandedReservationId(pathMatch[1]);
      setActiveTab("mis-partidos");
    }
  }, []);

  // 5. Derived State
  const activeReservations = useMemo(() => reservations.filter(r => r.status === "active"), [reservations]);

  const myPendingResponseCount = activeReservations.filter(r => !getUserAttendance(r, currentUser?.id ?? "")).length;
  const myConfirmedCount = activeReservations.filter(r => getUserAttendance(r, currentUser?.id ?? "")?.attendanceStatus === "confirmed").length;

  const myUpcomingConfirmed = useMemo(() =>
    activeReservations
      .filter(r => getUserAttendance(r, currentUser?.id ?? "")?.attendanceStatus === "confirmed" && new Date(r.startDateTime).getTime() >= Date.now())
      .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
    , [activeReservations, currentUser]);

  const visibleUpcoming = showAllUpcoming ? myUpcomingConfirmed : myUpcomingConfirmed.slice(0, 3);

  const filteredMatches = useMemo(() => {
    let list = activeReservations;
    if (matchesFilter === "pending") list = list.filter(r => !getUserAttendance(r, currentUser?.id ?? ""));
    if (matchesFilter === "confirmed") list = list.filter(r => getUserAttendance(r, currentUser?.id ?? "")?.attendanceStatus === "confirmed");

    if (quickDateFilter === "all") return list;
    return list.filter(r => {
      const g = getReservationDateGroup(r.startDateTime);
      if (quickDateFilter === "hoy") return g === "hoy";
      if (quickDateFilter === "manana") return g === "manana";
      return g !== "mas-adelante";
    });
  }, [activeReservations, matchesFilter, quickDateFilter, currentUser]);

  const selectedReservation = expandedReservationId ? reservations.find(r => r.id === expandedReservationId) || null : null;
  const isSynchronized = Boolean(currentUser && isCloudDbEnabled() && isOnline);

  // 6. Actions
  const loginGoogle = async () => {
    if (!auth) return;
    try {
      setBusy(true);
      setAuthError(null);
      await setPersistence(auth, browserLocalPersistence);
      sessionStorage.setItem(LOGIN_PENDING_KEY, "1");
      await signInWithPopup(auth, googleProvider);
      sessionStorage.removeItem(LOGIN_PENDING_KEY);
    } catch (err: any) {
      if (["auth/popup-blocked", "auth/cancelled-popup-request", "auth/popup-closed-by-user"].includes(err.code)) {
        await signInWithRedirect(auth!, googleProvider);
      } else {
        setAuthError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      setBusy(true);
      await signOut(auth);
      setExpandedReservationId(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (payload: any) => {
    if (!currentUser) return;
    try {
      setBusy(true);
      await createReservation(payload, currentUser);
      setShowCreateForm(false);
      setActiveTab("mis-reservas");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const renderReservationList = (title: string, items: Reservation[], emptyText: string, groupByDate = false) => (
    <section className="panel">
      <h2 className="section-title">{title}</h2>
      {groupByDate && (
        <div className="quick-chip-row">
          {["all", "hoy", "manana", "semana"].map(id => (
            <button key={id} className={`quick-chip ${quickDateFilter === id ? "active" : ""}`} onClick={() => setQuickDateFilter(id as any)}>
              {id === "all" ? "Todos" : id.charAt(0).toUpperCase() + id.slice(1)}
            </button>
          ))}
        </div>
      )}
      <div className="list">
        {reservationsLoading ? (
          <><ReservationSkeleton /><ReservationSkeleton /><ReservationSkeleton /></>
        ) : items.length === 0 ? (
          <div className="empty-state"><div className="empty-illustration">🎾</div><p>{emptyText}</p></div>
        ) : groupByDate ? (
          (["hoy", "manana", "esta-semana", "mas-adelante"] as const).map(g => {
            const groupItems = items.filter(r => getReservationDateGroup(r.startDateTime) === g);
            if (!groupItems.length) return null;
            return (
              <section key={g} className="group-block">
                <h3 className="group-title">{GROUP_LABELS[g]}</h3>
                <div className="group-list">
                  {groupItems.map(r => (
                    <article key={r.id} className="panel reservation-item">
                      <ReservationCard reservation={r} currentUser={currentUser!} onOpen={setExpandedReservationId} isExpanded={expandedReservationId === r.id} />
                    </article>
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          items.map(r => (
            <article key={r.id} className="panel reservation-item">
              <ReservationCard reservation={r} currentUser={currentUser!} onOpen={setExpandedReservationId} isExpanded={expandedReservationId === r.id} />
            </article>
          ))
        )}
      </div>
    </section>
  );

  if (authLoading) return (
    <>
      <SplashScreen visible={showSplash} />
      <main className="app mobile-shell">
        <section className="panel" style={{ padding: "4rem 2rem", background: 'transparent' }}>
          <ReservationSkeleton /><ReservationSkeleton />
        </section>
      </main>
    </>
  );

  if (!currentUser) return (
    <>
      <SplashScreen visible={showSplash} />
      <AuthView onLoginWithGoogle={loginGoogle} busy={busy} error={authError} />
    </>
  );

  return (
    <>
      <SplashScreen visible={showSplash} />
      <SmartHandoff />

      <main className="app mobile-shell">
        <header className="header court-header">
          <div className="brand-shell">
            <img src="/apple-touch-icon.png" alt="Golf Padel" className="brand-icon" />
            <h1 className="name-logo">GOLF <span>PADEL</span> APP</h1>
          </div>
          <div className={`header-pill sync-pill ${isSynchronized ? "ok" : "off"}`}>
            <span className="sync-dot" />
            {isSynchronized ? "Sincronizado" : "No sincronizado"}
          </div>
        </header>

        {activeTab === "mis-partidos" && (
          <>
            <section className="panel my-summary">
              <h2 className="section-title">Mis partidos</h2>
              <div className="detail-kpis summary-kpis">
                <button className={`kpi-card kpi-action ${matchesFilter === "pending" ? "kpi-active" : ""}`} onClick={() => setMatchesFilter("pending")}>
                  <span className="kpi-label">Por responder</span>
                  <strong>{myPendingResponseCount}</strong>
                </button>
                <button className={`kpi-card kpi-action ${matchesFilter === "confirmed" ? "kpi-active" : ""}`} onClick={() => setMatchesFilter("confirmed")}>
                  <span className="kpi-label">Confirmados</span>
                  <strong>{myConfirmedCount}</strong>
                </button>
              </div>
              {matchesFilter !== "all" && <button className="link-btn active" onClick={() => setMatchesFilter("all")}>Ver todas</button>}
            </section>

            <section className="panel upcoming-widget">
              <h2 className="section-title">Próximos partidos</h2>
              {myUpcomingConfirmed.length === 0 ? (
                <p className="private-hint">Todavía no confirmaste próximos partidos.</p>
              ) : (
                <>
                  <ul className="upcoming-list">
                    {visibleUpcoming.map(r => (
                      <li key={r.id}>
                        <div className="upcoming-date">
                          <span>{new Date(r.startDateTime).toLocaleDateString("es-AR", { month: "short" })}</span>
                          <strong>{new Date(r.startDateTime).toLocaleDateString("es-AR", { day: "2-digit" })}</strong>
                        </div>
                        <div className="upcoming-content">
                          <p>{r.courtName}</p>
                          <span>{new Date(r.startDateTime).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {myUpcomingConfirmed.length > 3 && <button className="link-btn active" onClick={() => setShowAllUpcoming(!showAllUpcoming)}>{showAllUpcoming ? "Ver menos" : "Ver más"}</button>}
                </>
              )}
            </section>

            {renderReservationList("Reservas activas", filteredMatches, "No hay reservas actualmente.", true)}
          </>
        )}

        {activeTab === "mis-reservas" && (
          <>
            {!showCreateForm && <section className="panel"><button onClick={() => setShowCreateForm(true)} disabled={busy}>Reservá un partido</button></section>}
            {renderReservationList("Mis reservas", reservations.filter(r => r.status === "active" && isReservationCreator(r, currentUser.id)), "Todavía no reservaste nada.")}
          </>
        )}

        {activeTab === "perfil" && <ProfileView user={currentUser} onLogout={handleLogout} onRequestNotifications={registerPushToken} busy={busy} />}

        <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      </main>

      {showCreateForm && (
        <div className="sheet-backdrop" onClick={() => setShowCreateForm(false)}>
          <section className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" /><div className="sheet-head"><h3>Nueva reserva</h3><button className="sheet-close" onClick={() => setShowCreateForm(false)}>Cerrar</button></div>
            <ReservationForm currentUser={currentUser} onCreate={handleCreate} onCancel={() => setShowCreateForm(false)} />
          </section>
        </div>
      )}

      {selectedReservation && (
        <div className="sheet-backdrop" onClick={() => setExpandedReservationId(null)}>
          <section className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" /><div className="sheet-head"><h3>Partido</h3><button className="sheet-close" onClick={() => setExpandedReservationId(null)}>Cerrar</button></div>
            <ReservationDetail
              reservation={selectedReservation} currentUser={currentUser} appUrl={shareBaseUrl}
              onSetAttendanceStatus={(rid, s) => setAttendanceStatus(rid, currentUser, s)}
              onCancel={id => cancelReservation(id, currentUser)}
              onUpdateReservation={(id, up) => updateReservationDetails(id, up, currentUser)}
            />
          </section>
        </div>
      )}
    </>
  );
}
