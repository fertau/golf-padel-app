import type { User } from "../lib/types";

type Props = {
    user: User;
    onLogout: () => void;
    onRequestNotifications: () => void;
    busy?: boolean;
};

export default function ProfileView({ user, onLogout, onRequestNotifications, busy }: Props) {
    return (
        <div className="profile-view">
            <section className="panel profile-header">
                <div className="profile-avatar-large">
                    {user.avatar ? (
                        <img src={user.avatar} alt={user.name} />
                    ) : (
                        <div className="avatar-placeholder">{user.name.charAt(0)}</div>
                    )}
                </div>
                <div className="profile-info">
                    <h2>{user.name}</h2>
                    <p className="private-hint">Jugador Nivel Elite</p>
                </div>
            </section>

            <section className="panel settings-section">
                <h3>Ajustes</h3>
                <button className="neutral" onClick={onRequestNotifications} disabled={busy}>
                    Activar notificaciones push
                </button>
            </section>

            <section className="panel account-section">
                <h3>Cuenta</h3>
                <p className="private-hint">ID: {user.id}</p>
                <button className="danger" onClick={onLogout} disabled={busy}>
                    Cerrar sesión
                </button>
            </section>
        </div>
    );
}
