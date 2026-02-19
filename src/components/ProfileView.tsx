import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Group, User } from "../lib/types";
import { isValidDisplayName, normalizeDisplayName, triggerHaptic } from "../lib/utils";

type Props = {
  user: User;
  groups: Group[];
  memberDirectory?: Record<string, string>;
  onCreateGroup: (name: string) => Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<void>;
  onCreateGroupInvite: (groupId: string, channel?: "whatsapp" | "email" | "link") => Promise<string>;
  onSetGroupMemberAdmin: (groupId: string, targetAuthUid: string, makeAdmin: boolean) => Promise<void>;
  onLogout: () => void;
  onRequestNotifications: () => void;
  onUpdateDisplayName: (nextName: string) => Promise<void>;
  busy?: boolean;
};

const CardIcon = ({ children }: { children: ReactNode }) => (
  <div className="section-icon section-icon-svg">{children}</div>
);

export default function ProfileView({
  user,
  groups,
  memberDirectory,
  onCreateGroup,
  onRenameGroup,
  onCreateGroupInvite,
  onSetGroupMemberAdmin,
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
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");

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

  const shareGroupInvite = async (groupId: string, channel: "whatsapp" | "email" | "link") => {
    try {
      setInviteBusyGroupId(groupId);
      const link = await onCreateGroupInvite(groupId, channel);
      const message = `🎾 Te invito a mi grupo de pádel.\n\nUnite desde este link (vence en 7 días):\n${link}`;
      const encoded = encodeURIComponent(message);

      if (channel === "whatsapp") {
        window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer");
      } else if (channel === "email") {
        const emailTo = window.prompt("Email del invitado (opcional):", "")?.trim() ?? "";
        const subject = encodeURIComponent("Invitación a grupo de pádel");
        const recipient = encodeURIComponent(emailTo);
        window.open(`mailto:${recipient}?subject=${subject}&body=${encoded}`, "_self");
      } else if (navigator.share) {
        await navigator.share({ title: "Invitación a grupo", text: message });
      } else {
        await navigator.clipboard.writeText(link);
        alert("Link copiado.");
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
            <p>Así te van a ver en reservas y asistencias.</p>
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
          <CardIcon>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 11a4 4 0 1 0-3.6-5.8A4 4 0 0 0 16 11ZM8 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm8 1c-2.7 0-8 1.4-8 4v2h12v-2c0-2.6-1.3-4-4-4ZM8 13c-2.7 0-6 1.4-6 4v2h6v-2a4.8 4.8 0 0 1 2.2-4.1A8.6 8.6 0 0 0 8 13Z" />
            </svg>
          </CardIcon>
          <div className="section-info profile-groups-content">
            <h3>Grupos</h3>
            <p>Pertenecés a {groups.length} grupo(s).</p>

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
                    <button className="quick-chip active" type="button" onClick={createGroup} disabled={creatingGroup}>
                      {creatingGroup ? "Creando..." : "Crear"}
                    </button>
                    <button
                      className="quick-chip"
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
                  <details key={group.id} className="group-item-collapse">
                    <summary>
                      <strong>{group.name}</strong>
                      <span className={`role-tag role-tag-${role}`}>{role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Miembro"}</span>
                    </summary>
                    <div className="group-item-content">
                      <div className="group-card-head">
                        <div>
                          {editingGroupId === group.id ? (
                            <div className="group-name-edit-inline">
                              <input
                                className="input-elite"
                                type="text"
                                value={groupNameDraft}
                                onChange={(event) => setGroupNameDraft(event.target.value)}
                                maxLength={48}
                              />
                              <div className="quick-chip-row">
                                <button className="quick-chip active" type="button" onClick={() => confirmRenameGroup(group.id)}>
                                  Guardar
                                </button>
                                <button className="quick-chip" type="button" onClick={() => setEditingGroupId(null)}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <small className="group-card-role">Nombre del grupo</small>
                              <strong className="group-card-name">{group.name}</strong>
                            </>
                          )}
                        </div>
                        {role !== "member" && editingGroupId !== group.id ? (
                          <button
                            className="quick-chip quick-chip-icon"
                            type="button"
                            onClick={() => startRenameGroup(group.id, group.name)}
                            title="Editar nombre"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 17.3V21h3.7L18 9.7l-3.7-3.7L3 17.3Zm17.7-10.2a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.7 1.7 3.7 3.7 1.8-1.7Z" />
                            </svg>
                          </button>
                        ) : null}
                      </div>

                      <details className="group-members-collapse" open>
                        <summary>Miembros ({group.memberAuthUids.length})</summary>
                        <div className="member-list">
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
                              <div key={key} className="member-row-soft">
                                <div className="member-row-main">
                                  <strong>{memberName}</strong>
                                  <div>
                                    <span className={`member-role-chip ${isOwner ? "owner" : isAdmin ? "admin" : "member"}`}>
                                      {isOwner ? "Owner" : isAdmin ? "Admin" : "Miembro"}
                                    </span>
                                  </div>
                                </div>
                                {canManage ? (
                                  <button
                                    className={`quick-chip ${isAdmin ? "active" : ""}`}
                                    onClick={() => toggleAdminRole(group.id, memberAuthUid, !isAdmin)}
                                    disabled={roleBusyKey === key}
                                  >
                                    {roleBusyKey === key ? "..." : isAdmin ? "Quitar admin" : "Hacer admin"}
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </details>

                      {role !== "member" ? (
                        <details className="group-share-collapse">
                          <summary>Compartir</summary>
                          <div className="group-invite-menu group-action-menu">
                            <button
                              className="quick-chip quick-chip-icon"
                              onClick={() => shareGroupInvite(group.id, "whatsapp")}
                              disabled={inviteBusyGroupId === group.id}
                              type="button"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2Zm5.8 14.4c-.2.6-1.2 1.1-1.8 1.2s-1.2.2-4-.9a13.4 13.4 0 0 1-4.4-3.9 5 5 0 0 1-1.1-2.7c0-1.2.7-1.8 1-2.1.2-.2.5-.3.8-.3h.6c.2 0 .5-.1.7.5.2.7.8 2.4.9 2.6.1.2.1.4 0 .6s-.2.4-.4.6-.3.4-.5.6c-.2.2-.3.4-.1.7.2.3 1 1.7 2.2 2.8 1.5 1.3 2.7 1.7 3.1 1.9.3.2.5.1.7-.1.2-.2.8-.9 1-1.2.2-.4.4-.3.7-.2.3.1 2 .9 2.3 1 .3.2.6.2.7.4.1.3.1 1.3-.1 1.9Z" />
                              </svg>
                              WA
                            </button>
                            <button
                              className="quick-chip quick-chip-icon"
                              onClick={() => shareGroupInvite(group.id, "email")}
                              disabled={inviteBusyGroupId === group.id}
                              type="button"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M4 5h16a2 2 0 0 1 2 2v.4l-10 6.3L2 7.4V7a2 2 0 0 1 2-2Zm18 4.6V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.6l9.5 6a1 1 0 0 0 1 0L22 9.6Z" />
                              </svg>
                              Email
                            </button>
                            <button
                              className="quick-chip quick-chip-icon"
                              onClick={() => shareGroupInvite(group.id, "link")}
                              disabled={inviteBusyGroupId === group.id}
                              type="button"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M10.6 13.4a1 1 0 0 0 1.4 1.4l4.2-4.2a3 3 0 1 0-4.2-4.2L9.9 8.5a1 1 0 1 0 1.4 1.4l2.1-2.1a1 1 0 1 1 1.4 1.4L10.6 13.4ZM13.4 10.6a1 1 0 0 0-1.4-1.4l-4.2 4.2a3 3 0 1 0 4.2 4.2l2.1-2.1a1 1 0 1 0-1.4-1.4l-2.1 2.1a1 1 0 1 1-1.4-1.4l4.2-4.2Z" />
                              </svg>
                              Copiar
                            </button>
                          </div>
                        </details>
                      ) : null}
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
            <p>Recibí alertas de nuevos partidos.</p>
          </div>
          <button className="btn-elite btn-elite-outline" onClick={() => handleAction(onRequestNotifications)} disabled={busy}>
            Configurar
          </button>
        </section>

        <footer className="profile-footer-elite animate-fade-in">
          <button className="btn-elite btn-link-danger-elite btn-block btn-logout" onClick={() => handleAction(onLogout)} disabled={busy}>
            Cerrar sesión
          </button>
          <p className="version-tag">Golf Padel App v3.2</p>
        </footer>
      </div>
    </div>
  );
}
