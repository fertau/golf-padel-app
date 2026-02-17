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
        <div className="list">
            <div className="profile-header">
                <div className="profile-avatar-large">
                    {user.avatar ? (
                        <img src={user.avatar} alt={user.name} />
                    ) : (
                        <div className="avatar-placeholder">{user.name.charAt(0)}</div>
                    )}
                </div>
                <div className="profile-info">
                    <h2>{user.name}</h2>
                    <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>Jugador de Padel</p>
                </div>
            </div>

            <div className="panel">
                <h3 className="section-title">Nombre visible</h3>
                <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "-0.5rem 0 0.5rem" }}>
                    Así aparecerás en las reservas y listas de partidos.
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                        style={{ flex: 1 }}
                        type="text"
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        placeholder="Tu nombre"
                        maxLength={32}
                    />
                    <button
                        className="neutral"
                        style={{ padding: "0 1.2rem" }}
                        onClick={saveDisplayName}
                        disabled={busy || savingName || normalizeDisplayName(nameDraft) === user.name}
                    >
                        Ok
                    </button>
                </div>
            </div>

            <div className="panel">
                <h3 className="section-title">Notificaciones</h3>
                <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "-0.5rem 0 0.5rem" }}>
                    Recibí alertas cuando alguien se suma a tu partido.
                </p>
                <button className="neutral" onClick={() => handleAction(onRequestNotifications)} disabled={busy}>
                    Configurar notificaciones
                </button>
            </div>

            <div className="panel">
                <h3 className="section-title">Cuenta</h3>
                <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "-0.5rem 0 0.5rem" }}>
                    Tu ID de jugador es único y privado.
                </p>
                <code style={{ fontSize: "0.75rem", opacity: 0.5, wordBreak: "break-all" }}>{user.id}</code>
            </div>

            <div className="actions" style={{ marginTop: "1rem" }}>
                <button className="danger" onClick={() => handleAction(onLogout)} disabled={busy}>
                    Cerrar Sesión
                </button>
            </div>
        </div>
    );
}
