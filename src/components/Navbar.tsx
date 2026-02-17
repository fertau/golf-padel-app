
type TabId = "mis-partidos" | "mis-reservas" | "perfil";

type Props = {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
};

export default function Navbar({ activeTab, onTabChange }: Props) {
    const IconCourts = (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6.5h16M4 17.5h16M12 4v16M7.5 9.5v5M16.5 9.5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
    const IconBall = (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M6 10.3c3.3-1.6 8.7-1.6 12 0M6 13.7c3.3 1.6 8.7 1.6 12 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
    const IconUser = (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M5.5 18c1.4-2.6 3.7-3.9 6.5-3.9s5.1 1.3 6.5 3.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );

    return (
        <nav className="navbar">
            <button
                className={`nav-item ${activeTab === "mis-reservas" ? "active" : ""}`}
                onClick={() => onTabChange("mis-reservas")}
            >
                <div className="nav-icon">{IconCourts}</div>
                <span>Reservas</span>
            </button>
            <button
                className={`nav-item nav-item-center ${activeTab === "mis-partidos" ? "active" : ""}`}
                onClick={() => onTabChange("mis-partidos")}
            >
                <div className="nav-icon">{IconBall}</div>
                <span>Partidos</span>
            </button>
            <button
                className={`nav-item ${activeTab === "perfil" ? "active" : ""}`}
                onClick={() => onTabChange("perfil")}
            >
                <div className="nav-icon">{IconUser}</div>
                <span>Perfil</span>
            </button>
        </nav>
    );
}
