import { useEffect, useMemo, useRef, useState } from "react";
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
import { FilterBar } from "./components/FilterBar";
import { HistoryView } from "./components/HistoryView";
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
  deleteGroup,
  isCloudDbEnabled,
  leaveGroup,
  migrateLegacyReservationsForUser,
  removeGroupMember,
  renameGroup,
  setGroupMemberAdmin,
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

const isReservationGroupScoped = (reservation: Reservation): boolean => {
  if (reservation.visibilityScope === "group" || reservation.visibilityScope === "link_only") {
    return reservation.visibilityScope === "group";
  }
  return Boolean(reservation.groupId && reservation.groupId !== "default-group");
};

const getShareBaseUrl = (): string => {
  const configured = import.meta.env.VITE_SHARE_BASE_URL?.trim();
  const fallback = window.location.origin;
  return (configured && configured.length > 0 ? configured : fallback).replace(/\/+$/, "");
};

type HistoryStatus = "confirmed" | "maybe" | "cancelled";
type HistoryRange = "all" | "1m" | "3m" | "6m" | "1y" | "month";

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
  const [historyRange, setHistoryRange] = useState<HistoryRange>("all");
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
  const [contextNotice, setContextNotice] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const processedInviteTokensRef = useRef<Set<string>>(new Set());
  const inFlightInviteTokenRef = useRef<string | null>(null);
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
      setContextNotice("Accediste desde un link directo a un partido.");
      return;
    }

    const invitePathMatch = window.location.pathname.match(/^\/join\/([a-zA-Z0-9-]+)\/?$/);
    const inviteFromPath = invitePathMatch?.[1];
    const inviteFromQuery =
      new URLSearchParams(window.location.search).get("invite") ??
      new URLSearchParams(window.location.search).get("token");
    const inviteTokenRaw = inviteFromPath ?? inviteFromQuery;
    const inviteToken = inviteTokenRaw?.trim().replace(/[.,;:!?]+$/, "") ?? null;

    if (inviteToken) {
      setPendingInviteToken(inviteToken);
      setActiveTab("mis-partidos");
      setContextNotice("Validando invitación...");
    }
  }, [setActiveTab, setExpandedReservationId]);

  useEffect(() => {
    if (!currentUser || groups.length === 0) return;
    const fallbackGroup =
      groups.find((group) => group.name.trim().toLowerCase() === "mi grupo") ??
      groups.find((group) => group.ownerAuthUid === currentUser.id) ??
      groups[0];
    migrateLegacyReservationsForUser(currentUser, fallbackGroup.id, fallbackGroup.name).catch(() => null);
  }, [currentUser, groups]);

  // 4.2 Invite resolution
  useEffect(() => {
    if (!currentUser || !pendingInviteToken) return;
    if (processedInviteTokensRef.current.has(pendingInviteToken)) {
      setPendingInviteToken(null);
      return;
    }
    if (inFlightInviteTokenRef.current === pendingInviteToken) {
      return;
    }
    let cancelled = false;
    const token = pendingInviteToken;
    inFlightInviteTokenRef.current = token;

    const resolveInvite = async () => {
      try {
        const accepted = await acceptInviteToken(token, currentUser);
        if (cancelled) return;
        processedInviteTokensRef.current.add(token);
        setInviteFeedback(
          accepted.type === "group"
            ? "Te uniste al grupo."
            : "Acceso puntual habilitado para este partido."
        );
        setContextNotice(
          accepted.type === "group"
            ? "Invitación aceptada. Ya podés usar el grupo."
            : "Invitación puntual aceptada."
        );
        setActiveGroupScope(accepted.groupId);
        if (accepted.reservationId) {
          setExpandedReservationId(accepted.reservationId);
        }
        window.history.replaceState({}, "", "/");
      } catch (error) {
        if (!cancelled) {
          if (processedInviteTokensRef.current.has(token)) {
            return;
          }
          const rawMessage = (error as Error).message;
          const normalizedMessage = rawMessage?.toLowerCase() ?? "";
          const isInvalidInviteError =
            normalizedMessage.includes("invitación no encontrada") ||
            normalizedMessage.includes("invitacion no encontrada") ||
            normalizedMessage.includes("invitación vencida") ||
            normalizedMessage.includes("invitacion vencida") ||
            normalizedMessage.includes("invitación inválida") ||
            normalizedMessage.includes("invitacion invalida") ||
            normalizedMessage.includes("invalid invite") ||
            normalizedMessage.includes("expired invite") ||
            normalizedMessage.includes("no tenés permisos") ||
            normalizedMessage.includes("no tienes permisos") ||
            normalizedMessage.includes("without permission");
          const inviteErrorMessage =
            rawMessage && isInvalidInviteError
              ? "La invitación es inválida, venció o no tenés permisos."
              : rawMessage;
          setInviteFeedback(inviteErrorMessage);
          setContextNotice(null);
          window.history.replaceState({}, "", "/");
        }
      } finally {
        if (!cancelled) {
          if (inFlightInviteTokenRef.current === token) {
            inFlightInviteTokenRef.current = null;
          }
          setPendingInviteToken(null);
        }
      }
    };

    resolveInvite();

    return () => {
      cancelled = true;
    };
  }, [currentUser, pendingInviteToken, setExpandedReservationId]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  // 5. Derived State
  const defaultGroupId = groups[0]?.id ?? null;
  const groupNameById = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.id, group.name])) as Record<string, string>,
    [groups]
  );
  const defaultGroupName = defaultGroupId ? (groupNameById[defaultGroupId] ?? null) : null;
  const reservationsWithGroupContext = useMemo(
    () =>
      reservations.map((reservation) => ({
        ...reservation,
        groupName:
          isReservationGroupScoped(reservation) && reservation.groupId && groupNameById[reservation.groupId]
            ? groupNameById[reservation.groupId]
            : isReservationGroupScoped(reservation) && (!reservation.groupId || reservation.groupId === "default-group")
              ? (defaultGroupName ?? reservation.groupName)
              : isReservationGroupScoped(reservation) && reservation.groupName === "Mi grupo" && defaultGroupName
                ? defaultGroupName
                : reservation.groupName
      })),
    [reservations, groupNameById, defaultGroupName]
  );

  useEffect(() => {
    if (!expandedReservationId || activeGroupScope !== "all") return;
    const selected = reservationsWithGroupContext.find((reservation) => reservation.id === expandedReservationId);
    if (selected?.groupId) {
      setActiveGroupScope(selected.groupId);
    }
  }, [expandedReservationId, activeGroupScope, reservationsWithGroupContext]);

  const activeReservations = useMemo(
    () => reservationsWithGroupContext.filter((reservation) => reservation.status === "active"),
    [reservationsWithGroupContext]
  );

  const activeGroupScopedReservations = useMemo(
    () => activeReservations.filter((reservation) => isReservationGroupScoped(reservation)),
    [activeReservations]
  );

  const matchesActiveScope = (reservation: Reservation) => {
    if (activeGroupScope === "all") {
      return true;
    }
    if (!isReservationGroupScoped(reservation)) {
      return false;
    }
    if (reservation.groupId === activeGroupScope) {
      return true;
    }
    return false;
  };

  const scopedActiveReservations = useMemo(
    () => activeGroupScopedReservations.filter((reservation) => matchesActiveScope(reservation)),
    [activeGroupScopedReservations, activeGroupScope]
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
        const visibleInScope =
          matchesActiveScope(reservation) ||
          (!isReservationGroupScoped(reservation) && activeGroupScope === "all");
        if (!visibleInScope) {
          return false;
        }
        const isPast = parseReservationDate(reservation.startDateTime).getTime() < Date.now();
        if (!isPast) {
          return false;
        }
        return Boolean(getUserAttendance(reservation, currentUser.id)) || isReservationCreator(reservation, currentUser.id);
      })
      .sort((a, b) => parseReservationDate(b.startDateTime).getTime() - parseReservationDate(a.startDateTime).getTime());
  }, [reservationsWithGroupContext, currentUser, activeGroupScope]);

  const historyStats = useMemo(() => {
    if (!currentUser) {
      return { playedCount: 0, latest: "-" };
    }
    const playedCount = historyBase.filter(
      (reservation) =>
        getUserAttendance(reservation, currentUser.id)?.attendanceStatus === "confirmed" ||
        (!getUserAttendance(reservation, currentUser.id) && isReservationCreator(reservation, currentUser.id))
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
      const effectiveStatus = attendanceStatus ?? (isReservationCreator(reservation, currentUser.id) ? "confirmed" : null);
      if (!effectiveStatus || !historyStatuses.includes(effectiveStatus)) {
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

  const handleRenameGroup = async (groupId: string, name: string) => {
    if (!currentUser) return;
    await renameGroup(groupId, name, currentUser);
  };

  const handleCreateGroupInviteLink = async (
    groupId: string,
    channel: "whatsapp" | "email" | "link" = "link"
  ) => {
    if (!currentUser) {
      throw new Error("Necesitás iniciar sesión.");
    }
    return createGroupInviteLink(groupId, currentUser, shareBaseUrl, channel);
  };

  const handleCreateGuestInviteLink = async (
    reservationId: string,
    channel: "whatsapp" | "email" | "link" = "link"
  ) => {
    if (!currentUser) {
      throw new Error("Necesitás iniciar sesión.");
    }
    return createReservationInviteLink(reservationId, currentUser, shareBaseUrl, channel);
  };

  const handleSetGroupMemberAdmin = async (
    groupId: string,
    targetAuthUid: string,
    makeAdmin: boolean
  ) => {
    if (!currentUser) {
      throw new Error("Necesitás iniciar sesión.");
    }
    await setGroupMemberAdmin(groupId, targetAuthUid, makeAdmin, currentUser);
  };

  const handleRemoveGroupMember = async (groupId: string, targetAuthUid: string) => {
    if (!currentUser) {
      throw new Error("Necesitás iniciar sesión.");
    }
    await removeGroupMember(groupId, targetAuthUid, currentUser);
  };

  const handleLeaveGroup = async (groupId: string) => {
    if (!currentUser) {
      throw new Error("Necesitás iniciar sesión.");
    }
    await leaveGroup(groupId, currentUser);
    setActiveGroupScope("all");
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!currentUser) {
      throw new Error("Necesitás iniciar sesión.");
    }
    await deleteGroup(groupId, currentUser);
    setActiveGroupScope("all");
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

  const handleCancelReservation = async (reservationId: string) => {
    if (!currentUser) return;
    try {
      setExpandedReservationId(null);
      triggerHaptic("medium");
      setBusy(true);
      await cancelReservation(reservationId, currentUser);
      setToastMessage("Reserva cancelada.");
    } catch (error) {
      alert((error as Error).message || "No se pudo eliminar la reserva.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateReservation = async (
    reservationId: string,
    updates: {
      courtName: string;
      startDateTime: string;
      durationMinutes: number;
      groupId?: string;
      groupName?: string;
      visibilityScope?: "group" | "link_only";
    }
  ) => {
    if (!currentUser) return;
    try {
      setBusy(true);
      await updateReservationDetails(reservationId, updates, currentUser);
      triggerHaptic("medium");
      setToastMessage("Reserva actualizada.");
    } catch (error) {
      alert((error as Error).message || "No se pudo modificar la reserva.");
    } finally {
      setBusy(false);
    }
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
    <section className="panel glass-panel-elite animate-fade-in">
      <h2 className="section-title">{title}</h2>
      {groupByDate && (
        <FilterBar currentFilter={quickDateFilter} onFilterChange={setQuickDateFilter} />
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
        <header className="header court-header glass-panel-elite animate-fade-in">
          <div className="brand-shell">
            <img src="/apple-touch-icon.png" alt="Padel App" className="brand-icon" />
            <h1 className="name-logo">PADEL <span>APP</span></h1>
          </div>
          <div className={`header-pill sync-pill ${isSynchronized ? "ok" : "off"}`}>
            <span className="sync-dot" />
            {isSynchronized ? "Sincronizado" : "No sincronizado"}
          </div>
        </header>

        {activeTab !== "perfil" ? (
          <section className="panel glass-panel-elite animate-fade-in">
            <h2 className="section-title">Vista por grupo</h2>
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
          </section>
        ) : null}

        {activeTab === "mis-partidos" && (
          <>
            <section className="panel glass-panel-elite animate-fade-in my-summary">
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

            <section className="panel upcoming-widget glass-panel-elite animate-fade-in">
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
                            onClick={() => {
                              triggerHaptic("light");
                              setExpandedReservationId(isActive ? null : reservation.id);
                            }}
                          >
                            <div className="upcoming-date">
                              <span>{month}</span>
                              <strong className={isActive ? "upcoming-day-active" : ""}>{day}</strong>
                            </div>
                            <div className="upcoming-content">
                              <div className="upcoming-details-line">
                                <span className="upcoming-time">
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                                  <span>{time}</span>
                                </span>
                                <span className="upcoming-court">{reservation.courtName}</span>
                              </div>
                              <div className="upcoming-meta-chips">
                                {activeGroupScope === "all" && reservation.groupName ? (
                                  <span className="upcoming-chip upcoming-chip-accent">{reservation.groupName}</span>
                                ) : null}
                                <span className="upcoming-chip">{confirmedCount}/4 jugando</span>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {myUpcomingConfirmed.length > 3 ? (
                    <button className="btn-elite btn-elite-outline upcoming-more-btn" onClick={() => setShowAllUpcoming(!showAllUpcoming)}>
                      {showAllUpcoming ? "Ver menos" : "Ver más"}
                    </button>
                  ) : null}
                </>
              )}
            </section>

            {renderReservationList("Reservas activas", filteredMatches, "No hay reservas actualmente.", true)}

            <HistoryView
              historyExpanded={historyExpanded}
              setHistoryExpanded={setHistoryExpanded}
              historyStats={historyStats}
              historyStatuses={historyStatuses}
              setHistoryStatuses={setHistoryStatuses}
              historyRange={historyRange}
              setHistoryRange={setHistoryRange}
              historyMonth={historyMonth}
              setHistoryMonth={setHistoryMonth}
              historyMonthOptions={historyMonthOptions}
              historyPlayerFilter={historyPlayerFilter}
              setHistoryPlayerFilter={setHistoryPlayerFilter}
              historyPlayers={historyPlayers}
              historyCourtFilter={historyCourtFilter}
              setHistoryCourtFilter={setHistoryCourtFilter}
              historyCourtOptions={historyCourtOptions}
              filteredHistory={filteredHistory}
              currentUser={currentUser}
              onOpenReservation={setExpandedReservationId}
              expandedReservationId={expandedReservationId}
            />
          </>
        )}

        {activeTab === "mis-reservas" && (
          <>
            {!showCreateForm && (
              <section className="panel glass-panel-elite animate-fade-in">
                <button className="btn-elite btn-elite-accent btn-block" onClick={() => setShowCreateForm(true)} disabled={busy}>
                  + Reservá un partido
                </button>
                {groups.length === 0 ? <p className="private-hint">Podés reservar en modo solo link o crear/unirte a un grupo.</p> : null}
              </section>
            )}
            {renderReservationList(
              "Mis reservas",
              reservationsWithGroupContext.filter(
                (reservation) =>
                  reservation.status === "active" &&
                  isReservationCreator(reservation, currentUser.id) &&
                  (matchesActiveScope(reservation) ||
                    (!isReservationGroupScoped(reservation) && activeGroupScope === "all"))
              ),
              "Todavía no reservaste nada."
            )}
          </>
        )}

        {activeTab === "perfil" && (
          <ProfileView
            user={currentUser}
            groups={groups}
            memberDirectory={signupNameByAuthUid}
            onCreateGroup={handleCreateGroup}
            onRenameGroup={handleRenameGroup}
            onCreateGroupInvite={handleCreateGroupInviteLink}
            onSetGroupMemberAdmin={handleSetGroupMemberAdmin}
            onRemoveGroupMember={handleRemoveGroupMember}
            onLeaveGroup={handleLeaveGroup}
            onDeleteGroup={handleDeleteGroup}
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
              groups={groups}
              signupNameByAuthUid={signupNameByAuthUid}
              onSetAttendanceStatus={(rid, s) => setAttendanceStatus(rid, currentUser, s)}
              onCancel={handleCancelReservation}
              onCreateGuestInvite={handleCreateGuestInviteLink}
              onFeedback={setToastMessage}
              onUpdateReservation={handleUpdateReservation}
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
      {/* Elite Floating Toasts */}
      <div className="toasts-container-elite">
        {inviteFeedback ? (
          <div className="toast-elite animate-slide-up">
            <span>{inviteFeedback}</span>
          </div>
        ) : null}
        {contextNotice ? (
          <div className="toast-elite animate-slide-up" role="status">
            <span>{contextNotice}</span>
            <button type="button" className="toast-close" onClick={() => setContextNotice(null)}>OK</button>
          </div>
        ) : null}
        {toastMessage ? (
          <div className="toast-elite animate-slide-up" role="status" aria-live="polite">
            <span>{toastMessage}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
