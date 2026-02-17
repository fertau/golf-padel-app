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
        <div className="reservation-card skeleton-card-elite">
            <div className="reservation-card-main">
                <div className="card-header">
                    <div className="card-title-group" style={{ width: '100px' }}>
                        <Skeleton width="40px" height="8px" borderRadius="4px" />
                        <Skeleton width="100px" height="20px" borderRadius="6px" />
                    </div>
                    <Skeleton width="80px" height="24px" borderRadius="10px" />
                </div>
                <div className="card-footer">
                    <div className="player-stats">
                        <div className="avatar-stack">
                            {[1, 2, 3].map(i => (
                                <Skeleton key={i} width="24px" height="24px" borderRadius="8px" className="mini-avatar-sk" />
                            ))}
                        </div>
                        <Skeleton width="60px" height="12px" borderRadius="4px" />
                    </div>
                    <Skeleton width="40px" height="24px" borderRadius="8px" />
                </div>
            </div>
        </div>
    );
}
