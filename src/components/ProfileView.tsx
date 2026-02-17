import { useEffect, useState } from "react";
import type { User } from "../lib/types";
import { isValidDisplayName, normalizeDisplayName, triggerHaptic } from "../lib/utils";

type Props = {
    user: User;
    onLogout: () => void;
    onRequestNotifications: () => void;
    onUpdateDisplayName: (nextName: string) => Promise<void>;
    busy?: boolean;
};

export default function ProfileView({ user, onLogout, onRequestNotifications, onUpdateDisplayName, busy }: Props) {
    const [nameDraft, setNameDraft] = useState(user.name);
    const [savingName, setSavingName] = useState(false);

    useEffect(() => {
        setNameDraft(user.name);
    }, [user.name]);

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

    return (
        <div className="profile-view-elite">
            <header className="profile-hero-elite">
                <div className="profile-avatar-wrapper">
                    {user.avatar ? (
                        <img src={user.avatar} alt={user.name} />
                    ) : (
                        <div className="avatar-initials">{user.name.charAt(0)}</div>
                    )}
                    <div className="avatar-status-badge" />
                </div>
                <h2>{user.name}</h2>
                <div className="profile-level-badge">Padel Pro • Nivel Elite</div>
            </header>

            <div className="profile-content-elite">
                <section className="profile-section-elite glass-effect">
                    <div className="section-icon">🪪</div>
                    <div className="section-info">
                        <h3>Nombre visible</h3>
                        <p>Así te van a ver en reservas y asistencias.</p>
                        <input
                            type="text"
                            value={nameDraft}
                            onChange={(event) => setNameDraft(event.target.value)}
                            placeholder="Tu nombre en la app"
                            maxLength={32}
                        />
                    </div>
                    <button
                        className="btn-action-elite"
                        onClick={saveDisplayName}
                        disabled={busy || savingName || normalizeDisplayName(nameDraft) === user.name}
                    >
                        Guardar
                    </button>
                </section>

                <section className="profile-section-elite glass-effect">
                    <div className="section-icon">🔔</div>
                    <div className="section-info">
                        <h3>Notificaciones</h3>
                        <p>Recibí alertas de nuevos partidos y confirmaciones.</p>
                    </div>
                    <button className="btn-action-elite" onClick={() => handleAction(onRequestNotifications)} disabled={busy}>
                        Configurar
                    </button>
                </section>

                <section className="profile-section-elite glass-effect">
                    <div className="section-icon">🛡️</div>
                    <div className="section-info">
                        <h3>Privacidad</h3>
                        <p>Tu ID de jugador es único y privado.</p>
                        <small>{user.id}</small>
                    </div>
                </section>

                <footer className="profile-footer-elite">
                    <button className="btn-danger-elite" onClick={() => handleAction(onLogout)} disabled={busy}>
                        Cerrar Sesión
                    </button>
                    <p className="version-tag">Golf Padel App v2.4 Elite Edition</p>
                </footer>
            </div>
        </div>
    );
}
