
type TabId = "mis-partidos" | "mis-reservas" | "perfil";

type Props = {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
};

export default function Navbar({ activeTab, onTabChange }: Props) {
    return (
        <nav className="navbar">
            <button
                className={`nav-item ${activeTab === "mis-partidos" ? "active" : ""}`}
                onClick={() => onTabChange("mis-partidos")}
            >
                <div className="nav-icon">🎾</div>
                <span>Partidos</span>
            </button>
            <button
                className={`nav-item ${activeTab === "mis-reservas" ? "active" : ""}`}
                onClick={() => onTabChange("mis-reservas")}
            >
                <div className="nav-icon">📅</div>
                <span>Reservas</span>
            </button>
            <button
                className={`nav-item ${activeTab === "perfil" ? "active" : ""}`}
                onClick={() => onTabChange("perfil")}
            >
                <div className="nav-icon">👤</div>
                <span>Perfil</span>
            </button>
        </nav>
    );
}
