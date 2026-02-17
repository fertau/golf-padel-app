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
        <div className="reservation-card skeleton-card">
            <div className="reservation-header">
                <Skeleton width="40%" height="1.2rem" />
                <Skeleton width="70%" height="1.6rem" />
            </div>
            <div className="meta" style={{ display: 'flex', gap: '8px' }}>
                <Skeleton width="80px" height="1.5rem" borderRadius="20px" />
                <Skeleton width="60px" height="1.5rem" borderRadius="20px" />
            </div>
        </div>
    );
}
