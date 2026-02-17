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
  updateProfile
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
import type { Reservation } from "./lib/types";
import {
  getUserAttendance,
  isGenericDisplayName,
  isReservationCreator,
  isValidDisplayName,
  normalizeDisplayName,
  triggerHaptic
} from "./lib/utils";
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

type HistoryFilter = "all" | "played" | "confirmed" | "maybe" | "cancelled" | "court-1" | "court-2";

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
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historySearch, setHistorySearch] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
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
    const firebaseAuth = auth;
    if (!firebaseAuth) {
      setAuthLoading(false);
      return;
    }

    let cancelled = false;

    const setupRedirect = async () => {
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

    setupRedirect();

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
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

  const historyBase = useMemo(() => {
    if (!currentUser) {
      return [];
    }
    return reservations
      .filter((reservation) => {
        const isPast = new Date(reservation.startDateTime).getTime() < Date.now();
        if (!isPast) {
          return false;
        }
        return Boolean(getUserAttendance(reservation, currentUser.id)) || isReservationCreator(reservation, currentUser.id);
      })
      .sort((a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime());
  }, [reservations, currentUser]);

  const historyStats = useMemo(() => {
    if (!currentUser) {
      return { total: 0, confirmed: 0, cancelled: 0, latest: "-" };
    }
    const total = historyBase.length;
    const confirmed = historyBase.filter(
      (reservation) => getUserAttendance(reservation, currentUser.id)?.attendanceStatus === "confirmed"
    ).length;
    const cancelled = historyBase.filter(
      (reservation) => getUserAttendance(reservation, currentUser.id)?.attendanceStatus === "cancelled"
    ).length;
    const latest = historyBase[0]?.startDateTime
      ? new Date(historyBase[0].startDateTime).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
      : "-";
    return { total, confirmed, cancelled, latest };
  }, [historyBase, currentUser]);

  const filteredHistory = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    const query = historySearch.trim().toLowerCase();

    return historyBase.filter((reservation) => {
      const attendanceStatus = getUserAttendance(reservation, currentUser.id)?.attendanceStatus;

      if (historyFilter === "played" && attendanceStatus !== "confirmed") {
        return false;
      }
      if (historyFilter === "confirmed" && attendanceStatus !== "confirmed") {
        return false;
      }
      if (historyFilter === "maybe" && attendanceStatus !== "maybe") {
        return false;
      }
      if (historyFilter === "cancelled" && attendanceStatus !== "cancelled") {
        return false;
      }
      if (historyFilter === "court-1" && reservation.courtName !== "Cancha 1") {
        return false;
      }
      if (historyFilter === "court-2" && reservation.courtName !== "Cancha 2") {
        return false;
      }

      if (!query) {
        return true;
      }

      const candidates = [
        reservation.courtName,
        reservation.createdBy.name,
        ...reservation.signups.map((signup) => signup.userName)
      ]
        .filter(Boolean)
        .map((value) => value.toLowerCase());

      return candidates.some((value) => value.includes(query));
    });
  }, [currentUser, historyBase, historyFilter, historySearch]);

  const selectedReservation = expandedReservationId ? reservations.find(r => r.id === expandedReservationId) || null : null;
  const isSynchronized = Boolean(currentUser && isCloudDbEnabled() && isOnline);
  const requiresNameSetup = Boolean(currentUser && !isValidDisplayName(currentUser.name));

  const signupNameByAuthUid = useMemo(() => {
    const map = new Map<string, { name: string; updatedAt: number }>();
    for (const reservation of reservations) {
      if (reservation.createdByAuthUid && !isGenericDisplayName(reservation.createdBy.name)) {
        map.set(reservation.createdByAuthUid, {
          name: reservation.createdBy.name,
          updatedAt: new Date(reservation.updatedAt).getTime()
        });
      }
      for (const signup of reservation.signups) {
        if (!signup.authUid || isGenericDisplayName(signup.userName)) {
          continue;
        }
        const timestamp = new Date(signup.updatedAt || signup.createdAt).getTime();
        const existing = map.get(signup.authUid);
        if (!existing || timestamp >= existing.updatedAt) {
          map.set(signup.authUid, { name: signup.userName, updatedAt: timestamp });
        }
      }
    }
    return Object.fromEntries(
      Array.from(map.entries()).map(([authUid, value]) => [authUid, value.name])
    ) as Record<string, string>;
  }, [reservations]);

  useEffect(() => {
    if (!currentUser) {
      setNameDraft("");
      setNameError(null);
      return;
    }
    const suggested = isGenericDisplayName(currentUser.name) ? "" : currentUser.name;
    setNameDraft(suggested);
    setNameError(null);
  }, [currentUser?.id, currentUser?.name]);

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
      triggerHaptic("medium");
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

  const handleUpdateDisplayName = async (nextName: string) => {
    const firebaseAuth = auth;
    if (!firebaseAuth?.currentUser) {
      throw new Error("Necesitás iniciar sesión.");
    }

    const normalized = normalizeDisplayName(nextName);
    if (!isValidDisplayName(normalized)) {
      throw new Error("Elegí un nombre válido (2-32 caracteres, no genérico).");
    }

    await updateProfile(firebaseAuth.currentUser, { displayName: normalized });
    setFirebaseUser(firebaseAuth.currentUser);
  };

  const saveMandatoryDisplayName = async () => {
    const normalized = normalizeDisplayName(nameDraft);
    if (!isValidDisplayName(normalized)) {
      setNameError("Ingresá un nombre válido (2-32 caracteres, no genérico).");
      return;
    }
    try {
      setSavingName(true);
      setNameError(null);
      await handleUpdateDisplayName(normalized);
      triggerHaptic("medium");
    } catch (error) {
      setNameError((error as Error).message);
    } finally {
      setSavingName(false);
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
                  <span className="kpi-label">Juego</span>
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
                    {visibleUpcoming.map((reservation) => {
                      const start = new Date(reservation.startDateTime);
                      const month = start.toLocaleDateString("es-AR", { month: "short" }).replace(".", "").toUpperCase();
                      const day = start.toLocaleDateString("es-AR", { day: "2-digit" });
                      const time = start.toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false
                      });
                      const confirmedCount = reservation.signups.filter(
                        (signup) => signup.attendanceStatus === "confirmed"
                      ).length;
                      const isActive = expandedReservationId === reservation.id;
                      return (
                        <li key={`upcoming-${reservation.id}`}>
                          <button
                            type="button"
                            className={`upcoming-row ${isActive ? "active" : ""}`}
                            onClick={() => setExpandedReservationId(isActive ? null : reservation.id)}
                          >
                            <div className="upcoming-date">
                              <span>{month}</span>
                              <strong>{day}</strong>
                            </div>
                            <div className="upcoming-content">
                              <div className="upcoming-details-line">
                                <span className="upcoming-time">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                                <span>{time}</span>
                              </span>
                                <span className="upcoming-dot" aria-hidden="true">•</span>
                                <span className="upcoming-court">{reservation.courtName}</span>
                                <span className="upcoming-dot" aria-hidden="true">•</span>
                                <span className="upcoming-players">{confirmedCount}/4 jugando</span>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {myUpcomingConfirmed.length > 3 ? (
                    <button className="link-btn active" onClick={() => setShowAllUpcoming(!showAllUpcoming)}>
                      {showAllUpcoming ? "Ver menos" : "Ver más"}
                    </button>
                  ) : null}
                </>
              )}
            </section>

            {renderReservationList("Reservas activas", filteredMatches, "No hay reservas actualmente.", true)}

            <section className="panel history-panel">
              <button
                type="button"
                className="history-toggle"
                onClick={() => setHistoryExpanded((prev) => !prev)}
              >
                <span>Historial y estadísticas</span>
                <span>{historyExpanded ? "Ocultar" : "Ver historial"}</span>
              </button>

              {historyExpanded ? (
                <>
                  <div className="detail-kpis history-kpis">
                    <article className="kpi-card">
                      <span className="kpi-label">Partidos</span>
                      <strong>{historyStats.total}</strong>
                    </article>
                    <article className="kpi-card">
                      <span className="kpi-label">Juego</span>
                      <strong>{historyStats.confirmed}</strong>
                    </article>
                    <article className="kpi-card">
                      <span className="kpi-label">No juego</span>
                      <strong>{historyStats.cancelled}</strong>
                    </article>
                    <article className="kpi-card">
                      <span className="kpi-label">Último</span>
                      <strong>{historyStats.latest}</strong>
                    </article>
                  </div>

                  <div className="quick-chip-row">
                    {[
                      { id: "all", label: "Todos" },
                      { id: "played", label: "Jugados" },
                      { id: "maybe", label: "Quizás" },
                      { id: "cancelled", label: "No juego" },
                      { id: "court-1", label: "Cancha 1" },
                      { id: "court-2", label: "Cancha 2" }
                    ].map((chip) => (
                      <button
                        key={`history-${chip.id}`}
                        type="button"
                        className={`quick-chip ${historyFilter === chip.id ? "active" : ""}`}
                        onClick={() => setHistoryFilter(chip.id as HistoryFilter)}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="search"
                    placeholder="Buscar por jugador o cancha"
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    className="history-search"
                  />

                  {filteredHistory.length === 0 ? (
                    <p className="private-hint">Sin resultados para los filtros elegidos.</p>
                  ) : (
                    <div className="history-list">
                      {filteredHistory.slice(0, 20).map((reservation) => {
                        const attendance = getUserAttendance(reservation, currentUser.id)?.attendanceStatus;
                        const statusLabel = attendance === "confirmed"
                          ? "Juego"
                          : attendance === "maybe"
                            ? "Quizás"
                            : attendance === "cancelled"
                              ? "No juego"
                              : "Sin respuesta";
                        const statusClass = attendance === "confirmed"
                          ? "badge-confirmed"
                          : attendance === "maybe"
                            ? "badge-maybe"
                            : "badge-cancelled";
                        return (
                          <article key={`history-${reservation.id}`} className="history-row">
                            <div className="history-main">
                              <strong>{reservation.courtName}</strong>
                              <small>
                                {new Date(reservation.startDateTime).toLocaleDateString("es-AR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "2-digit"
                                })}
                                {" · "}
                                {new Date(reservation.startDateTime).toLocaleTimeString("es-AR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false
                                })}
                              </small>
                            </div>
                            <span className={`badge ${statusClass}`}>{statusLabel}</span>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : null}
            </section>
          </>
        )}

        {activeTab === "mis-reservas" && (
          <>
            {!showCreateForm && <section className="panel"><button onClick={() => setShowCreateForm(true)} disabled={busy}>Reservá un partido</button></section>}
            {renderReservationList("Mis reservas", reservations.filter(r => r.status === "active" && isReservationCreator(r, currentUser.id)), "Todavía no reservaste nada.")}
          </>
        )}

        {activeTab === "perfil" && (
          <ProfileView
            user={currentUser}
            onLogout={handleLogout}
            onRequestNotifications={registerPushToken}
            onUpdateDisplayName={handleUpdateDisplayName}
            busy={busy}
          />
        )}

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
              signupNameByAuthUid={signupNameByAuthUid}
              onSetAttendanceStatus={(rid, s) => setAttendanceStatus(rid, currentUser, s)}
              onCancel={id => cancelReservation(id, currentUser)}
              onUpdateReservation={(id, up) => updateReservationDetails(id, up, currentUser)}
            />
          </section>
        </div>
      )}

      {requiresNameSetup && (
        <div className="sheet-backdrop" onClick={(event) => event.stopPropagation()}>
          <section className="sheet forced-name-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-head">
              <h3>Elegí tu nombre</h3>
            </div>
            <p className="private-hint">Ese nombre se verá en reservas y asistencias.</p>
            <label>
              Nombre visible
              <input
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                maxLength={32}
                autoFocus
              />
            </label>
            {nameError ? <p className="warning">{nameError}</p> : null}
            <button type="button" onClick={saveMandatoryDisplayName} disabled={savingName}>
              {savingName ? "Guardando..." : "Guardar nombre"}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
