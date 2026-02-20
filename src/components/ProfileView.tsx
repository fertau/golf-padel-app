import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Group, GroupAuditEvent, User } from "../lib/types";
import { copyTextWithFallback, isValidDisplayName, normalizeDisplayName, triggerHaptic } from "../lib/utils";

type Props = {
  user: User;
  groups: Group[];
  memberDirectory?: Record<string, string>;
  onCreateGroup: (name: string) => Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<void>;
  onCreateGroupInvite: (groupId: string, channel?: "whatsapp" | "email" | "link") => Promise<string>;
  onSetGroupMemberAdmin: (groupId: string, targetAuthUid: string, makeAdmin: boolean) => Promise<void>;
  onRemoveGroupMember: (groupId: string, targetAuthUid: string) => Promise<void>;
  onLeaveGroup: (groupId: string) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onLoadGroupAudit: (groupId: string, limit?: number) => Promise<GroupAuditEvent[]>;
  onLogout: () => void;
  onRequestNotifications: () => void;
  onUpdateDisplayName: (nextName: string) => Promise<void>;
  busy?: boolean;
};

const CardIcon = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`section-icon section-icon-svg ${className}`.trim()}>{children}</div>
);

export default function ProfileView({
  user,
  groups,
  memberDirectory,
  onCreateGroup,
  onRenameGroup,
  onCreateGroupInvite,
  onSetGroupMemberAdmin,
  onRemoveGroupMember,
  onLeaveGroup,
  onDeleteGroup,
  onLoadGroupAudit,
  onLogout,
  onRequestNotifications,
  onUpdateDisplayName,
  busy
}: Props) {
  const [nameDraft, setNameDraft] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [groupDraft, setGroupDraft] = useState("");
  const [showCreateGroupForm, setShowCreateGroupForm] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [inviteBusyGroupId, setInviteBusyGroupId] = useState<string | null>(null);
  const [roleBusyKey, setRoleBusyKey] = useState<string | null>(null);
  const [groupActionBusyId, setGroupActionBusyId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [auditByGroupId, setAuditByGroupId] = useState<Record<string, GroupAuditEvent[]>>({});
  const [auditLoadedByGroupId, setAuditLoadedByGroupId] = useState<Record<string, boolean>>({});
  const [auditLoadingGroupId, setAuditLoadingGroupId] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(user.name);
  }, [user.name]);

  const groupsWithRole = useMemo(
    () =>
      groups.map((group) => ({
        group,
        role: group.ownerAuthUid === user.id ? "owner" : group.adminAuthUids.includes(user.id) ? "admin" : "member"
      })),
    [groups, user.id]
  );

  const handleAction = (fn: () => void) => {
    fn();
    triggerHaptic("light");
  };

  const formatAuditMessage = (event: GroupAuditEvent) => {
    const actor = event.actorName || "Alguien";
    const target = event.targetName || "miembro";
    switch (event.type) {
      case "member_joined":
        return `${target} se unió al grupo`;
      case "member_removed":
        return `${actor} quitó a ${target}`;
      case "admin_granted":
        return `${actor} dio admin a ${target}`;
      case "admin_revoked":
        return `${actor} quitó admin a ${target}`;
      case "group_renamed":
        return `${actor} renombró el grupo`;
      case "reservation_owner_reassigned":
        return `${actor} reasignó creador a ${target}`;
      case "reservation_created":
        return `${actor} creó una reserva`;
      case "reservation_updated":
        return `${actor} editó una reserva`;
      case "reservation_cancelled":
        return `${actor} canceló una reserva`;
      default:
        return `${actor} hizo un cambio`;
    }
  };

  const formatAuditDate = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

  const loadGroupAudit = async (groupId: string, force = false) => {
    if (auditLoadingGroupId === groupId) {
      return;
    }
    if (!force && auditLoadedByGroupId[groupId]) {
      return;
    }
    try {
      setAuditLoadingGroupId(groupId);
      const events = await onLoadGroupAudit(groupId, 40);
      setAuditByGroupId((prev) => ({ ...prev, [groupId]: events }));
      setAuditLoadedByGroupId((prev) => ({ ...prev, [groupId]: true }));
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setAuditLoadingGroupId(null);
    }
  };

  const saveDisplayName = async () => {
    const normalized = normalizeDisplayName(nameDraft);
    if (!isValidDisplayName(normalized)) {
      alert("Ingresá un nombre válido (2-32 caracteres, no genérico).");
      return;
    }
    try {
      setSavingName(true);
      await onUpdateDisplayName(normalized);
      triggerHaptic("medium");
      alert("Nombre actualizado.");
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  const createGroup = async () => {
    if (groupDraft.trim().length < 2) {
      alert("Ingresá un nombre de grupo.");
      return;
    }
    try {
      setCreatingGroup(true);
      await onCreateGroup(groupDraft.trim());
      setGroupDraft("");
      setShowCreateGroupForm(false);
      triggerHaptic("medium");
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setCreatingGroup(false);
    }
  };

  const buildGroupInviteMessage = (groupName: string, link: string) =>
    `🎾 Te invito al grupo "${groupName}" en Padel App.\n\nUnite desde este link (vence en 7 días):\n${link}`;

  const shareGroupInvite = async (groupId: string, groupName: string, channel: "whatsapp" | "email" | "link") => {
    try {
      setInviteBusyGroupId(groupId);
      const link = await onCreateGroupInvite(groupId, channel);
      const message = buildGroupInviteMessage(groupName, link);
      const encoded = encodeURIComponent(message);
      const subject = encodeURIComponent(`Invitación a ${groupName} · Padel App`);

      if (channel === "whatsapp") {
        window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer");
      } else if (channel === "email") {
        const emailTo = window.prompt("Email del invitado (opcional):", "")?.trim() ?? "";
        const recipient = encodeURIComponent(emailTo);
        window.open(`mailto:${recipient}?subject=${subject}&body=${encoded}`, "_self");
      } else {
        const copied = await copyTextWithFallback(message);
        if (copied) {
          alert("Invitación copiada.");
        } else {
          window.prompt("Copiá la invitación manualmente:", message);
        }
      }
      triggerHaptic("medium");
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setInviteBusyGroupId(null);
    }
  };

  const toggleAdminRole = async (groupId: string, targetAuthUid: string, makeAdmin: boolean) => {
    const key = `${groupId}:${targetAuthUid}`;
    try {
      setRoleBusyKey(key);
      await onSetGroupMemberAdmin(groupId, targetAuthUid, makeAdmin);
      triggerHaptic("medium");
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setRoleBusyKey(null);
    }
  };

  const removeMember = async (groupId: string, targetAuthUid: string) => {
    const key = `${groupId}:${targetAuthUid}:remove`;
    try {
      setRoleBusyKey(key);
      await onRemoveGroupMember(groupId, targetAuthUid);
      triggerHaptic("medium");
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setRoleBusyKey(null);
    }
  };

  const leaveCurrentGroup = async (groupId: string) => {
    if (!window.confirm("¿Salir de este grupo?")) {
      return;
    }
    try {
      setGroupActionBusyId(groupId);
      await onLeaveGroup(groupId);
      triggerHaptic("medium");
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setGroupActionBusyId(null);
    }
  };

  const deleteCurrentGroup = async (groupId: string) => {
    if (!window.confirm("¿Eliminar este grupo? Las reservas quedarán en modo link.")) {
      return;
    }
    try {
      setGroupActionBusyId(groupId);
      await onDeleteGroup(groupId);
      triggerHaptic("heavy");
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setGroupActionBusyId(null);
    }
  };

  const startRenameGroup = (groupId: string, currentName: string) => {
    setEditingGroupId(groupId);
    setGroupNameDraft(currentName);
  };

  const confirmRenameGroup = async (groupId: string) => {
    try {
      await onRenameGroup(groupId, groupNameDraft);
      setEditingGroupId(null);
      setGroupNameDraft("");
      triggerHaptic("medium");
    } catch (error) {
      alert((error as Error).message);
    }
  };

  return (
    <div className="profile-view-elite">
      <header className="profile-hero-elite">
        <div className="profile-avatar-wrapper">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} />
          ) : (
            <div className="avatar-initials">{user.name.charAt(0).toUpperCase()}</div>
          )}
          <div className="avatar-status-badge" />
        </div>
        <h2>{user.name}</h2>
        <div className="profile-level-badge">Perfil de jugador</div>
      </header>

      <div className="profile-content-elite animate-fade-in">
        <section className="profile-section-elite glass-panel-elite">
          <CardIcon>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" />
            </svg>
          </CardIcon>
          <div className="section-info">
            <h3>Nombre visible</h3>
            <input
              className="input-elite input-top-gap"
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Tu nombre en la app"
              maxLength={32}
            />
          </div>
          <button
            className="btn-elite btn-elite-accent btn-auto profile-ok-btn"
            onClick={saveDisplayName}
            disabled={busy || savingName || normalizeDisplayName(nameDraft) === user.name}
          >
            Guardar
          </button>
        </section>

        <section className="profile-section-elite profile-groups-section glass-panel-elite">
          <CardIcon className="section-icon-groups">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 11a4 4 0 1 0-3.6-5.8A4 4 0 0 0 16 11ZM8 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm8 1c-2.7 0-8 1.4-8 4v2h12v-2c0-2.6-1.3-4-4-4ZM8 13c-2.7 0-6 1.4-6 4v2h6v-2a4.8 4.8 0 0 1 2.2-4.1A8.6 8.6 0 0 0 8 13Z" />
            </svg>
          </CardIcon>
          <div className="section-info profile-groups-content">
            <h3>Mis Grupos</h3>

            <div className="groups-controls">
              {!showCreateGroupForm ? (
                <button
                  className="btn-elite btn-elite-outline"
                  type="button"
                  onClick={() => setShowCreateGroupForm(true)}
                >
                  + Crear grupo
                </button>
              ) : (
                <div className="groups-create-panel">
                  <input
                    className="input-elite"
                    type="text"
                    value={groupDraft}
                    placeholder="Nombre del grupo"
                    onChange={(event) => setGroupDraft(event.target.value)}
                  />
                  <div className="quick-chip-row">
                    <button className="quick-chip action-chip active" type="button" onClick={createGroup} disabled={creatingGroup}>
                      {creatingGroup ? "Creando..." : "Crear"}
                    </button>
                    <button
                      className="quick-chip action-chip"
                      type="button"
                      onClick={() => {
                        setShowCreateGroupForm(false);
                        setGroupDraft("");
                      }}
                      disabled={creatingGroup}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <details className="groups-list-collapse" open>
              <summary>Mis grupos ({groupsWithRole.length})</summary>
              <div className="groups-list">
                {groupsWithRole.length === 0 ? (
                  <div className="group-empty-state">
                    <span className="quick-chip">Sin grupos todavía</span>
                    <p className="private-hint">Creá tu primer grupo para organizar partidos.</p>
                  </div>
                ) : null}
                {groupsWithRole.map(({ group, role }) => (
                  <details
                    key={group.id}
                    className="group-item-collapse"
                    onToggle={(event) => {
                      const details = event.currentTarget;
                      if (details.open) {
                        void loadGroupAudit(group.id);
                      }
                    }}
                  >
                    <summary>
                      {editingGroupId === group.id ? (
                        <div className="group-summary-edit" onClick={(event) => event.preventDefault()}>
                          <input
                            className="input-elite"
                            type="text"
                            value={groupNameDraft}
                            onChange={(event) => setGroupNameDraft(event.target.value)}
                            maxLength={48}
                          />
                          <div className="quick-chip-row">
                            <button
                              className="quick-chip action-chip active"
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void confirmRenameGroup(group.id);
                              }}
                            >
                              Guardar
                            </button>
                            <button
                              className="quick-chip action-chip"
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setEditingGroupId(null);
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <strong>{group.name}</strong>
                          <div className="group-summary-actions">
                            <span className={`role-tag role-tag-${role}`}>{role === "member" ? "Miembro" : "Admin"}</span>
                            {role !== "member" ? (
                              <button
                                className="quick-chip action-chip quick-chip-icon"
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  startRenameGroup(group.id, group.name);
                                }}
                                title="Editar nombre"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M3 17.3V21h3.7L18 9.7l-3.7-3.7L3 17.3Zm17.7-10.2a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.7 1.7 3.7 3.7 1.8-1.7Z" />
                                </svg>
                              </button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </summary>
                    <div className="group-item-content">
                      <div className="group-members-list-elite animate-fade-in">
                        <header className="member-list-header">
                          <h4>Miembros ({group.memberAuthUids.length})</h4>
                        </header>
                        <div className="member-cards-grid">
                          {group.memberAuthUids.map((memberAuthUid) => {
                            const memberName =
                              group.memberNamesByAuthUid[memberAuthUid] ??
                              memberDirectory?.[memberAuthUid] ??
                              (memberAuthUid === user.id ? user.name : `Miembro ${memberAuthUid.slice(-4).toUpperCase()}`);
                            const isOwner = group.ownerAuthUid === memberAuthUid;
                            const isAdmin = group.adminAuthUids.includes(memberAuthUid);
                            const canManage = role !== "member" && !isOwner && memberAuthUid !== user.id;
                            const key = `${group.id}:${memberAuthUid}`;
                            return (
                              <div key={key} className="member-card-elite">
                                <div className="member-card-main">
                                  <strong>{memberName}</strong>
                                  <span className={`role-badge-elite ${isOwner || isAdmin ? "admin" : "member"}`}>
                                    {isOwner || isAdmin ? "Admin" : "Miembro"}
                                  </span>
                                </div>
                                {canManage ? (
                                  <div className="quick-chip-row">
                                    <button
                                      className={`btn-elite btn-elite-outline btn-compact ${isAdmin ? "active" : ""}`}
                                      onClick={() => toggleAdminRole(group.id, memberAuthUid, !isAdmin)}
                                      disabled={roleBusyKey === key}
                                    >
                                      {roleBusyKey === key ? "..." : isAdmin ? "Quitar admin" : "Hacer admin"}
                                    </button>
                                    <button
                                      className="btn-elite btn-elite-outline btn-compact"
                                      onClick={() => removeMember(group.id, memberAuthUid)}
                                      disabled={roleBusyKey === `${group.id}:${memberAuthUid}:remove`}
                                    >
                                      {roleBusyKey === `${group.id}:${memberAuthUid}:remove` ? "..." : "Quitar"}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {role !== "member" ? (
                        <div className="group-invite-section-elite">
                          <header className="member-list-header">
                            <h4>Invitar al grupo</h4>
                          </header>
                          <div className="group-invite-menu-elite">
                            <button
                              className="quick-chip action-chip quick-chip-icon"
                              onClick={() => shareGroupInvite(group.id, group.name, "whatsapp")}
                              disabled={inviteBusyGroupId === group.id}
                              type="button"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2Zm5.8 14.4c-.2.6-1.2 1.1-1.8 1.2s-1.2.2-4-.9a13.4 13.4 0 0 1-4.4-3.9 5 5 0 0 1-1.1-2.7c0-1.2.7-1.8 1-2.1.2-.2.5-.3.8-.3h.6c.2 0 .5-.1.7.5.2.7.8 2.4.9 2.6.1.2.1.4 0 .6s-.2.4-.4.6-.3.4-.5.6c-.2.2-.3.4-.1.7.2.3 1 1.7 2.2 2.8 1.5 1.3 2.7 1.7 3.1 1.9.3.2.5.1.7-.1.2-.2.8-.9 1-1.2.2-.4.4-.3.7-.2.3.1 2 .9 2.3 1 .3.2.6.2.7.4.1.3.1 1.3-.1 1.9Z" />
                              </svg>
                              WA
                            </button>
                            <button
                              className="quick-chip action-chip quick-chip-icon"
                              onClick={() => shareGroupInvite(group.id, group.name, "email")}
                              disabled={inviteBusyGroupId === group.id}
                              type="button"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M4 5h16a2 2 0 0 1 2 2v.4l-10 6.3L2 7.4V7a2 2 0 0 1 2-2Zm18 4.6V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.6l9.5 6a1 1 0 0 0 1 0L22 9.6Z" />
                              </svg>
                              Email
                            </button>
                            <button
                              className="quick-chip action-chip quick-chip-icon"
                              onClick={() => shareGroupInvite(group.id, group.name, "link")}
                              disabled={inviteBusyGroupId === group.id}
                              type="button"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M10.6 13.4a1 1 0 0 0 1.4 1.4l4.2-4.2a3 3 0 1 0-4.2-4.2L9.9 8.5a1 1 0 1 0 1.4 1.4l2.1-2.1a1 1 0 1 1 1.4 1.4L10.6 13.4ZM13.4 10.6a1 1 0 0 0-1.4-1.4l-4.2 4.2a3 3 0 1 0 4.2 4.2l2.1-2.1a1 1 0 1 0-1.4-1.4l-2.1 2.1a1 1 0 1 1-1.4-1.4l4.2-4.2Z" />
                              </svg>
                              Copiar
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <details className="player-collapse-elite">
                        <summary>
                          <div className="summary-content">
                            <span>Actividad del grupo</span>
                            <div className="summary-badge">{(auditByGroupId[group.id] ?? []).length}</div>
                          </div>
                        </summary>
                        <div className="player-list-elite">
                          {auditLoadingGroupId === group.id ? <p className="empty-state-list">Cargando actividad...</p> : null}
                          {auditLoadingGroupId !== group.id && (auditByGroupId[group.id] ?? []).length === 0 ? (
                            <p className="empty-state-list">Sin actividad reciente.</p>
                          ) : null}
                          {(auditByGroupId[group.id] ?? []).map((event) => (
                            <div key={event.id} className="player-row-elite">
                              <div className="player-avatar-mini">•</div>
                              <span className="player-name">{formatAuditMessage(event)}</span>
                              <span className="host-label">{formatAuditDate(event.createdAt)}</span>
                            </div>
                          ))}
                          {(auditByGroupId[group.id] ?? []).length > 0 ? (
                            <button
                              type="button"
                              className="quick-chip action-chip"
                              onClick={() => {
                                void loadGroupAudit(group.id, true);
                              }}
                            >
                              Actualizar actividad
                            </button>
                          ) : null}
                        </div>
                      </details>
                      <div className="quick-chip-row">
                        {role === "member" ? (
                          <button
                            className="quick-chip action-chip"
                            type="button"
                            onClick={() => leaveCurrentGroup(group.id)}
                            disabled={groupActionBusyId === group.id}
                          >
                            {groupActionBusyId === group.id ? "..." : "Salir del grupo"}
                          </button>
                        ) : (
                          <button
                            className="quick-chip action-chip"
                            type="button"
                            onClick={() => deleteCurrentGroup(group.id)}
                            disabled={groupActionBusyId === group.id}
                          >
                            {groupActionBusyId === group.id ? "..." : "Eliminar grupo"}
                          </button>
                        )}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          </div>
        </section>

        <section className="profile-section-elite glass-panel-elite">
          <CardIcon>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-7 7v2.3A3.8 3.8 0 0 0 3 15v1a3.9 3.9 0 0 0 4 4h1.2a3 3 0 0 0 5.6 0H17a3.9 3.9 0 0 0 4-4v-1a3.8 3.8 0 0 0-2-3.4V9a7 7 0 0 0-7-7Zm0 19a1 1 0 0 1-.9-.6h1.8a1 1 0 0 1-.9.6Z" />
            </svg>
          </CardIcon>
          <div className="section-info">
            <h3>Notificaciones</h3>
          </div>
          <button className="btn-elite btn-elite-outline" onClick={() => handleAction(onRequestNotifications)} disabled={busy}>
            Configurar
          </button>
        </section>

        <footer className="profile-footer-elite animate-fade-in">
          <button className="btn-elite btn-logout btn-block" onClick={() => handleAction(onLogout)} disabled={busy}>
            Cerrar sesión
          </button>
          <p className="version-tag">Padel App v3.2</p>
        </footer>
      </div>
    </div>
  );
}
