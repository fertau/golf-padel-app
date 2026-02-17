
type Props = {
    onLoginWithGoogle: () => Promise<void> | void;
    busy?: boolean;
    error?: string | null;
};

export default function AuthView({ onLoginWithGoogle, busy, error }: Props) {
    return (
        <div className="auth-view">
            <div className="auth-overlay" />
            <div className="auth-content mobile-shell">
                <header className="auth-header">
                    <div className="auth-logo-shell">
                        <img src="/apple-touch-icon.png" alt="Golf Padel" className="auth-logo" />
                    </div>
                    <h1 className="name-logo">
                        GOLF <span>PADEL</span> APP
                    </h1>
                    <p className="auth-tagline">Anotate!!</p>
                </header>

                <section className="auth-actions">
                    <button
                        type="button"
                        className="google-login-btn"
                        onClick={onLoginWithGoogle}
                        disabled={busy}
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" aria-hidden="true" />
                        <span>Continuar con Google</span>
                    </button>
                    {error ? <p className="warning">{error}</p> : null}
                    <p className="auth-info">Acceso rápido y seguro.</p>
                </section>
            </div>
        </div>
    );
}
