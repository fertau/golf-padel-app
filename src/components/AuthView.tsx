
type Props = {
    onLoginWithGoogle: () => void;
    busy?: boolean;
};

export default function AuthView({ onLoginWithGoogle, busy }: Props) {
    return (
        <div className="auth-view">
            <div className="auth-overlay" />
            <div className="auth-content mobile-shell">
                <header className="auth-header">
                    <div className="auth-logo-shell">
                        <img src="/apple-touch-icon.png" alt="Golf Padel" className="auth-logo" />
                    </div>
                    <h1>Golf Padel App</h1>
                    <p className="auth-tagline">Anotate!!</p>
                </header>

                <section className="auth-actions">
                    <button
                        className="google-login-btn"
                        onClick={onLoginWithGoogle}
                        disabled={busy}
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" aria-hidden="true" />
                        <span>Continuar con Google</span>
                    </button>
                    <p className="auth-info">Acceso rápido y seguro.</p>
                </section>
            </div>
        </div>
    );
}
