import { useEffect, useMemo, useState } from "react";
import type { Group, User } from "../lib/types";
import { isValidDisplayName, normalizeDisplayName, triggerHaptic } from "../lib/utils";

type Props = {
  user: User;
  groups: Group[];
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

export default function ProfileView({
  user,
  groups,
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
  const [roleBusyKey, setRoleBusyKey] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");

  useEffect(() => {
    setNameDraft(user.name);
  }, [user.name]);

  const groupsWithRole = useMemo(() => {
    return groups.map((group) => ({
      group,
      role: group.ownerAuthUid === user.id ? "owner" : group.adminAuthUids.includes(user.id) ? "admin" : "member"
    }));
  }, [groups, user.id]);

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
          <div className="section-icon">🪪</div>
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
            OK
          </button>
        </section>

        <section className="profile-section-elite glass-panel-elite">
          <div className="section-icon">👥</div>
          <div className="section-info">
            <h3>Grupos</h3>
            <p>Pertenecés a {groups.length} grupo(s).</p>
            <select
              className="select-elite"
              value={activeGroupScope}
              onChange={(event) => onSetActiveGroupScope(event.target.value === "all" ? "all" : event.target.value)}
            >
              <option value="all">Todos mis grupos</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <div className="history-level top-gap-sm">
              <input
                className="input-elite"
                type="text"
                value={groupDraft}
                placeholder="Nuevo grupo"
                onChange={(event) => setGroupDraft(event.target.value)}
              />
              <button
                className="btn-elite btn-block top-gap-sm"
                onClick={createGroup}
                disabled={creatingGroup}
              >
                {creatingGroup ? "Creando..." : "Crear grupo"}
              </button>
            </div>
            <div className="history-level top-gap-md">
              {groupsWithRole.map(({ group, role }) => (
                <details key={group.id} className="history-row glass-panel-elite group-details-row" open={activeGroupScope === group.id}>
                  <summary className="history-main history-summary-plain">
                    <strong>{group.name}</strong>
                    <div className="history-summary-meta">
                      <small>Rol: {role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Miembro"}</small>
                      <span className="history-summary-arrow">{activeGroupScope === group.id ? '▲' : '▼'}</span>
                    </div>
                  </summary>
                  <div className="quick-chip-row top-gap-sm">
                    {role !== "member" ? (
                      <>
                        <button
                          className="quick-chip"
                          onClick={() => startRenameGroup(group.id, group.name)}
                          disabled={inviteBusyGroupId === group.id}
                        >
                          Renombrar
                        </button>
                        <button
                          className="quick-chip active"
                          onClick={() => shareGroupInvite(group.id, "whatsapp")}
                          disabled={inviteBusyGroupId === group.id}
                        >
                          {inviteBusyGroupId === group.id ? "..." : "Invitar WA"}
                        </button>
                        <button
                          className="quick-chip"
                          onClick={() => shareGroupInvite(group.id, "email")}
                          disabled={inviteBusyGroupId === group.id}
                        >
                          Email
                        </button>
                        <button
                          className="quick-chip"
                          onClick={() => shareGroupInvite(group.id, "link")}
                          disabled={inviteBusyGroupId === group.id}
                        >
                          Link
                        </button>
                      </>
                    ) : null}
                  </div>
                  {editingGroupId === group.id ? (
                    <div className="quick-chip-row top-gap-sm">
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
                        X
                      </button>
                    </div>
                  ) : null}
                  <div className="history-level top-gap-sm gap-sm">
                    {Object.entries(group.memberNamesByAuthUid).map(([memberAuthUid, memberName]) => {
                      const isOwner = group.ownerAuthUid === memberAuthUid;
                      const isAdmin = group.adminAuthUids.includes(memberAuthUid);
                      const canManage = role !== "member" && !isOwner && memberAuthUid !== user.id;
                      const key = `${group.id}:${memberAuthUid}`;
                      return (
                        <div key={key} className="history-row member-row-soft">
                          <div className="history-main">
                            <strong>{memberName}</strong>
                            <small>
                              {isOwner ? "Owner" : isAdmin ? "Admin" : "Miembro"}
                            </small>
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
              ))}
            </div>
          </div>
        </section>

        <section className="profile-section-elite glass-panel-elite">
          <div className="section-icon">🔔</div>
          <div className="section-info">
            <h3>Notificaciones</h3>
            <p>Recibí alertas de nuevos partidos.</p>
          </div>
          <button className="btn-elite btn-elite-outline" onClick={() => handleAction(onRequestNotifications)} disabled={busy}>
            Configurar
          </button>
        </section>

        <section className="profile-section-elite glass-panel-elite">
          <div className="section-icon">🛡️</div>
          <div className="section-info">
            <h3>Privacidad</h3>
            <p>ID único de jugador.</p>
            <small className="soft-opacity">{user.id}</small>
          </div>
        </section>

        <footer className="profile-footer-elite animate-fade-in">
          <button className="btn-elite btn-link-danger-elite btn-block btn-logout" onClick={() => handleAction(onLogout)} disabled={busy}>
            Cerrar sesión
          </button>
          <p className="version-tag">Golf Padel App v3.1</p>
        </footer>
      </div>
    </div>
  );
}
