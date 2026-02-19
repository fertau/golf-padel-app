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
  acceptInviteToken,
  cancelReservation,
  createGroup,
  createGroupInviteLink,
  createReservation,
  createReservationInviteLink,
  ensureUserDefaultGroup,
  isCloudDbEnabled,
  setAttendanceStatus,
  subscribeCourts,
  subscribeGroups,
  subscribeReservations,
  subscribeVenues,
  updateReservationDetails
} from "./lib/dataStore";
import { registerPushToken } from "./lib/push";
import type { Court, Group, Reservation, Venue } from "./lib/types";
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

type HistoryStatus = "confirmed" | "maybe" | "cancelled";
type HistoryRange = "1m" | "3m" | "6m" | "1y" | "month";

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
  const [historyStatuses, setHistoryStatuses] = useState<HistoryStatus[]>(["confirmed", "maybe", "cancelled"]);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("3m");
  const [historyMonth, setHistoryMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;
  });
  const [historyPlayerFilter, setHistoryPlayerFilter] = useState("all");
  const [historyCourtFilter, setHistoryCourtFilter] = useState("all");
  const [groups, setGroups] = useState<Group[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [activeGroupScope, setActiveGroupScope] = useState<"all" | string>("all");
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
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

  // 3. Subscriptions
  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeReservations(firebaseUser.uid, setReservations);
  }, [firebaseUser, setReservations]);

  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeGroups(firebaseUser.uid, setGroups);
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeVenues(setVenues);
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeCourts(setCourts);
  }, [firebaseUser]);

  // 4. Initial Path Detection
  useEffect(() => {
    const reservationPathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9-]+)$/);
    if (reservationPathMatch) {
      setExpandedReservationId(reservationPathMatch[1]);
      setActiveTab("mis-partidos");
      return;
    }

    const invitePathMatch = window.location.pathname.match(/^\/join\/([a-zA-Z0-9-]+)$/);
    if (invitePathMatch) {
      setPendingInviteToken(invitePathMatch[1]);
      setActiveTab("mis-partidos");
    }
  }, [setActiveTab, setExpandedReservationId]);

  // 4.1 Ensure group bootstrapping
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    ensureUserDefaultGroup(currentUser)
      .catch(() => null)
      .finally(() => {
        if (!cancelled) {
          // no-op, subscription catches created group
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // 4.2 Invite resolution
  useEffect(() => {
    if (!currentUser || !pendingInviteToken) return;
    let cancelled = false;

    const resolveInvite = async () => {
      try {
        const accepted = await acceptInviteToken(pendingInviteToken, currentUser);
        if (cancelled) return;
        setInviteFeedback(
          accepted.type === "group"
            ? "Te uniste al grupo."
            : "Acceso puntual habilitado para este partido."
        );
        setActiveGroupScope(accepted.groupId);
        if (accepted.reservationId) {
          setExpandedReservationId(accepted.reservationId);
        }
        window.history.replaceState({}, "", "/");
      } catch (error) {
        if (!cancelled) {
          setInviteFeedback((error as Error).message);
          window.history.replaceState({}, "", "/");
        }
      } finally {
        if (!cancelled) {
          setPendingInviteToken(null);
        }
      }
    };

    resolveInvite();

    return () => {
      cancelled = true;
    };
  }, [currentUser, pendingInviteToken, setExpandedReservationId]);

  // 5. Derived State
  const defaultGroupId = groups[0]?.id ?? null;
  const groupNameById = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.id, group.name])) as Record<string, string>,
    [groups]
  );
  const reservationsWithGroupContext = useMemo(
    () =>
      reservations.map((reservation) => ({
        ...reservation,
        groupName: reservation.groupName ?? (reservation.groupId ? groupNameById[reservation.groupId] : undefined)
      })),
    [reservations, groupNameById]
  );
  const activeReservations = useMemo(
    () => reservationsWithGroupContext.filter((reservation) => reservation.status === "active"),
    [reservationsWithGroupContext]
  );
  const matchesActiveScope = (reservation: Reservation) => {
    if (activeGroupScope === "all") {
      return true;
    }
    if (reservation.groupId === activeGroupScope) {
      return true;
    }
    return !reservation.groupId && defaultGroupId === activeGroupScope;
  };

  const scopedActiveReservations = useMemo(
    () => activeReservations.filter((reservation) => matchesActiveScope(reservation)),
    [activeReservations, activeGroupScope, defaultGroupId]
  );

  const activeUpcomingReservations = useMemo(
    () => scopedActiveReservations.filter((reservation) => parseReservationDate(reservation.startDateTime).getTime() >= Date.now()),
    [scopedActiveReservations]
  );

  const myPendingResponseCount = activeUpcomingReservations.filter(r => !getUserAttendance(r, currentUser?.id ?? "")).length;
  const myConfirmedCount = activeUpcomingReservations.filter(r => getUserAttendance(r, currentUser?.id ?? "")?.attendanceStatus === "confirmed").length;

  const myUpcomingConfirmed = useMemo(() =>
    activeUpcomingReservations
      .filter(r => getUserAttendance(r, currentUser?.id ?? "")?.attendanceStatus === "confirmed")
      .sort((a, b) => parseReservationDate(a.startDateTime).getTime() - parseReservationDate(b.startDateTime).getTime())
    , [activeUpcomingReservations, currentUser]);

  const visibleUpcoming = showAllUpcoming ? myUpcomingConfirmed : myUpcomingConfirmed.slice(0, 3);

  const filteredMatches = useMemo(() => {
    let list = activeUpcomingReservations;
    if (matchesFilter === "pending") list = list.filter(r => !getUserAttendance(r, currentUser?.id ?? ""));
    if (matchesFilter === "confirmed") list = list.filter(r => getUserAttendance(r, currentUser?.id ?? "")?.attendanceStatus === "confirmed");

    if (quickDateFilter === "all") return list;
    return list.filter(r => {
      const g = getReservationDateGroup(r.startDateTime);
      if (quickDateFilter === "hoy") return g === "hoy";
      if (quickDateFilter === "manana") return g === "manana";
      return g !== "mas-adelante";
    });
  }, [activeUpcomingReservations, matchesFilter, quickDateFilter, currentUser]);

  const historyBase = useMemo(() => {
    if (!currentUser) {
      return [];
    }
    return reservationsWithGroupContext
      .filter((reservation) => {
        if (!matchesActiveScope(reservation)) {
          return false;
        }
        const isPast = parseReservationDate(reservation.startDateTime).getTime() < Date.now();
        if (!isPast) {
          return false;
        }
        return Boolean(getUserAttendance(reservation, currentUser.id)) || isReservationCreator(reservation, currentUser.id);
      })
      .sort((a, b) => parseReservationDate(b.startDateTime).getTime() - parseReservationDate(a.startDateTime).getTime());
  }, [reservationsWithGroupContext, currentUser, activeGroupScope, defaultGroupId]);

  const historyStats = useMemo(() => {
    if (!currentUser) {
      return { playedCount: 0, latest: "-" };
    }
    const playedCount = historyBase.filter(
      (reservation) => getUserAttendance(reservation, currentUser.id)?.attendanceStatus === "confirmed"
    ).length;
    const latest = historyBase[0]?.startDateTime
      ? `${new Date(historyBase[0].startDateTime).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })} · ${new Date(historyBase[0].startDateTime).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}`
      : "-";
    return { playedCount, latest };
  }, [historyBase, currentUser]);

  const historyMonthOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const reservation of historyBase) {
      const date = new Date(reservation.startDateTime);
      const key = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
      unique.add(key);
    }
    return Array.from(unique).sort((a, b) => b.localeCompare(a));
  }, [historyBase]);

  const historyPlayers = useMemo(() => {
    const unique = new Map<string, string>();
    for (const reservation of historyBase) {
      for (const signup of reservation.signups) {
        const key = signup.authUid || signup.userId || signup.id;
        if (!unique.has(key)) {
          unique.set(key, signup.userName);
        }
      }
    }
    return Array.from(unique.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  }, [historyBase]);

  const historyCourtOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const reservation of historyBase) {
      if (reservation.courtName?.trim()) {
        unique.add(reservation.courtName.trim());
      }
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [historyBase]);

  const filteredHistory = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    return historyBase.filter((reservation) => {
      const attendanceStatus = getUserAttendance(reservation, currentUser.id)?.attendanceStatus;
      if (!attendanceStatus || !historyStatuses.includes(attendanceStatus)) {
        return false;
      }

      if (historyCourtFilter !== "all" && reservation.courtName !== historyCourtFilter) {
        return false;
      }

      const start = new Date(reservation.startDateTime);
      const now = new Date();
      if (historyRange === "1m") {
        const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        if (start < cutoff) {
          return false;
        }
      }
      if (historyRange === "3m") {
        const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        if (start < cutoff) {
          return false;
        }
      }
      if (historyRange === "6m") {
        const cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        if (start < cutoff) {
          return false;
        }
      }
      if (historyRange === "1y") {
        const cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        if (start < cutoff) {
          return false;
        }
      }
      if (historyRange === "month") {
        const key = `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, "0")}`;
        if (key !== historyMonth) {
          return false;
        }
      }

      if (historyPlayerFilter === "all") {
        return true;
      }

      return reservation.signups.some((signup) => {
        const key = signup.authUid || signup.userId || signup.id;
        return key === historyPlayerFilter;
      });
    });
  }, [
    currentUser,
    historyBase,
    historyStatuses,
    historyCourtFilter,
    historyRange,
    historyMonth,
    historyPlayerFilter
  ]);

  const selectedReservation = expandedReservationId ? reservationsWithGroupContext.find(r => r.id === expandedReservationId) || null : null;
  const defaultCreateGroupId = activeGroupScope === "all" ? groups[0]?.id : activeGroupScope;
  const isSynchronized = Boolean(currentUser && isCloudDbEnabled() && isOnline);
  const requiresNameSetup = Boolean(currentUser && !isValidDisplayName(currentUser.name));

  const signupNameByAuthUid = useMemo(() => {
    const map = new Map<string, { name: string; updatedAt: number }>();
    for (const reservation of reservationsWithGroupContext) {
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
  }, [reservationsWithGroupContext]);

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

  useEffect(() => {
    if (activeGroupScope === "all") {
      return;
    }
    if (!groups.some((group) => group.id === activeGroupScope)) {
      setActiveGroupScope("all");
    }
  }, [activeGroupScope, groups]);

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

  const handleCreateGroup = async (name: string) => {
    if (!currentUser) return;
    const created = await createGroup(name, currentUser);
    setActiveGroupScope(created.id);
  };

  const handleCreateGroupInviteLink = async (groupId: string) => {
    if (!currentUser) {
      throw new Error("Necesitás iniciar sesión.");
    }
    return createGroupInviteLink(groupId, currentUser, shareBaseUrl);
  };

  const handleCreateGuestInviteLink = async (reservationId: string) => {
    if (!currentUser) {
      throw new Error("Necesitás iniciar sesión.");
    }
    return createReservationInviteLink(reservationId, currentUser, shareBaseUrl);
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

        <section className="panel">
          <h2 className="section-title">Grupo activo</h2>
          <div className="quick-chip-row">
            <button
              type="button"
              className={`quick-chip ${activeGroupScope === "all" ? "active" : ""}`}
              onClick={() => setActiveGroupScope("all")}
            >
              Todos mis grupos
            </button>
            {groups.map((group) => (
              <button
                key={`scope-${group.id}`}
                type="button"
                className={`quick-chip ${activeGroupScope === group.id ? "active" : ""}`}
                onClick={() => setActiveGroupScope(group.id)}
              >
                {group.name}
              </button>
            ))}
          </div>
          {inviteFeedback ? <p className="private-hint">{inviteFeedback}</p> : null}
        </section>

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
                                {activeGroupScope === "all" && reservation.groupName ? (
                                  <>
                                    <span className="upcoming-dot" aria-hidden="true">•</span>
                                    <span className="upcoming-players">{reservation.groupName}</span>
                                  </>
                                ) : null}
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
                      <span className="kpi-label">Partidos jugados</span>
                      <strong>{historyStats.playedCount}</strong>
                    </article>
                    <article className="kpi-card">
                      <span className="kpi-label">Último partido</span>
                      <strong>{historyStats.latest}</strong>
                    </article>
                  </div>

                  <div className="history-level">
                    <small className="private-hint">Todos / Ninguno</small>
                    <div className="quick-chip-row">
                      <button
                        type="button"
                        className={`quick-chip ${historyStatuses.length === 3 ? "active" : ""}`}
                        onClick={() => setHistoryStatuses(["confirmed", "maybe", "cancelled"])}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        className={`quick-chip ${historyStatuses.length === 0 ? "active" : ""}`}
                        onClick={() => setHistoryStatuses([])}
                      >
                        Ninguno
                      </button>
                    </div>
                  </div>

                  <div className="history-level">
                    <small className="private-hint">Jugados / Quizás / No jugados</small>
                    <div className="quick-chip-row">
                      {[
                        { id: "confirmed", label: "Jugados" },
                        { id: "maybe", label: "Quizás" },
                        { id: "cancelled", label: "No jugados" }
                      ].map((chip) => {
                        const active = historyStatuses.includes(chip.id as HistoryStatus);
                        return (
                          <button
                            key={`history-status-${chip.id}`}
                            type="button"
                            className={`quick-chip ${active ? "active" : ""}`}
                            onClick={() =>
                              setHistoryStatuses((prev) =>
                                prev.includes(chip.id as HistoryStatus)
                                  ? prev.filter((item) => item !== chip.id)
                                  : [...prev, chip.id as HistoryStatus]
                              )
                            }
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="history-level">
                    <small className="private-hint">Periodo</small>
                    <div className="quick-chip-row">
                      {[
                        { id: "1m", label: "Último mes" },
                        { id: "3m", label: "Últimos 3 meses" },
                        { id: "6m", label: "Últimos 6 meses" },
                        { id: "1y", label: "Último año" },
                        { id: "month", label: "Selector de mes" }
                      ].map((chip) => (
                        <button
                          key={`history-range-${chip.id}`}
                          type="button"
                          className={`quick-chip ${historyRange === chip.id ? "active" : ""}`}
                          onClick={() => setHistoryRange(chip.id as HistoryRange)}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                    {historyRange === "month" ? (
                      <select
                        className="history-select"
                        value={historyMonth}
                        onChange={(event) => setHistoryMonth(event.target.value)}
                      >
                        {historyMonthOptions.length === 0 ? (
                          <option value={historyMonth}>Sin meses en historial</option>
                        ) : historyMonthOptions.map((option) => (
                          <option key={`history-month-${option}`} value={option}>
                            {new Date(`${option}-01T00:00:00`).toLocaleDateString("es-AR", {
                              month: "long",
                              year: "numeric"
                            })}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>

                  <div className="history-level history-grid-filters">
                    <div>
                      <small className="private-hint">Jugador/es</small>
                      <select
                        className="history-select"
                        value={historyPlayerFilter}
                        onChange={(event) => setHistoryPlayerFilter(event.target.value)}
                      >
                        <option value="all">Todos los jugadores</option>
                        {historyPlayers.map((player) => (
                          <option key={`history-player-${player.id}`} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <small className="private-hint">Cancha</small>
                      <div className="quick-chip-row">
                        {["all", ...historyCourtOptions].map((court) => (
                          <button
                            key={`history-court-${court}`}
                            type="button"
                            className={`quick-chip ${historyCourtFilter === court ? "active" : ""}`}
                            onClick={() => setHistoryCourtFilter(court)}
                          >
                            {court === "all" ? "Todas" : court}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

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
            {!showCreateForm && (
              <section className="panel">
                <button onClick={() => setShowCreateForm(true)} disabled={busy || groups.length === 0}>
                  Reservá un partido
                </button>
                {groups.length === 0 ? <p className="private-hint">Creá o uníte a un grupo para reservar.</p> : null}
              </section>
            )}
            {renderReservationList(
              "Mis reservas",
              reservations.filter(
                (reservation) =>
                  reservation.status === "active" &&
                  isReservationCreator(reservation, currentUser.id) &&
                  matchesActiveScope(reservation)
              ),
              "Todavía no reservaste nada."
            )}
          </>
        )}

        {activeTab === "perfil" && (
          <ProfileView
            user={currentUser}
            groups={groups}
            activeGroupScope={activeGroupScope}
            onSetActiveGroupScope={setActiveGroupScope}
            onCreateGroup={handleCreateGroup}
            onCreateGroupInvite={handleCreateGroupInviteLink}
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
            <ReservationForm
              currentUser={currentUser}
              groups={groups}
              venues={venues}
              courts={courts}
              defaultGroupId={defaultCreateGroupId}
              onCreate={handleCreate}
              onCancel={() => setShowCreateForm(false)}
            />
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
              onCreateGuestInvite={handleCreateGuestInviteLink}
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
