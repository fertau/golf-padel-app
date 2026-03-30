import { useEffect, useMemo, useRef, useState } from "react";
import { updateProfile } from "firebase/auth";

// Components
import ReservationCard from "./components/ReservationCard";
import ReservationDetail from "./components/ReservationDetail";
import ReservationForm from "./components/ReservationForm";
import SplashScreen from "./components/SplashScreen";
import AuthView from "./components/AuthView";
import Navbar from "./components/Navbar";
import ProfileView from "./components/ProfileView";
import SmartHandoff from "./components/SmartHandoff";
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
  listGroupAuditEvents,
  listMyReservationHistory,
  migrateLegacyReservationsForUser,
  pullLatestCloudState,
  removeGroupMember,
  reassignReservationCreator,
  renameGroup,
  setGroupMemberAdmin,
  setAttendanceStatus,
  subscribeCourts,
  subscribeGroups,
  subscribeReservations,
  subscribeVenues,
  updateReservationDetails
} from "./lib/dataStore";
import NotificationCenter from "./components/NotificationCenter";
import { useNotifications } from "./hooks/useNotifications";
import { useFirebaseAuth } from "./hooks/useFirebaseAuth";
import type { AttendanceStatus, Court, Group, Reservation, Venue } from "./lib/types";
import {
  getUserAttendance,
  isGenericDisplayName,
  isReservationCreator,
  isValidDisplayName,
  normalizeDisplayName,
  triggerHaptic
} from "./lib/utils";
import { auth } from "./lib/firebase";

const ONE_TIME_CLEANUP_KEY = "golf-padel-cleanup-v1";

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
  const { currentUser, authLoading, authError, setFirebaseUser } = useAuthStore();
  const { firebaseUser, loginGoogle, logout: handleLogout } = useFirebaseAuth();
  const { reservations, loading: reservationsLoading, setReservations } = useReservationStore();
  const {
    activeTab, expandedReservationId, showCreateForm, isOnline,
    setActiveTab, setExpandedReservationId, setShowCreateForm, setIsOnline
  } = useUIStore();

  const [reservationsScope, setReservationsScope] = useState<"all" | "mine">("all");
  const [upcomingView, setUpcomingView] = useState<"list" | "week">("list");
  const [calendarStartIndex, setCalendarStartIndex] = useState(0);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyApiLoaded, setHistoryApiLoaded] = useState(false);
  const [historyApiReservations, setHistoryApiReservations] = useState<Reservation[]>([]);
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
  const [attendanceOverrides, setAttendanceOverrides] = useState<Record<string, AttendanceStatus>>({});

  const {
    showIOSBanner, dismissIOSBanner,
    pushPrefs, updatePushPreferences,
    inAppNotifications, markAllRead, handleTapNotification,
    isPushGranted: pushGranted,
    registerPushToken: doRegisterPush,
  } = useNotifications(
    !!firebaseUser,
    reservations,
    activeTab,
    (reservationId) => setExpandedReservationId(reservationId)
  );
  const processedInviteTokensRef = useRef<Set<string>>(new Set());
  const inFlightInviteTokenRef = useRef<string | null>(null);
  const upcomingSectionRef = useRef<HTMLElement | null>(null);
  const shareBaseUrl = getShareBaseUrl();
  const notifyError = (error: unknown, fallback: string) => {
    const message = (error as Error | undefined)?.message?.trim();
    setToastMessage(message && message.length > 0 ? message : fallback);
  };

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

  // 2. Firebase Auth Flow — handled by useFirebaseAuth hook

  // 3. Subscriptions
  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeReservations(firebaseUser.uid, setReservations);
  }, [firebaseUser, setReservations, setGroups]);

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

  useEffect(() => {
    if (!firebaseUser || !isCloudDbEnabled()) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const syncCloudState = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      try {
        const { groups: latestGroups, reservations: latestReservations } = await pullLatestCloudState();
        if (cancelled) {
          return;
        }
        setGroups(latestGroups);
        setReservations(latestReservations);
      } catch {
        // Snapshot listeners remain the source of truth; this is a resilience layer.
      } finally {
        inFlight = false;
      }
    };

    const runVisibleSync = () => {
      if (document.visibilityState === "visible") {
        void syncCloudState();
      }
    };

    void syncCloudState();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncCloudState();
      }
    }, 15000);
    window.addEventListener("focus", runVisibleSync);
    window.addEventListener("online", runVisibleSync);
    document.addEventListener("visibilitychange", runVisibleSync);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", runVisibleSync);
      window.removeEventListener("online", runVisibleSync);
      document.removeEventListener("visibilitychange", runVisibleSync);
    };
  }, [firebaseUser, setReservations]);

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
    const handlePopState = () => {
      const reservationPathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9-]+)$/);
      if (reservationPathMatch) {
        setExpandedReservationId(reservationPathMatch[1]);
        setActiveTab("mis-partidos");
        return;
      }
      setExpandedReservationId(null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
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
    if (!currentUser) {
      setAttendanceOverrides({});
      return;
    }
    setAttendanceOverrides((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const [reservationId, override] of Object.entries(previous)) {
        const reservation = reservationsWithGroupContext.find((item) => item.id === reservationId);
        if (!reservation) {
          delete next[reservationId];
          changed = true;
          continue;
        }
        const liveStatus = getUserAttendance(reservation, currentUser.id)?.attendanceStatus;
        if (liveStatus === override) {
          delete next[reservationId];
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [reservationsWithGroupContext, currentUser]);

  useEffect(() => {
    if (!expandedReservationId || activeGroupScope !== "all") return;
    const selected = reservationsWithGroupContext.find((reservation) => reservation.id === expandedReservationId);
    if (selected?.groupId) {
      setActiveGroupScope(selected.groupId);
    }
  }, [expandedReservationId, activeGroupScope, reservationsWithGroupContext]);

  useEffect(() => {
    const pathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9-]+)$/);
    if (expandedReservationId) {
      const targetPath = `/r/${expandedReservationId}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, "", targetPath);
      }
      return;
    }
    if (pathMatch) {
      window.history.pushState({}, "", "/");
    }
  }, [expandedReservationId]);

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

  const inboxPendingReservations = useMemo(
    () =>
      activeUpcomingReservations.filter((reservation) => {
        if (!currentUser) {
          return false;
        }
        if (isReservationCreator(reservation, currentUser.id)) {
          return false;
        }
        return !getUserAttendance(reservation, currentUser.id);
      }),
    [activeUpcomingReservations, currentUser]
  );

  const myPendingResponseCount = inboxPendingReservations.length;

  const upcomingByScope = useMemo(
    () =>
      activeUpcomingReservations.sort(
        (a, b) => parseReservationDate(a.startDateTime).getTime() - parseReservationDate(b.startDateTime).getTime()
      ),
    [activeUpcomingReservations]
  );

  const visibleUpcoming = showAllUpcoming ? upcomingByScope : upcomingByScope.slice(0, 3);
  const calendarWindowSize = 5;

  const getUpcomingAttendanceMeta = (
    reservation: Reservation
  ): { label: string; badgeClass: string; statusTone: "confirmed" | "maybe" | "cancelled" | "pending" } => {
    const myAttendance = currentUser ? getUserAttendance(reservation, currentUser.id)?.attendanceStatus : undefined;
    const overridden = attendanceOverrides[reservation.id];
    const effectiveStatus = myAttendance ?? (
      currentUser && isReservationCreator(reservation, currentUser.id) ? "confirmed" : undefined
    );
    const resolvedStatus = overridden ?? effectiveStatus;
    if (resolvedStatus === "confirmed") {
      return { label: "JUEGO", badgeClass: "badge-confirmed", statusTone: "confirmed" };
    }
    if (resolvedStatus === "maybe") {
      return { label: "QUIZAS", badgeClass: "badge-maybe", statusTone: "maybe" };
    }
    if (resolvedStatus === "cancelled") {
      return { label: "NO JUEGO", badgeClass: "badge-cancelled", statusTone: "cancelled" };
    }
    return { label: "PENDIENTE", badgeClass: "badge-pending", statusTone: "pending" };
  };

  const upcomingWeekDays = useMemo(() => {
    const grouped = new Map<string, Reservation[]>();
    for (const reservation of upcomingByScope) {
      const key = toLocalDayKey(parseReservationDate(reservation.startDateTime));
      const current = grouped.get(key) ?? [];
      current.push(reservation);
      grouped.set(key, current);
    }
    const today = getDayStart(new Date());
    return Array.from({ length: calendarWindowSize }, (_, offset) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + calendarStartIndex + offset);
      const key = toLocalDayKey(date);
      const reservations = (grouped.get(key) ?? []).sort(
        (a, b) => parseReservationDate(a.startDateTime).getTime() - parseReservationDate(b.startDateTime).getTime()
      );
      return { key, date, reservations };
    });
  }, [upcomingByScope, calendarStartIndex]);

  const calendarMaxStartIndex = useMemo(() => {
    const last = upcomingByScope[upcomingByScope.length - 1];
    if (!last) {
      return 0;
    }
    const today = getDayStart(new Date());
    const lastDate = getDayStart(parseReservationDate(last.startDateTime));
    const diffDays = Math.max(
      0,
      Math.floor((lastDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    );
    return Math.floor(diffDays / calendarWindowSize) * calendarWindowSize;
  }, [upcomingByScope]);

  const calendarRangeLabel = useMemo(() => {
    if (upcomingWeekDays.length === 0) {
      return "";
    }
    const first = upcomingWeekDays[0].date;
    const last = upcomingWeekDays[upcomingWeekDays.length - 1].date;
    const firstLabel = first.toLocaleDateString("es-AR", { day: "2-digit", month: "short" }).replace(".", "");
    const lastLabel = last.toLocaleDateString("es-AR", { day: "2-digit", month: "short" }).replace(".", "");
    return `${firstLabel.toUpperCase()} - ${lastLabel.toUpperCase()}`;
  }, [upcomingWeekDays]);

  const reservationListBase = useMemo(
    () =>
      activeReservations
        .filter((reservation) => parseReservationDate(reservation.startDateTime).getTime() >= Date.now())
        .filter(
          (reservation) =>
            matchesActiveScope(reservation) ||
            (!isReservationGroupScoped(reservation) && activeGroupScope === "all")
        )
        .sort(
          (a, b) => parseReservationDate(a.startDateTime).getTime() - parseReservationDate(b.startDateTime).getTime()
        ),
    [activeReservations, activeGroupScope]
  );

  const myCreatedReservationList = useMemo(
    () =>
      reservationListBase.filter((reservation) =>
        isReservationCreator(reservation, currentUser?.id ?? "")
      ),
    [reservationListBase, currentUser?.id]
  );

  const reservationsListItems = useMemo(
    () => (reservationsScope === "mine" ? myCreatedReservationList : reservationListBase),
    [reservationsScope, myCreatedReservationList, reservationListBase]
  );

  const historySourceReservations = useMemo(() => {
    const merged = new Map<string, Reservation>();

    historyApiReservations.forEach((reservation) => {
      const resolvedGroupName =
        isReservationGroupScoped(reservation) && reservation.groupId && groupNameById[reservation.groupId]
          ? groupNameById[reservation.groupId]
          : reservation.groupName;
      merged.set(reservation.id, {
        ...reservation,
        groupName: resolvedGroupName
      });
    });

    reservationsWithGroupContext.forEach((reservation) => {
      merged.set(reservation.id, reservation);
    });

    return Array.from(merged.values());
  }, [historyApiReservations, reservationsWithGroupContext, groupNameById]);

  const historyBase = useMemo(() => {
    if (!currentUser) {
      return [];
    }
    return historySourceReservations
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
  }, [historySourceReservations, currentUser, activeGroupScope]);

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

  useEffect(() => {
    if (calendarStartIndex <= calendarMaxStartIndex) {
      return;
    }
    setCalendarStartIndex(calendarMaxStartIndex);
  }, [calendarStartIndex, calendarMaxStartIndex]);

  useEffect(() => {
    setReservationsScope("all");
    setUpcomingView("list");
    setCalendarStartIndex(0);
    setShowAllUpcoming(false);
    setActiveGroupScope("all");
    setHistoryExpanded(false);
    setHistoryStatuses(["confirmed", "maybe", "cancelled"]);
    setHistoryRange("all");
    setHistoryPlayerFilter("all");
    setHistoryCourtFilter("all");
  }, [currentUser?.id]);

  useEffect(() => {
    if (!expandedReservationId || reservationsLoading) {
      return;
    }
    if (!selectedReservation) {
      setExpandedReservationId(null);
      if (window.location.pathname.match(/^\/r\/([a-zA-Z0-9-]+)$/)) {
        window.history.replaceState({}, "", "/");
      }
      setToastMessage("No encontramos ese partido o ya no tenés acceso.");
    }
  }, [expandedReservationId, reservationsLoading, selectedReservation, setExpandedReservationId]);

  useEffect(() => {
    setHistoryApiReservations([]);
    setHistoryApiLoaded(false);
    setHistoryLoading(false);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser || !historyExpanded || historyLoading || historyApiLoaded) {
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    listMyReservationHistory(300)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setHistoryApiReservations(items);
        setHistoryApiLoaded(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setHistoryApiLoaded(true);
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, historyExpanded, historyApiLoaded, historyLoading]);

  // 6. Actions (loginGoogle and handleLogout from useFirebaseAuth hook)

  const handleCreate = async (payload: any) => {
    if (!currentUser) return;
    try {
      setBusy(true);
      await createReservation(payload, currentUser);
      setShowCreateForm(false);
      setActiveTab("mis-reservas");
      setToastMessage("Reserva creada.");
    } catch (error) {
      notifyError(error, "No se pudo crear la reserva.");
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
      notifyError(error, "No se pudo eliminar la reserva.");
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
      notifyError(error, "No se pudo modificar la reserva.");
    } finally {
      setBusy(false);
    }
  };

  const handleLoadGroupAudit = async (groupId: string, limit = 30) => listGroupAuditEvents(groupId, limit);

  const handleReassignReservationCreator = async (
    reservationId: string,
    targetAuthUid: string,
    targetName: string
  ) => {
    if (!currentUser) return;
    try {
      setBusy(true);
      await reassignReservationCreator(reservationId, targetAuthUid, targetName, currentUser);
      triggerHaptic("medium");
      setToastMessage("Creador de reserva actualizado.");
    } catch (error) {
      notifyError(error, "No se pudo reasignar el creador.");
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

  const handleSetAttendanceStatus = async (reservationId: string, status: AttendanceStatus) => {
    if (!currentUser) {
      return;
    }
    setAttendanceOverrides((previous) => ({ ...previous, [reservationId]: status }));
    try {
      await setAttendanceStatus(reservationId, currentUser, status);
    } catch (error) {
      setAttendanceOverrides((previous) => {
        const next = { ...previous };
        delete next[reservationId];
        return next;
      });
      throw error;
    }
  };

  const handleUpdatePushPreferences = async (update: { pushEnabled?: boolean; notifications?: Record<string, boolean> }) => {
    updatePushPreferences(update);
  };

  const openCreateReservationFromEmpty = () => {
    triggerHaptic("light");
    setActiveTab("mis-reservas");
    setShowCreateForm(true);
  };

  const renderReservationList = (
    title: string,
    items: Reservation[],
    emptyText: string,
    groupByDate = false,
    emptyAction?: { label: string; onClick: () => void }
  ) => {
    const isActiveReservationsWidget = title.toLowerCase().includes("reservas activas");

    return (
      <section className={`panel glass-panel-elite animate-fade-in ${isActiveReservationsWidget ? "active-reservations-widget" : ""}`}>
        <div className="reservation-list-head">
          <h2 className="section-title">{title}</h2>
          {isActiveReservationsWidget ? (
            <span className="reservation-list-total-chip">{items.length} activas</span>
          ) : null}
        </div>
        {isActiveReservationsWidget ? (
          <div className="section-group-filter">
            <span className="section-filter-label">Filtrar por grupo</span>
            <div className="quick-chip-row quick-chip-row-tight">
              <button
                type="button"
                className={`quick-chip ${activeGroupScope === "all" ? "active" : ""}`}
                onClick={() => setActiveGroupScope("all")}
              >
                Todos
              </button>
              {groups.map((group) => (
                <button
                  key={`reservations-scope-${group.id}`}
                  type="button"
                  className={`quick-chip ${activeGroupScope === group.id ? "active" : ""}`}
                  onClick={() => setActiveGroupScope(group.id)}
                >
                  {group.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="list">
          {reservationsLoading ? (
            <><ReservationSkeleton /><ReservationSkeleton /><ReservationSkeleton /></>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-illustration">🎾</div>
              <p>{emptyText}</p>
              {emptyAction ? (
                <div className="empty-state-actions">
                  <button type="button" className="quick-chip action-chip active" onClick={emptyAction.onClick}>
                    {emptyAction.label}
                  </button>
                </div>
              ) : null}
            </div>
          ) : groupByDate ? (
            (["hoy", "manana", "esta-semana", "mas-adelante"] as const).map(g => {
              const groupItems = items.filter(r => getReservationDateGroup(r.startDateTime) === g);
              if (!groupItems.length) return null;
              return (
                <section key={g} className="group-block">
                  <h3 className="group-title">
                    <span>{GROUP_LABELS[g]}</span>
                  </h3>
                  <div className="group-list">
                    {groupItems.map(r => (
                      <ReservationCard
                        key={r.id}
                        reservation={r}
                        currentUser={currentUser!}
                        attendanceStatusOverride={attendanceOverrides[r.id]}
                        onOpen={setExpandedReservationId}
                        isExpanded={expandedReservationId === r.id}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            items.map(r => (
              <ReservationCard
                key={r.id}
                reservation={r}
                currentUser={currentUser!}
                attendanceStatusOverride={attendanceOverrides[r.id]}
                onOpen={setExpandedReservationId}
                isExpanded={expandedReservationId === r.id}
              />
            ))
          )}
        </div>
      </section>
    );
  };

  const gatedContent = authLoading ? (
    <main className="app mobile-shell">
      <section className="panel" style={{ padding: "4rem 2rem", background: "transparent" }}>
        <ReservationSkeleton />
        <ReservationSkeleton />
      </section>
    </main>
  ) : !currentUser ? (
    <AuthView onLoginWithGoogle={loginGoogle} busy={busy} error={authError} />
  ) : null;

  if (gatedContent) {
    return (
      <>
        <SplashScreen visible={showSplash} />
        {gatedContent}
      </>
    );
  }
  if (!currentUser) {
    return null;
  }

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

        {activeTab === "mis-partidos" && (
          <>
            {showIOSBanner && (
              <div className="ios-install-banner">
                <span className="ios-install-banner-text">
                  Agregá a pantalla de inicio para recibir notificaciones
                </span>
                <button
                  type="button"
                  className="ios-install-banner-close"
                  onClick={dismissIOSBanner}
                >
                  ✕
                </button>
              </div>
            )}

            <NotificationCenter
              notifications={inAppNotifications}
              onTapNotification={handleTapNotification}
              onMarkAllRead={markAllRead}
              onViewAll={markAllRead}
            />

            <section className={`panel glass-panel-elite animate-fade-in inbox-panel ${myPendingResponseCount === 0 ? "inbox-panel-empty" : ""}`}>
              <div className="inbox-heading">
                <h2 className="section-title">Nuevas reservas</h2>
                <span className={`upcoming-chip ${myPendingResponseCount > 0 ? "upcoming-chip-accent" : "upcoming-chip-muted"}`}>
                  {myPendingResponseCount} por responder
                </span>
              </div>
              {reservationsLoading ? (
                <div className="inbox-skeleton-list">
                  <ReservationSkeleton />
                  <ReservationSkeleton />
                </div>
              ) : myPendingResponseCount === 0 ? (
                <div className="inbox-empty-state">
                  <p className="private-hint inbox-empty-hint">No tenés reservas pendientes de respuesta.</p>
                  <button
                    type="button"
                    className="quick-chip action-chip"
                    onClick={() => {
                      triggerHaptic("light");
                      upcomingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Ver próximos partidos
                  </button>
                </div>
              ) : (
                <ul className="inbox-list">
                  {inboxPendingReservations.map((reservation) => {
                    const start = new Date(reservation.startDateTime);
                    const month = start.toLocaleDateString("es-AR", { month: "short" }).replace(".", "").toUpperCase();
                    const day = start.toLocaleDateString("es-AR", { day: "2-digit" });
                    const weekday = start
                      .toLocaleDateString("es-AR", { weekday: "short" })
                      .replace(".", "")
                      .toUpperCase();
                    const dayGroup = getReservationDateGroup(reservation.startDateTime);
                    const dayIndicator = dayGroup === "hoy" ? "HOY" : dayGroup === "manana" ? "MAÑANA" : weekday;
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
                      <li key={`inbox-${reservation.id}`}>
                        <button
                          type="button"
                          className={`upcoming-row upcoming-row-inbox ${isActive ? "active" : ""}`}
                          onClick={() => {
                            triggerHaptic("light");
                            setExpandedReservationId(isActive ? null : reservation.id);
                          }}
                        >
                          <div className="upcoming-date">
                            <span>{month}</span>
                            <strong className={isActive ? "upcoming-day-active" : ""}>{day}</strong>
                            <small className={`upcoming-day-indicator ${dayGroup === "hoy" || dayGroup === "manana" ? "is-soon" : ""}`}>
                              {dayIndicator}
                            </small>
                          </div>
                          <div className="upcoming-time-court">
                            <span className="upcoming-time">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                              <span>{time}</span>
                            </span>
                            <span className="upcoming-court">{reservation.courtName}</span>
                          </div>
                          <span className="upcoming-chip upcoming-chip-count">{confirmedCount}/4 jugando</span>
                          <div className="upcoming-chip-row">
                            {reservation.groupName ? (
                              <span className="upcoming-chip upcoming-chip-accent">{reservation.groupName}</span>
                            ) : (
                              <span className="upcoming-chip upcoming-chip-muted">Sin grupo</span>
                            )}
                            <span className="upcoming-chip upcoming-chip-accent inbox-respond-chip">Responder</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section ref={upcomingSectionRef} className="panel upcoming-widget glass-panel-elite animate-fade-in">
              <div className="upcoming-header">
                <h2 className="section-title">Próximos partidos</h2>
                <div className="quick-chip-row quick-chip-row-tight upcoming-view-switch">
                  <button
                    type="button"
                    className={`quick-chip ${upcomingView === "list" ? "active" : ""}`}
                    onClick={() => setUpcomingView("list")}
                  >
                    Lista
                  </button>
                  <button
                    type="button"
                    className={`quick-chip ${upcomingView === "week" ? "active" : ""}`}
                    onClick={() => setUpcomingView("week")}
                  >
                    Calendario
                  </button>
                </div>
              </div>
              {reservationsLoading ? (
                <div className="upcoming-skeleton-list">
                  <ReservationSkeleton />
                  <ReservationSkeleton />
                  <ReservationSkeleton />
                </div>
              ) : upcomingByScope.length === 0 ? (
                <div className="empty-state empty-state-inline">
                  <p>No hay próximos partidos en tu alcance actual.</p>
                  <div className="empty-state-actions">
                    <button
                      type="button"
                      className="quick-chip action-chip active"
                      onClick={openCreateReservationFromEmpty}
                    >
                      + Crear reserva
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {upcomingView === "list" ? (
                    <>
                      <ul className="upcoming-list">
                        {visibleUpcoming.map((reservation) => {
                          const start = new Date(reservation.startDateTime);
                          const month = start.toLocaleDateString("es-AR", { month: "short" }).replace(".", "").toUpperCase();
                          const day = start.toLocaleDateString("es-AR", { day: "2-digit" });
                          const weekday = start
                            .toLocaleDateString("es-AR", { weekday: "short" })
                            .replace(".", "")
                            .toUpperCase();
                          const dayGroup = getReservationDateGroup(reservation.startDateTime);
                          const dayIndicator = dayGroup === "hoy" ? "HOY" : dayGroup === "manana" ? "MAÑANA" : weekday;
                          const time = start.toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false
                          });
                          const confirmedCount = reservation.signups.filter(
                            (signup) => signup.attendanceStatus === "confirmed"
                          ).length;
                          const attendanceMeta = getUpcomingAttendanceMeta(reservation);
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
                                  <small className={`upcoming-day-indicator ${dayGroup === "hoy" || dayGroup === "manana" ? "is-soon" : ""}`}>
                                    {dayIndicator}
                                  </small>
                                </div>
                                <div className="upcoming-time-court">
                                  <span className="upcoming-time">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                                    <span>{time}</span>
                                  </span>
                                  <span className="upcoming-court">{reservation.courtName}</span>
                                </div>
                                <span className="upcoming-chip upcoming-chip-count">{confirmedCount}/4 jugando</span>
                                <div className="upcoming-chip-row">
                                  {reservation.groupName ? (
                                    <span className="upcoming-chip upcoming-chip-accent">{reservation.groupName}</span>
                                  ) : (
                                    <span className="upcoming-chip upcoming-chip-muted">Sin grupo</span>
                                  )}
                                  <span className={`badge badge-mine badge-elevated ${attendanceMeta.badgeClass} upcoming-status-badge`}>
                                    {attendanceMeta.label}
                                  </span>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {upcomingByScope.length > 3 ? (
                        <button className="btn-elite btn-elite-outline upcoming-more-btn" onClick={() => setShowAllUpcoming(!showAllUpcoming)}>
                          {showAllUpcoming ? "Ver menos" : "Ver más"}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="upcoming-calendar-nav">
                        <button
                          type="button"
                          className="btn-elite btn-elite-outline upcoming-nav-btn"
                          onClick={() => {
                            triggerHaptic("light");
                            setCalendarStartIndex(Math.max(0, calendarStartIndex - calendarWindowSize));
                          }}
                          disabled={calendarStartIndex === 0}
                        >
                          ←
                        </button>
                        <span className="upcoming-calendar-range">{calendarRangeLabel}</span>
                        <button
                          type="button"
                          className="btn-elite btn-elite-outline upcoming-nav-btn"
                          onClick={() => {
                            triggerHaptic("light");
                            setCalendarStartIndex(
                              Math.min(calendarMaxStartIndex, calendarStartIndex + calendarWindowSize)
                            );
                          }}
                          disabled={calendarStartIndex >= calendarMaxStartIndex}
                        >
                          →
                        </button>
                      </div>
                      <div className="upcoming-week-grid" role="list">
                        {upcomingWeekDays.map((daySlot, index) => {
                          const month = daySlot.date.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
                          const day = daySlot.date.toLocaleDateString("es-AR", { day: "2-digit" });
                          const isToday = calendarStartIndex + index === 0;
                          return (
                            <article
                              key={`week-${daySlot.key}`}
                              className={`upcoming-week-day ${isToday ? "is-today" : ""}`}
                              role="listitem"
                            >
                              <div className="upcoming-week-date">
                                <span>{month.toUpperCase()}</span>
                                <strong>{day}</strong>
                              </div>
                              {daySlot.reservations.length === 0 ? (
                                <p className="upcoming-week-empty">Sin partidos</p>
                              ) : (
                                <div className="upcoming-week-events">
                                  {daySlot.reservations.slice(0, 5).map((reservation) => {
                                    const start = new Date(reservation.startDateTime);
                                    const time = start.toLocaleTimeString("es-AR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false
                                    });
                                    const attendanceMeta = getUpcomingAttendanceMeta(reservation);
                                    return (
                                      <button
                                        key={`week-event-${reservation.id}`}
                                        type="button"
                                        className="upcoming-week-event"
                                        onClick={() => {
                                          triggerHaptic("light");
                                          setExpandedReservationId(reservation.id);
                                        }}
                                      >
                                        <span className="upcoming-week-time">{time}</span>
                                        <span
                                          className={`upcoming-week-status-dot upcoming-week-status-dot-${attendanceMeta.statusTone}`}
                                          aria-label={attendanceMeta.label}
                                          title={attendanceMeta.label}
                                        />
                                      </button>
                                    );
                                  })}
                                  {daySlot.reservations.length > 5 ? (
                                    <span className="upcoming-week-more">+{daySlot.reservations.length - 5}</span>
                                  ) : null}
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="section-group-filter section-group-filter-top-separator">
                <span className="section-filter-label">Filtrar por grupo</span>
                <div className="quick-chip-row quick-chip-row-tight">
                  <button
                    type="button"
                    className={`quick-chip ${activeGroupScope === "all" ? "active" : ""}`}
                    onClick={() => setActiveGroupScope("all")}
                  >
                    Todos
                  </button>
                  {groups.map((group) => (
                    <button
                      key={`upcoming-scope-${group.id}`}
                      type="button"
                      className={`quick-chip ${activeGroupScope === group.id ? "active" : ""}`}
                      onClick={() => setActiveGroupScope(group.id)}
                    >
                      {group.name}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <HistoryView
              historyExpanded={historyExpanded}
              setHistoryExpanded={setHistoryExpanded}
              historyLoading={historyLoading}
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
                <div className="reservations-toolbar">
                  <button className="btn-elite btn-elite-accent btn-block" onClick={() => setShowCreateForm(true)} disabled={busy}>
                    + Reservá un partido
                  </button>
                </div>
                <div className="quick-chip-row quick-chip-row-tight">
                  <button
                    type="button"
                    className={`quick-chip ${reservationsScope === "all" ? "active" : ""}`}
                    onClick={() => setReservationsScope("all")}
                  >
                    Todas ({reservationListBase.length})
                  </button>
                  <button
                    type="button"
                    className={`quick-chip ${reservationsScope === "mine" ? "active" : ""}`}
                    onClick={() => setReservationsScope("mine")}
                  >
                    Mis reservas ({myCreatedReservationList.length})
                  </button>
                </div>
                {groups.length === 0 ? <p className="private-hint">Podés reservar en modo solo link o crear/unirte a un grupo.</p> : null}
              </section>
            )}
            {renderReservationList(
              reservationsScope === "all" ? "Reservas activas" : "Mis reservas activas",
              reservationsListItems,
              reservationsScope === "all"
                ? "No hay reservas próximas en tu alcance actual."
                : "Todavía no creaste reservas próximas.",
              true,
              {
                label: "+ Crear reserva",
                onClick: openCreateReservationFromEmpty
              }
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
            onLoadGroupAudit={handleLoadGroupAudit}
            onLogout={handleLogout}
            onRequestNotifications={doRegisterPush}
            onUpdateDisplayName={handleUpdateDisplayName}
            onFeedback={setToastMessage}
            busy={busy}
            pushPreferences={pushPrefs}
            onUpdatePushPreferences={handleUpdatePushPreferences}
            isPushGranted={pushGranted}
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
          <section className="sheet sheet-detail" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" /><div className="sheet-head"><h3>Partido</h3><button className="sheet-close" onClick={() => setExpandedReservationId(null)}>Cerrar</button></div>
            <ReservationDetail
              reservation={selectedReservation} currentUser={currentUser} appUrl={shareBaseUrl}
              groups={groups}
              signupNameByAuthUid={signupNameByAuthUid}
              attendanceStatusOverride={attendanceOverrides[selectedReservation.id]}
              onSetAttendanceStatus={handleSetAttendanceStatus}
              onCancel={handleCancelReservation}
              onCreateGuestInvite={handleCreateGuestInviteLink}
              onReassignCreator={handleReassignReservationCreator}
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
