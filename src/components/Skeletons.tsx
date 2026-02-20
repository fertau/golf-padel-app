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
        <div className="reservation-card-elite skeleton-card-elite">
            <div className="card-date-column-elite">
                <Skeleton width="30px" height="8px" borderRadius="4px" />
                <Skeleton width="40px" height="24px" borderRadius="6px" />
            </div>
            <div className="reservation-card-main">
                <div className="card-content-top">
                    <Skeleton width="80px" height="24px" borderRadius="6px" />
                    <Skeleton width="70px" height="20px" borderRadius="8px" />
                </div>
                <div className="card-content-bottom">
                    <div className="player-stats">
                        <div className="avatar-stack">
                            {[1, 2, 3].map(i => (
                                <Skeleton key={i} width="32px" height="32px" borderRadius="11px" className="mini-avatar-sk" />
                            ))}
                        </div>
                        <Skeleton width="40px" height="12px" borderRadius="4px" />
                    </div>
                    <Skeleton width="50px" height="24px" borderRadius="10px" />
                </div>
            </div>
        </div>
    );
}
