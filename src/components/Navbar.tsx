import { triggerHaptic } from "../lib/utils";

type TabId = "mis-partidos" | "mis-reservas" | "perfil";

type Props = {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
};

export default function Navbar({ activeTab, onTabChange }: Props) {
    const handleTabChange = (tab: TabId) => {
        onTabChange(tab);
        triggerHaptic("light");
    };
    const IconCalendar = (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 9h18M8 2v4M16 2v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="15" cy="15" r="1.5" fill="currentColor" />
        </svg>
    );
    const IconRacket = (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a6 6 0 0 0-6 6c0 3.3 2.7 6 6 6s6-2.7 6-6a6 6 0 0 0-6-6Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 14v8M10 22h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="8" r="1" fill="currentColor" />
            <circle cx="10" cy="7" r="1" fill="currentColor" />
            <circle cx="14" cy="7" r="1" fill="currentColor" />
            <circle cx="10" cy="9" r="1" fill="currentColor" />
            <circle cx="14" cy="9" r="1" fill="currentColor" />
        </svg>
    );
    const IconProfile = (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M4 21v-2c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );

    return (
        <nav className="navbar">
            <button
                className={`nav-item ${activeTab === "mis-reservas" ? "active" : ""}`}
                onClick={() => handleTabChange("mis-reservas")}
            >
                <div className="nav-icon">{IconCalendar}</div>
                <span>Reservas</span>
            </button>
            <button
                className={`nav-item nav-item-center ${activeTab === "mis-partidos" ? "active" : ""}`}
                onClick={() => handleTabChange("mis-partidos")}
            >
                <div className="nav-icon">{IconRacket}</div>
                <span>Partidos</span>
            </button>
            <button
                className={`nav-item ${activeTab === "perfil" ? "active" : ""}`}
                onClick={() => handleTabChange("perfil")}
            >

                <div className="nav-icon">{IconProfile}</div>
                <span>Perfil</span>
            </button>
        </nav>
    );
}
