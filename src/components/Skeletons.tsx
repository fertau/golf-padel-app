export function Skeleton({ className, width, height, borderRadius = "4px" }: { className?: string, width?: string | number, height?: string | number, borderRadius?: string }) {
    return (
        <div
            className={`skeleton-base ${className || ""}`}
            style={{ width, height, borderRadius }}
        />
    );
}

export function ReservationSkeleton() {
    return (
        <div className="upcoming-row skeleton-card-elite" style={{ gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <Skeleton width="56px" height="16px" borderRadius="6px" />
                    <Skeleton width="100px" height="18px" borderRadius="6px" />
                </div>
                <Skeleton width="60px" height="28px" borderRadius="8px" />
            </div>
            <Skeleton width="140px" height="14px" borderRadius="6px" />
            <div style={{ display: "flex", gap: "6px" }}>
                {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} width="32px" height="32px" borderRadius="10px" />
                ))}
            </div>
        </div>
    );
}
