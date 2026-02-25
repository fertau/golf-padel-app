import { useEffect, useState } from "react";
import type { AttendanceStatus, Group, Reservation, User, Signup } from "../lib/types";
import {
  buildWhatsAppMessage,
  canJoinReservation,
  copyTextWithFallback,
  getSignupsByStatus,
  getUserAttendance,
  isGenericDisplayName,
  isReservationCreator,
  triggerHaptic
} from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  groups: Group[];
  appUrl: string;
  signupNameByAuthUid: Record<string, string>;
  onSetAttendanceStatus: (reservationId: string, status: AttendanceStatus) => Promise<void>;
  onCancel: (reservationId: string) => Promise<void>;
  onCreateGuestInvite: (
    reservationId: string,
    channel?: "whatsapp" | "email" | "link"
  ) => Promise<string>;
  onReassignCreator: (reservationId: string, targetAuthUid: string, targetName: string) => Promise<void>;
  onFeedback: (message: string) => void;
  onUpdateReservation: (
    reservationId: string,
    updates: {
      courtName: string;
      startDateTime: string;
      durationMinutes: number;
      groupId?: string;
      groupName?: string;
      visibilityScope?: "group" | "link_only";
    }
  ) => void;
};

export default function ReservationDetail({
  reservation,
  currentUser,
  groups,
  appUrl,
  signupNameByAuthUid,
  onSetAttendanceStatus,
  onCancel,
  onCreateGuestInvite,
  onReassignCreator,
  onFeedback,
  onUpdateReservation
}: Props) {
  const toIcsDate = (date: Date): string => {
    const pad = (value: number) => `${value}`.padStart(2, "0");
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  };

  const startDate = new Date(reservation.startDateTime);
  const endDate = new Date(startDate.getTime() + reservation.durationMinutes * 60 * 1000);
  const reservationUrl = `${appUrl}/r/${reservation.id}`;
  const message = buildWhatsAppMessage(reservation, appUrl);
  const creatorAuthUid = reservation.createdByAuthUid || reservation.createdBy.id;
  const locationLabel = reservation.venueAddress || reservation.venueName || reservation.courtName;

  const handleSetAttendance = async (status: AttendanceStatus) => {
    setPendingAttendanceStatus(status);
    try {
      await onSetAttendanceStatus(reservation.id, status);
      triggerHaptic("light");
    } catch (error) {
      setPendingAttendanceStatus(null);
      onFeedback((error as Error).message || "No se pudo actualizar la asistencia.");
    }
  };

  const openGoogleCalendar = () => {
    triggerHaptic("light");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `Pádel - ${reservation.courtName}`,
      dates: `${toIcsDate(startDate)}/${toIcsDate(endDate)}`,
      location: reservation.venueAddress || reservation.venueName || reservation.courtName,
      details: `Reserva creada por ${reservation.createdBy.name}. ${reservationUrl}`
    });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  const openWhatsApp = () => {
    triggerHaptic("light");
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank", "noopener,noreferrer");
  };

  const openMaps = () => {
    triggerHaptic("light");
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLabel)}`;
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  };

  const isCreator = isReservationCreator(reservation, currentUser.id);
  const reservationGroup =
    reservation.groupId && reservation.groupId !== "default-group"
      ? groups.find((group) => group.id === reservation.groupId) ?? null
      : null;
  const isGroupAdminForReservation = Boolean(
    reservationGroup &&
      (reservationGroup.ownerAuthUid === currentUser.id || reservationGroup.adminAuthUids.includes(currentUser.id))
  );
  const canManageReservation = isCreator || isGroupAdminForReservation;
  const currentCreatorAuthUid = reservation.createdByAuthUid || reservation.createdBy.id;
  const reassignCandidates = reservationGroup
    ? reservationGroup.memberAuthUids
        .filter((authUid) => authUid !== currentCreatorAuthUid)
        .map((authUid) => ({
          authUid,
          name:
            reservationGroup.memberNamesByAuthUid[authUid] ??
            signupNameByAuthUid[authUid] ??
            `Jugador #${authUid.slice(-4).toUpperCase()}`
        }))
    : [];
  const [guestInviteBusy, setGuestInviteBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reassignTargetAuthUid, setReassignTargetAuthUid] = useState("");
  const [reassignBusy, setReassignBusy] = useState(false);
  const [editCourtName, setEditCourtName] = useState(reservation.courtName);
  const [editStartDateTime, setEditStartDateTime] = useState(reservation.startDateTime.slice(0, 16));
  const [editDuration, setEditDuration] = useState(reservation.durationMinutes);
  const [editVisibilityScope, setEditVisibilityScope] = useState<"group" | "link_only">(
    reservation.visibilityScope === "group" ? "group" : "link_only"
  );
  const [editGroupId, setEditGroupId] = useState(
    reservation.visibilityScope === "group" && reservation.groupId !== "default-group" ? reservation.groupId : ""
  );
  const [pendingAttendanceStatus, setPendingAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [activeRoster, setActiveRoster] = useState<AttendanceStatus>("confirmed");

  useEffect(() => {
    setEditCourtName(reservation.courtName);
    setEditStartDateTime(reservation.startDateTime.slice(0, 16));
    setEditDuration(reservation.durationMinutes);
    setEditVisibilityScope(reservation.visibilityScope === "group" ? "group" : "link_only");
    setEditGroupId(reservation.visibilityScope === "group" && reservation.groupId !== "default-group" ? reservation.groupId : "");
    setReassignTargetAuthUid("");
    setPendingAttendanceStatus(null);
    setActiveRoster("confirmed");
  }, [reservation.id, reservation.courtName, reservation.startDateTime, reservation.durationMinutes, reservation.visibilityScope, reservation.groupId]);

  const confirmed = getSignupsByStatus(reservation, "confirmed");
  const maybe = getSignupsByStatus(reservation, "maybe");
  const cancelled = getSignupsByStatus(reservation, "cancelled");
  const myAttendance = getUserAttendance(reservation, currentUser.id);
  const myAttendanceStatus = myAttendance?.attendanceStatus;
  const effectiveAttendanceStatus = pendingAttendanceStatus ?? myAttendanceStatus;

  useEffect(() => {
    if (!pendingAttendanceStatus) {
      return;
    }
    if (myAttendanceStatus === pendingAttendanceStatus) {
      setPendingAttendanceStatus(null);
    }
  }, [myAttendanceStatus, pendingAttendanceStatus]);

  const formatCompactDate = (iso: string): string => {
    const date = new Date(iso);
    const dd = `${date.getDate()}`.padStart(2, "0");
    const mm = `${date.getMonth() + 1}`.padStart(2, "0");
    const hh = `${date.getHours()}`.padStart(2, "0");
    const min = `${date.getMinutes()}`.padStart(2, "0");
    return `${dd}/${mm} a las ${hh}:${min}`;
  };
  const formattedDate = startDate.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  });
  const formattedTime = startDate.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const eligibility = canJoinReservation(reservation, currentUser);

  const submitEdit = () => {
    const selectedGroup = groups.find((group) => group.id === editGroupId) ?? null;
    if (editVisibilityScope === "group" && !selectedGroup) {
      onFeedback("Seleccioná un grupo para esta reserva.");
      return;
    }
    onUpdateReservation(reservation.id, {
      courtName: editCourtName,
      startDateTime: editStartDateTime,
      durationMinutes: editDuration,
      visibilityScope: editVisibilityScope,
      groupId: editVisibilityScope === "group" ? selectedGroup?.id : undefined,
      groupName: editVisibilityScope === "group" ? selectedGroup?.name : undefined
    });
    setEditing(false);
    triggerHaptic("medium");
  };

  const inviteGuest = async (channel: "whatsapp" | "link") => {
    try {
      setGuestInviteBusy(true);
      const inviteLink = await onCreateGuestInvite(reservation.id, channel);
      const guestMessage = [
        "🎾 Invitación puntual a partido",
        buildWhatsAppMessage(reservation, appUrl, inviteLink),
        "Este acceso es solo para este partido (sin unirte al grupo)."
      ].join("\n\n");
      const encodedMessage = encodeURIComponent(guestMessage);
      if (channel === "whatsapp") {
        window.open(`https://wa.me/?text=${encodedMessage}`, "_blank", "noopener,noreferrer");
        onFeedback("Abriendo WhatsApp...");
      } else {
        const copied = await copyTextWithFallback(guestMessage);
        if (copied) {
          onFeedback("Invitación copiada.");
        } else {
          window.prompt("Copiá la invitación manualmente:", guestMessage);
          onFeedback("Copiá la invitación manualmente.");
        }
      }
      triggerHaptic("medium");
    } catch (error) {
      onFeedback((error as Error).message || "No se pudo compartir la invitación.");
    } finally {
      setGuestInviteBusy(false);
    }
  };

  const confirmCancelReservation = async () => {
    const confirmedAction = window.confirm("¿Querés eliminar esta reserva?");
    if (!confirmedAction) {
      return;
    }
    await onCancel(reservation.id);
  };

  const submitReassignCreator = async () => {
    if (!reassignTargetAuthUid) {
      onFeedback("Seleccioná un miembro para reasignar el creador.");
      return;
    }
    const target = reassignCandidates.find((candidate) => candidate.authUid === reassignTargetAuthUid);
    if (!target) {
      onFeedback("Seleccioná un miembro válido.");
      return;
    }
    try {
      setReassignBusy(true);
      await onReassignCreator(reservation.id, target.authUid, target.name);
      setReassignTargetAuthUid("");
    } catch (error) {
      onFeedback((error as Error).message || "No se pudo reasignar el creador.");
    } finally {
      setReassignBusy(false);
    }
  };

  const formatSignupName = (signup: Signup): string => {
    if (!isGenericDisplayName(signup.userName)) {
      return signup.userName;
    }
    if (signup.authUid && signupNameByAuthUid[signup.authUid]) {
      return signupNameByAuthUid[signup.authUid];
    }
    const suffixSource = signup.authUid || signup.userId || signup.id;
    return `Jugador #${suffixSource.slice(-4).toUpperCase()}`;
  };

  return (
    <div className="reservation-hero-view">
      <header className="hero-header">
        <div className="hero-badge">{reservation.durationMinutes} min</div>
        <h1>{reservation.courtName}</h1>
        <p className="hero-subtitle">{formatCompactDate(reservation.startDateTime)}</p>
        <div className="hero-meta-chips">
          <span className="hero-meta-chip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            <span>{formattedDate.replace(".", "").toUpperCase()}</span>
          </span>
          <span className="hero-meta-chip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
            <span>{formattedTime}</span>
          </span>
          {reservation.groupName ? <span className="hero-meta-chip hero-meta-chip-accent">{reservation.groupName}</span> : null}
          {reservation.venueName ? <span className="hero-meta-chip">{reservation.venueName}</span> : null}
          {!reservation.groupName ? <span className="hero-meta-chip">Solo por link</span> : null}
        </div>
        <div className="hero-location-row">
          <p className="hero-location">{locationLabel}</p>
          <button type="button" className="icon-action-btn" onClick={openMaps} title="Cómo llegar" aria-label="Cómo llegar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" />
              <circle cx="12" cy="10" r="2.4" />
            </svg>
          </button>
        </div>
        {reservation.status === "cancelled" ? (
          <p className="reservation-status-pill cancelled">Cancelada</p>
        ) : null}
      </header>

      {reservation.status !== "cancelled" ? (
        <section className="attendance-section-elite animate-fade-in">
          <h3>Tu asistencia</h3>
          <div className="segmented-control-elite">
            <button
              className={`elite-choice confirmed ${effectiveAttendanceStatus === "confirmed" ? "active" : ""}`}
              onClick={() => {
                void handleSetAttendance("confirmed");
              }}
            >
              Juego
            </button>
            <button
              className={`elite-choice maybe ${effectiveAttendanceStatus === "maybe" ? "active" : ""}`}
              onClick={() => {
                void handleSetAttendance("maybe");
              }}
              disabled={!myAttendance && !eligibility.ok}
            >
              Quizás
            </button>
            <button
              className={`elite-choice cancelled ${effectiveAttendanceStatus === "cancelled" ? "active" : ""}`}
              onClick={() => {
                void handleSetAttendance("cancelled");
              }}
            >
              No juego
            </button>
          </div>
          {pendingAttendanceStatus ? <p className="private-hint">Guardando asistencia...</p> : null}
          {!eligibility.ok && !myAttendance && eligibility.reason !== "La reserva está cancelada" ? (
            <p className="eligibility-warning animate-fade-in eligibility-warning-centered">
              {eligibility.reason}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="attendance-summary-section glass-panel-elite animate-fade-in">
        <div className="attendance-summary-grid">
          <button
            type="button"
            className={`attendance-summary-card ${activeRoster === "confirmed" ? "active confirmed" : ""}`}
            onClick={() => setActiveRoster("confirmed")}
          >
            <strong>{confirmed.length}</strong>
            <span>JUEGO</span>
          </button>
          <button
            type="button"
            className={`attendance-summary-card ${activeRoster === "maybe" ? "active maybe" : ""}`}
            onClick={() => setActiveRoster("maybe")}
          >
            <strong>{maybe.length}</strong>
            <span>QUIZÁS</span>
          </button>
          <button
            type="button"
            className={`attendance-summary-card ${activeRoster === "cancelled" ? "active cancelled" : ""}`}
            onClick={() => setActiveRoster("cancelled")}
          >
            <strong>{cancelled.length}</strong>
            <span>NO JUEGO</span>
          </button>
        </div>
        <div className="players-section-elite players-section-compact">
          <div className="summary-content">
            <span>{activeRoster === "confirmed" ? "Juego" : activeRoster === "maybe" ? "Quizás" : "No juego"}</span>
            <div className="summary-badge">
              {activeRoster === "confirmed" ? confirmed.length : activeRoster === "maybe" ? maybe.length : cancelled.length}
            </div>
          </div>
          <div className="player-list-elite">
            {(activeRoster === "confirmed" ? confirmed : activeRoster === "maybe" ? maybe : cancelled).length === 0 ? (
              <p className="empty-state-list">Sin registros aún.</p>
            ) : null}
            {(activeRoster === "confirmed" ? confirmed : activeRoster === "maybe" ? maybe : cancelled).map((signup) => (
              <div key={signup.id} className="player-row-elite">
                <div className="player-avatar-mini">{formatSignupName(signup).charAt(0).toUpperCase()}</div>
                <span className="player-name">{formatSignupName(signup)}</span>
                {(signup.authUid || signup.userId) === creatorAuthUid ? <span className="host-label">Creador</span> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="actions-section-elite animate-fade-in">
        <div className="actions-primary-row">
          <button className="btn-secondary-elite" onClick={openGoogleCalendar}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            Google Calendar
          </button>
          <button className="btn-secondary-elite" onClick={openWhatsApp}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2Zm5.8 14.4c-.2.6-1.2 1.1-1.8 1.2s-1.2.2-4-.9a13.4 13.4 0 0 1-4.4-3.9 5 5 0 0 1-1.1-2.7c0-1.2.7-1.8 1-2.1.2-.2.5-.3.8-.3h.6c.2 0 .5-.1.7.5.2.7.8 2.4.9 2.6.1.2.1.4 0 .6s-.2.4-.4.6-.3.4-.5.6c-.2.2-.3.4-.1.7.2.3 1 1.7 2.2 2.8 1.5 1.3 2.7 1.7 3.1 1.9.3.2.5.1.7-.1.2-.2.8-.9 1-1.2.2-.4.4-.3.7-.2.3.1 2 .9 2.3 1 .3.2.6.2.7.4.1.3.1 1.3-.1 1.9Z"/>
            </svg>
            Compartir por WhatsApp
          </button>
        </div>

        {canManageReservation && (
          <div className="creator-actions-elite compact">
            {isCreator ? (
              <details className="action-menu-elite invite-menu-elite">
                <summary>Invitar fuera del grupo</summary>
                <div className="action-menu-content">
                  <button className="btn-secondary-elite" onClick={() => inviteGuest("whatsapp")} disabled={guestInviteBusy}>
                    {guestInviteBusy ? "Generando..." : "WhatsApp"}
                  </button>
                  <button className="btn-secondary-elite" onClick={() => inviteGuest("link")} disabled={guestInviteBusy}>
                    Copiar texto
                  </button>
                </div>
              </details>
            ) : null}
            <details className="action-menu-elite">
              <summary>{editing ? "Cerrar edición" : "Modificar reserva"}</summary>
              <div className="action-menu-content">
                <button className="btn-outline-danger-elite" onClick={() => setEditing(!editing)}>
                  {editing ? "Cerrar edición" : "Abrir edición"}
                </button>
              </div>
            </details>
          </div>
        )}
      </div>

      {isGroupAdminForReservation && reservationGroup && reassignCandidates.length > 0 ? (
        <div className="edit-pane-elite glass-panel-elite animate-fade-in edit-pane-with-top-gap">
          <label className="elite-field-label">
            Reasignar creador
            <select
              className="select-elite"
              value={reassignTargetAuthUid}
              onChange={(event) => setReassignTargetAuthUid(event.target.value)}
              disabled={reassignBusy}
            >
              <option value="">Seleccionar miembro...</option>
              {reassignCandidates.map((candidate) => (
                <option key={candidate.authUid} value={candidate.authUid}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-elite btn-elite-outline btn-block"
            onClick={submitReassignCreator}
            disabled={reassignBusy || !reassignTargetAuthUid}
          >
            {reassignBusy ? "Reasignando..." : "Reasignar creador"}
          </button>
        </div>
      ) : null}

      {editing && (
        <div className="edit-pane-elite glass-panel-elite animate-fade-in edit-pane-with-top-gap">
          <label className="elite-field-label">Cancha
            <select className="select-elite" value={editCourtName} onChange={(e) => setEditCourtName(e.target.value)}>
              <option value="Cancha 1">Cancha 1</option><option value="Cancha 2">Cancha 2</option>
            </select>
          </label>
          <label className="elite-field-label">Fecha y hora
            <input className="input-elite" type="datetime-local" value={editStartDateTime} onChange={(e) => setEditStartDateTime(e.target.value)} />
          </label>
          <label className="elite-field-label">Duración
            <select className="select-elite" value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))}>
              <option value={60}>60m</option><option value={90}>90m</option><option value={120}>120m</option>
            </select>
          </label>
          <label className="elite-field-label">Alcance
            <select
              className="select-elite"
              value={editVisibilityScope}
              onChange={(e) => setEditVisibilityScope(e.target.value as "group" | "link_only")}
            >
              <option value="group">Por grupo</option>
              <option value="link_only">Solo por link</option>
            </select>
          </label>
          {editVisibilityScope === "group" ? (
            <label className="elite-field-label">Grupo
              <select className="select-elite" value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)}>
                <option value="">Seleccionar grupo...</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="private-hint">Solo podrán acceder por link (o invitados puntuales).</p>
          )}
          <button className="btn-elite btn-elite-accent btn-block" onClick={submitEdit}>Guardar cambios</button>
        </div>
      )}

      {canManageReservation ? (
        <button className="btn-link-danger-elite btn-delete-reservation" onClick={confirmCancelReservation}>
          Eliminar reserva
        </button>
      ) : null}
    </div>
  );
}
