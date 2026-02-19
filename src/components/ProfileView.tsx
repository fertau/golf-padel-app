import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Group, User } from "../lib/types";
import { isValidDisplayName, normalizeDisplayName, triggerHaptic } from "../lib/utils";

type Props = {
  user: User;
  groups: Group[];
  memberDirectory?: Record<string, string>;
  activeGroupScope: "all" | string;
  onSetActiveGroupScope: (scope: "all" | string) => void;
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
  activeGroupScope,
  onSetActiveGroupScope,
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
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [inviteBusyGroupId, setInviteBusyGroupId] = useState<string | null>(null);
  const [inviteMenuGroupId, setInviteMenuGroupId] = useState<string | null>(null);
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
              <select
                className="select-elite"
                value={activeGroupScope}
                onChange={(event) =>
                  onSetActiveGroupScope(event.target.value === "all" ? "all" : event.target.value)
                }
              >
                <option value="all">Todos mis grupos</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>

              <div className="groups-create-row">
                <input
                  className="input-elite"
                  type="text"
                  value={groupDraft}
                  placeholder="Nuevo grupo"
                  onChange={(event) => setGroupDraft(event.target.value)}
                />
                <button className="btn-elite btn-elite-outline" onClick={createGroup} disabled={creatingGroup}>
                  {creatingGroup ? "Creando..." : "Crear grupo"}
                </button>
              </div>
            </div>

            <p className="group-admin-actions">
              Admins pueden: renombrar grupo, invitar miembros, asignar/quitar admins (solo miembros),
              editar y cancelar reservas del grupo.
            </p>

            <div className="groups-list">
              {groupsWithRole.map(({ group, role }) => (
                <article key={group.id} className="group-card">
                  <header className="group-card-head">
                    <div>
                      <strong className="group-card-name">{group.name}</strong>
                      <small className="group-card-role">
                        Rol: {role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Miembro"}
                      </small>
                    </div>
                    <button
                      className={`btn-elite btn-elite-outline btn-compact ${activeGroupScope === group.id ? "btn-elite-accent" : ""}`}
                      onClick={() => onSetActiveGroupScope(group.id)}
                    >
                      {activeGroupScope === group.id ? "Activo" : "Usar"}
                    </button>
                  </header>

                  {role !== "member" ? (
                    <div className="group-card-actions">
                      <button
                        className="btn-elite btn-elite-outline btn-compact"
                        onClick={() => startRenameGroup(group.id, group.name)}
                        disabled={inviteBusyGroupId === group.id}
                      >
                        Renombrar
                      </button>
                      <button
                        className="btn-elite btn-elite-accent btn-compact"
                        onClick={() =>
                          setInviteMenuGroupId((current) => (current === group.id ? null : group.id))
                        }
                        disabled={inviteBusyGroupId === group.id}
                      >
                        {inviteBusyGroupId === group.id ? "..." : "Invitar"}
                      </button>
                    </div>
                  ) : null}

                  {role !== "member" && inviteMenuGroupId === group.id ? (
                    <div className="group-invite-menu">
                      <button
                        className="btn-elite btn-elite-outline btn-compact"
                        onClick={() => shareGroupInvite(group.id, "whatsapp")}
                        disabled={inviteBusyGroupId === group.id}
                      >
                        WhatsApp
                      </button>
                      <button
                        className="btn-elite btn-elite-outline btn-compact"
                        onClick={() => shareGroupInvite(group.id, "email")}
                        disabled={inviteBusyGroupId === group.id}
                      >
                        Email
                      </button>
                      <button
                        className="btn-elite btn-elite-outline btn-compact"
                        onClick={() => shareGroupInvite(group.id, "link")}
                        disabled={inviteBusyGroupId === group.id}
                      >
                        Link
                      </button>
                    </div>
                  ) : null}

                  {editingGroupId === group.id ? (
                    <div className="group-rename-row">
                      <input
                        className="input-elite"
                        type="text"
                        value={groupNameDraft}
                        onChange={(event) => setGroupNameDraft(event.target.value)}
                        maxLength={48}
                      />
                      <button className="btn-elite btn-elite-accent btn-compact" onClick={() => confirmRenameGroup(group.id)}>
                        Guardar
                      </button>
                      <button className="btn-elite btn-elite-outline btn-compact" onClick={() => setEditingGroupId(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : null}

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
                            <small>{isOwner ? "Owner" : isAdmin ? "Admin" : "Miembro"}</small>
                          </div>
                          {canManage ? (
                            <button
                              className={`btn-elite btn-compact ${isAdmin ? "btn-elite-accent" : "btn-elite-outline"}`}
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
                </article>
              ))}
            </div>
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
