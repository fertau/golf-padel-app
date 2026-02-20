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

  const handleSetAttendance = async (status: AttendanceStatus) => {
    try {
      await onSetAttendanceStatus(reservation.id, status);
      triggerHaptic("light");
    } catch (error) {
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

  const share = async () => {
    triggerHaptic("light");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Reserva de padel", text: message });
        onFeedback("Compartido.");
        return;
      } catch (e) {
        // Fallback
      }
    }
    const copied = await copyTextWithFallback(message);
    if (copied) {
      onFeedback("Mensaje copiado.");
    } else {
      window.prompt("Copiá el mensaje manualmente:", message);
      onFeedback("Copiá el mensaje manualmente.");
    }
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

  useEffect(() => {
    setEditCourtName(reservation.courtName);
    setEditStartDateTime(reservation.startDateTime.slice(0, 16));
    setEditDuration(reservation.durationMinutes);
    setEditVisibilityScope(reservation.visibilityScope === "group" ? "group" : "link_only");
    setEditGroupId(reservation.visibilityScope === "group" && reservation.groupId !== "default-group" ? reservation.groupId : "");
    setReassignTargetAuthUid("");
  }, [reservation.id, reservation.courtName, reservation.startDateTime, reservation.durationMinutes, reservation.visibilityScope, reservation.groupId]);

  const confirmed = getSignupsByStatus(reservation, "confirmed");
  const maybe = getSignupsByStatus(reservation, "maybe");
  const cancelled = getSignupsByStatus(reservation, "cancelled");
  const myAttendance = getUserAttendance(reservation, currentUser.id);

  const formatCompactDate = (iso: string): string => {
    const date = new Date(iso);
    const dd = `${date.getDate()}`.padStart(2, "0");
    const mm = `${date.getMonth() + 1}`.padStart(2, "0");
    const hh = `${date.getHours()}`.padStart(2, "0");
    const min = `${date.getMinutes()}`.padStart(2, "0");
    return `${dd}/${mm} a las ${hh}:${min}`;
  };

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

  const inviteGuest = async (channel: "whatsapp" | "email" | "link") => {
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
      } else if (channel === "email") {
        const emailTo = window.prompt("Email del invitado (opcional):", "")?.trim() ?? "";
        const subject = encodeURIComponent("Invitación a partido de pádel");
        const recipient = encodeURIComponent(emailTo);
        window.open(`mailto:${recipient}?subject=${subject}&body=${encodedMessage}`, "_self");
        onFeedback("Abriendo email...");
      } else {
        const copied = await copyTextWithFallback(inviteLink);
        if (copied) {
          onFeedback("Link copiado.");
        } else {
          window.prompt("Copiá el link manualmente:", inviteLink);
          onFeedback("Copiá el link manualmente.");
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

  const renderPlayerList = (list: Signup[], label: string, isOpen = false) => (
    <details className="player-collapse-elite" open={isOpen}>
      <summary>
        <div className="summary-content">
          <span>{label}</span>
          <div className="summary-badge">{list.length}</div>
        </div>
      </summary>
      <div className="player-list-elite">
        {list.length === 0 ? <p className="empty-state-list">Sin registros aún.</p> : null}
        {list.map((signup, index) => (
          <div key={signup.id} className="player-row-elite">
            <div className="player-avatar-mini">{formatSignupName(signup).charAt(0).toUpperCase()}</div>
            <span className="player-name">{formatSignupName(signup)}</span>
            {index === 0 && label === "Juego" && <span className="host-label">Organizador</span>}
          </div>
        ))}
      </div>
    </details>
  );

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
        {reservation.status === "cancelled" ? (
          <p className="reservation-status-pill cancelled">Cancelada</p>
        ) : null}
        {reservation.groupName ? <p className="private-hint">{reservation.groupName}</p> : null}
        {!reservation.groupName ? <p className="private-hint">Solo por link</p> : null}
        {reservation.venueName ? (
          <p className="private-hint">
            {reservation.venueName}
            {reservation.venueAddress ? ` · ${reservation.venueAddress}` : ""}
          </p>
        ) : null}
      </header>

      <div className="hero-stats-grid">
        <div className="hero-stat-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          <div className="stat-info"><strong>{confirmed.length}</strong><span>Juego</span></div>
        </div>
        <div className="hero-stat-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          <div className="stat-info"><strong>{reservation.durationMinutes}m</strong><span>Duración</span></div>
        </div>
      </div>

      {reservation.status !== "cancelled" ? (
        <section className="attendance-section-elite animate-fade-in">
          <h3>Tu asistencia</h3>
          <div className="segmented-control-elite">
            <button
              className={`elite-choice confirmed ${myAttendance?.attendanceStatus === "confirmed" ? "active" : ""}`}
              onClick={() => {
                void handleSetAttendance("confirmed");
              }}
            >
              Juego
            </button>
            <button
              className={`elite-choice maybe ${myAttendance?.attendanceStatus === "maybe" ? "active" : ""}`}
              onClick={() => {
                void handleSetAttendance("maybe");
              }}
              disabled={!myAttendance && !eligibility.ok}
            >
              Quizás
            </button>
            <button
              className={`elite-choice cancelled ${myAttendance?.attendanceStatus === "cancelled" ? "active" : ""}`}
              onClick={() => {
                void handleSetAttendance("cancelled");
              }}
            >
              No juego
            </button>
          </div>
          {!eligibility.ok && !myAttendance && eligibility.reason !== "La reserva está cancelada" ? (
            <p className="eligibility-warning animate-fade-in eligibility-warning-centered">
              {eligibility.reason}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="players-section-elite glass-panel-elite animate-fade-in players-section-compact">
        {renderPlayerList(confirmed, "Juego", true)}
        {renderPlayerList(maybe, "Quizás")}
        {renderPlayerList(cancelled, "No juego")}
      </div>

      <div className="actions-section-elite animate-fade-in">
        <button className="btn-secondary-elite" onClick={openGoogleCalendar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          Google Calendar
        </button>

        {canManageReservation && (
          <div className="creator-actions-elite compact">
            <button className="btn-secondary-elite" onClick={openWhatsApp}>
              Compartir por WhatsApp
            </button>
            <details className="action-menu-elite">
              <summary>Más acciones</summary>
              <div className="action-menu-content">
                {isCreator ? (
                  <>
                    <button className="btn-secondary-elite" onClick={() => inviteGuest("whatsapp")} disabled={guestInviteBusy}>
                      {guestInviteBusy ? "Generando..." : "Invitar externo WA"}
                    </button>
                    <button className="btn-secondary-elite" onClick={() => inviteGuest("email")} disabled={guestInviteBusy}>
                      Invitar externo por email
                    </button>
                    <button className="btn-secondary-elite" onClick={() => inviteGuest("link")} disabled={guestInviteBusy}>
                      Copiar link externo
                    </button>
                  </>
                ) : null}
                <button className="btn-secondary-elite" onClick={share}>
                  Compartir (sistema)
                </button>
                <button className="btn-outline-danger-elite" onClick={() => setEditing(!editing)}>
                  {editing ? "Cerrar edición" : "Modificar reserva"}
                </button>
                <button className="btn-link-danger-elite" onClick={confirmCancelReservation}>
                  Eliminar reserva
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
    </div>
  );
}
