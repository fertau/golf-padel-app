import { useEffect, useMemo, useState } from "react";
import type { Group, User } from "../lib/types";
import { isValidDisplayName, normalizeDisplayName, triggerHaptic } from "../lib/utils";

type Props = {
  user: User;
  groups: Group[];
  activeGroupScope: "all" | string;
  onSetActiveGroupScope: (scope: "all" | string) => void;
  onCreateGroup: (name: string) => Promise<void>;
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
        const subject = encodeURIComponent("Invitación a grupo de pádel");
        window.open(`mailto:?subject=${subject}&body=${encoded}`, "_self");
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

      <div className="profile-content-elite">
        <section className="profile-section-elite glass-effect">
          <div className="section-icon">🪪</div>
          <div className="section-info">
            <h3>Nombre visible</h3>
            <p>Así te van a ver en reservas y asistencias.</p>
            <input
              className="elite-input"
              style={{ marginTop: "0.5rem" }}
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Tu nombre en la app"
              maxLength={32}
            />
          </div>
          <button
            className="btn-action-elite btn-primary-elite"
            style={{ padding: "0.5rem 1rem", width: "auto" }}
            onClick={saveDisplayName}
            disabled={busy || savingName || normalizeDisplayName(nameDraft) === user.name}
          >
            OK
          </button>
        </section>

        <section className="profile-section-elite glass-effect">
          <div className="section-icon">👥</div>
          <div className="section-info">
            <h3>Grupos</h3>
            <p>Pertenecés a {groups.length} grupo(s).</p>
            <select
              className="elite-select"
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
            <div className="history-level" style={{ marginTop: "0.5rem" }}>
              <input
                className="elite-input"
                type="text"
                value={groupDraft}
                placeholder="Nuevo grupo"
                onChange={(event) => setGroupDraft(event.target.value)}
              />
              <button
                className="btn-action-elite"
                onClick={createGroup}
                disabled={creatingGroup}
              >
                {creatingGroup ? "Creando..." : "Crear grupo"}
              </button>
            </div>
            <div className="history-level" style={{ marginTop: "0.5rem" }}>
              {groupsWithRole.map(({ group, role }) => (
                <details key={group.id} className="history-row" open={activeGroupScope === group.id}>
                  <summary className="history-main" style={{ listStyle: "none", cursor: "pointer" }}>
                    <strong>{group.name}</strong>
                    <small>Rol: {role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Miembro"}</small>
                  </summary>
                  <div className="quick-chip-row" style={{ marginTop: "0.5rem" }}>
                    {role !== "member" ? (
                      <>
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
                  <div className="history-level" style={{ marginTop: "0.5rem" }}>
                    {Object.entries(group.memberNamesByAuthUid).map(([memberAuthUid, memberName]) => {
                      const isOwner = group.ownerAuthUid === memberAuthUid;
                      const isAdmin = group.adminAuthUids.includes(memberAuthUid);
                      const canManage = role !== "member" && !isOwner && memberAuthUid !== user.id;
                      const key = `${group.id}:${memberAuthUid}`;
                      return (
                        <div key={key} className="history-row">
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

        <section className="profile-section-elite glass-effect">
          <div className="section-icon">🔔</div>
          <div className="section-info">
            <h3>Notificaciones</h3>
            <p>Recibí alertas de nuevos partidos.</p>
          </div>
          <button className="btn-action-elite" onClick={() => handleAction(onRequestNotifications)} disabled={busy}>
            Configurar
          </button>
        </section>

        <section className="profile-section-elite glass-effect">
          <div className="section-icon">🛡️</div>
          <div className="section-info">
            <h3>Privacidad</h3>
            <p>ID único de jugador.</p>
            <small>{user.id}</small>
          </div>
        </section>

        <footer className="profile-footer-elite">
          <button className="btn-danger-elite" onClick={() => handleAction(onLogout)} disabled={busy} style={{ width: "100%", padding: "1rem", borderRadius: "15px" }}>
            Cerrar sesión
          </button>
          <p className="version-tag">Golf Padel App v3.0</p>
        </footer>
      </div>
    </div>
  );
}
