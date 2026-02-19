import React from "react";

type QuickDateFilter = "all" | "hoy" | "manana" | "semana";

type Props = {
    currentFilter: QuickDateFilter;
    onFilterChange: (filter: QuickDateFilter) => void;
};

export const FilterBar: React.FC<Props> = ({ currentFilter, onFilterChange }) => {
    const filters: { id: QuickDateFilter; label: string }[] = [
        { id: "all", label: "Todos" },
        { id: "hoy", label: "Hoy" },
        { id: "manana", label: "Mañana" },
        { id: "semana", label: "Semana" },
    ];

    return (
        <div className="quick-chip-row filter-bar-elite animate-fade-in">
            {filters.map(({ id, label }) => (
                <button
                    key={id}
                    className={`quick-chip ${currentFilter === id ? "active" : ""}`}
                    onClick={() => onFilterChange(id)}
                >
                    {label}
                </button>
            ))}
        </div>
    );
};
