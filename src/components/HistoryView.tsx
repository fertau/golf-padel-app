import React from "react";
import type { Reservation, User } from "../lib/types";
import ReservationCard from "./ReservationCard";

type HistoryStatus = "confirmed" | "maybe" | "cancelled";
type HistoryRange = "all" | "1m" | "3m" | "6m" | "1y" | "month";

type Props = {
    historyExpanded: boolean;
    setHistoryExpanded: (expanded: boolean) => void;
    historyStats: { playedCount: number; latest: string };
    historyStatuses: HistoryStatus[];
    setHistoryStatuses: (statuses: HistoryStatus[]) => void;
    historyRange: HistoryRange;
    setHistoryRange: (range: HistoryRange) => void;
    historyMonth: string;
    setHistoryMonth: (month: string) => void;
    historyMonthOptions: string[];
    historyPlayerFilter: string;
    setHistoryPlayerFilter: (filter: string) => void;
    historyPlayers: { id: string; name: string }[];
    historyCourtFilter: string;
    setHistoryCourtFilter: (filter: string) => void;
    historyCourtOptions: string[];
    filteredHistory: Reservation[];
    currentUser: User;
    onOpenReservation: (id: string) => void;
    expandedReservationId: string | null;
};

export const HistoryView: React.FC<Props> = ({
    historyExpanded,
    setHistoryExpanded,
    historyStats,
    historyStatuses,
    setHistoryStatuses,
    historyRange,
    setHistoryRange,
    historyMonth,
    setHistoryMonth,
    historyMonthOptions,
    historyPlayerFilter,
    setHistoryPlayerFilter,
    historyPlayers,
    historyCourtFilter,
    setHistoryCourtFilter,
    historyCourtOptions,
    filteredHistory,
    currentUser,
    onOpenReservation,
    expandedReservationId,
}) => {
    const toggleStatus = (status: HistoryStatus) => {
        if (historyStatuses.includes(status)) {
            setHistoryStatuses(historyStatuses.filter((s) => s !== status));
        } else {
            setHistoryStatuses([...historyStatuses, status]);
        }
    };

    return (
        <section className="panel history-panel glass-panel-elite animate-fade-in">
            <button className="history-toggle" onClick={() => setHistoryExpanded(!historyExpanded)}>
                <span className="section-title">Historial y Estadísticas</span>
                <span>{historyExpanded ? "▲" : "▼"}</span>
            </button>

            {historyExpanded && (
                <div className="history-content-elite animate-fade-in">
                    <div className="detail-kpis">
                        <div className="kpi-card glass-panel-elite kpi-card-compact">
                            <span className="kpi-label">Jugados</span>
                            <strong>{historyStats.playedCount}</strong>
                        </div>
                        <div className="kpi-card glass-panel-elite kpi-card-compact">
                            <span className="kpi-label">Último</span>
                            <strong className="history-latest">{historyStats.latest}</strong>
                        </div>
                    </div>

                    <div className="history-grid-filters">
                        <div className="history-level">
                            <span className="kpi-label kpi-label-left">Todos / Ninguno</span>
                            <div className="quick-chip-row">
                                <button
                                    type="button"
                                    className={`quick-chip ${historyStatuses.length === 3 ? "active" : ""}`}
                                    onClick={() => setHistoryStatuses(["confirmed", "maybe", "cancelled"])}
                                >
                                    Todos
                                </button>
                                <button
                                    type="button"
                                    className={`quick-chip ${historyStatuses.length === 0 ? "active" : ""}`}
                                    onClick={() => setHistoryStatuses([])}
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>

                        <div className="history-level">
                            <span className="kpi-label kpi-label-left">Estado</span>
                            <div className="quick-chip-row">
                                {(["confirmed", "maybe", "cancelled"] as const).map((s) => (
                                    <button
                                        key={s}
                                        className={`quick-chip ${historyStatuses.includes(s) ? "active" : ""}`}
                                        onClick={() => toggleStatus(s)}
                                    >
                                        {s === "confirmed" ? "Juego" : s === "maybe" ? "Quizás" : "No juego"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="history-level">
                            <span className="kpi-label kpi-label-left">Rango</span>
                            <select className="select-elite" value={historyRange} onChange={(e) => setHistoryRange(e.target.value as HistoryRange)}>
                                <option value="all">Todo</option>
                                <option value="1m">Último mes</option>
                                <option value="3m">Últimos 3 meses</option>
                                <option value="6m">Últimos 6 meses</option>
                                <option value="1y">Último año</option>
                                <option value="month">Mes puntual</option>
                            </select>
                        </div>

                        {historyRange === "month" && (
                            <div className="history-level">
                                <span className="kpi-label kpi-label-left">Mes</span>
                                <select className="select-elite" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}>
                                    {historyMonthOptions.length === 0 ? (
                                        <option value={historyMonth}>Sin meses en historial</option>
                                    ) : historyMonthOptions.map((m) => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="history-level">
                            <span className="kpi-label kpi-label-left">Jugador</span>
                            <select className="select-elite" value={historyPlayerFilter} onChange={(e) => setHistoryPlayerFilter(e.target.value)}>
                                <option value="all">Cualquiera</option>
                                {historyPlayers.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="history-level">
                            <span className="kpi-label kpi-label-left">Cancha</span>
                            <select className="select-elite" value={historyCourtFilter} onChange={(e) => setHistoryCourtFilter(e.target.value)}>
                                <option value="all">Cualquiera</option>
                                {historyCourtOptions.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="history-list">
                        {filteredHistory.length === 0 ? (
                            <p className="empty-state history-empty">No hay partidos para estos filtros.</p>
                        ) : (
                            filteredHistory.map((r) => (
                                <ReservationCard
                                    key={r.id}
                                    reservation={r}
                                    currentUser={currentUser}
                                    onOpen={onOpenReservation}
                                    isExpanded={expandedReservationId === r.id}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </section>
    );
};
