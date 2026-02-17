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
        <div className="panel reservation-card skeleton-card">
            <div className="reservation-header">
                <Skeleton width="60%" height="24px" />
                <Skeleton width="30%" height="20px" />
            </div>
            <div className="reservation-footer">
                <div className="players-avatars">
                    {[1, 2, 3, 4].map(i => (
                        <Skeleton key={i} width="32px" height="32px" borderRadius="50%" />
                    ))}
                </div>
                <Skeleton width="80px" height="32px" borderRadius="20px" />
            </div>
        </div>
    );
}
