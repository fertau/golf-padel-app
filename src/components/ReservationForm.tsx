import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Court, Group, User, Venue } from "../lib/types";
import { triggerHaptic } from "../lib/utils";

type Props = {
  currentUser: User;
  groups: Group[];
  venues: Venue[];
  courts: Court[];
  defaultGroupId?: string;
  onCreate: (payload: {
    groupId: string;
    groupName?: string;
    venueId?: string;
    venueName?: string;
    venueAddress?: string;
    venueMapsUrl?: string;
    courtId?: string;
    courtName: string;
    startDateTime: string;
    durationMinutes: number;
  }) => void;
  onCancel: () => void;
};

const SUGGESTED_TIMES = ["17:00", "18:30", "20:00"] as const;

const getTodayLocalDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isHalfHourSlot = (time: string): boolean => {
  const parts = time.split(":");
  if (parts.length !== 2) return false;
  const minute = Number(parts[1]);
  return minute === 0 || minute === 30;
};

export default function ReservationForm({
  onCreate,
  onCancel,
  currentUser,
  groups,
  venues,
  courts,
  defaultGroupId
}: Props) {
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? "");
  const [useNewVenue, setUseNewVenue] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [newVenueName, setNewVenueName] = useState("");
  const [newVenueAddress, setNewVenueAddress] = useState("");
  const [newVenueMapsUrl, setNewVenueMapsUrl] = useState("");
  const [useNewCourt, setUseNewCourt] = useState(false);
  const [selectedCourtId, setSelectedCourtId] = useState("");
  const [newCourtName, setNewCourtName] = useState("Cancha 1");
  const [reservationDate, setReservationDate] = useState(getTodayLocalDate());
  const [selectedTime, setSelectedTime] = useState<(typeof SUGGESTED_TIMES)[number]>("17:00");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState("17:00");
  const [durationMinutes, setDurationMinutes] = useState(90);

  const selectedGroup = useMemo(() => groups.find((group) => group.id === groupId) ?? null, [groups, groupId]);

  const availableVenues = useMemo(() => {
    if (!selectedGroup) return [];
    return venues.filter((venue) => selectedGroup.venueIds.includes(venue.id));
  }, [venues, selectedGroup]);

  const selectedVenue = useMemo(
    () => availableVenues.find((venue) => venue.id === selectedVenueId) ?? null,
    [availableVenues, selectedVenueId]
  );

  const availableCourts = useMemo(() => {
    if (!selectedVenue) return [];
    return courts.filter((court) => court.venueId === selectedVenue.id);
  }, [courts, selectedVenue]);

  const selectedCourt = useMemo(
    () => availableCourts.find((court) => court.id === selectedCourtId) ?? null,
    [availableCourts, selectedCourtId]
  );

  useEffect(() => {
    if (!groupId && groups.length > 0) {
      setGroupId(defaultGroupId ?? groups[0].id);
    }
  }, [defaultGroupId, groupId, groups]);

  useEffect(() => {
    if (!selectedGroup) {
      setSelectedVenueId("");
      return;
    }
    if (availableVenues.length === 0) {
      setUseNewVenue(true);
      setSelectedVenueId("");
      return;
    }
    if (!availableVenues.some((venue) => venue.id === selectedVenueId)) {
      setSelectedVenueId(availableVenues[0].id);
    }
  }, [availableVenues, selectedGroup, selectedVenueId]);

  useEffect(() => {
    if (useNewVenue) {
      setUseNewCourt(true);
      setSelectedCourtId("");
      return;
    }
    if (!selectedVenue) {
      setSelectedCourtId("");
      return;
    }
    if (availableCourts.length === 0) {
      setUseNewCourt(true);
      setSelectedCourtId("");
      return;
    }
    if (!availableCourts.some((court) => court.id === selectedCourtId)) {
      setSelectedCourtId(availableCourts[0].id);
      setUseNewCourt(false);
    }
  }, [availableCourts, selectedCourtId, selectedVenue, useNewVenue]);

  const finalTime = useMemo(() => (useCustomTime ? customTime : selectedTime), [customTime, selectedTime, useCustomTime]);
  const hasValidTime = useMemo(() => isHalfHourSlot(finalTime), [finalTime]);
  const hasValidVenue = useNewVenue ? newVenueName.trim().length >= 2 : Boolean(selectedVenueId);
  const hasValidCourt = useNewCourt ? newCourtName.trim().length >= 2 : Boolean(selectedCourtId);
  const canSubmit = Boolean(groupId && hasValidTime && hasValidVenue && hasValidCourt && durationMinutes > 0);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !selectedGroup) return;

    const computedCourtName = useNewCourt
      ? newCourtName.trim()
      : selectedCourt?.name ?? "Cancha 1";

    onCreate({
      groupId: selectedGroup.id,
      groupName: selectedGroup.name,
      venueId: useNewVenue ? undefined : selectedVenue?.id,
      venueName: useNewVenue ? newVenueName.trim() : selectedVenue?.name,
      venueAddress: useNewVenue ? newVenueAddress.trim() : selectedVenue?.address,
      venueMapsUrl: useNewVenue ? newVenueMapsUrl.trim() : selectedVenue?.mapsUrl,
      courtId: useNewCourt ? undefined : selectedCourt?.id,
      courtName: computedCourtName,
      startDateTime: `${reservationDate}T${finalTime}`,
      durationMinutes
    });
    triggerHaptic("medium");
  };

  const handleChoiceHaptic = (action: () => void) => {
    action();
    triggerHaptic("light");
  };

  return (
    <form className="elite-form" onSubmit={handleSubmit}>
      <header className="form-header-elite">
        <h2>Reservá un partido</h2>
        <p>{currentUser.name}, elegí grupo, complejo y turno.</p>
      </header>

      <div className="elite-field-group">
        <label className="elite-field-label">Grupo</label>
        <select
          className="elite-select"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          required
        >
          {groups.length === 0 ? <option value="">Sin grupos</option> : null}
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      <div className="elite-field-group">
        <label className="elite-field-label">Complejo</label>
        <div className="quick-chip-row">
          <button
            type="button"
            className={`quick-chip ${!useNewVenue ? "active" : ""}`}
            onClick={() => handleChoiceHaptic(() => setUseNewVenue(false))}
          >
            Guardado
          </button>
          <button
            type="button"
            className={`quick-chip ${useNewVenue ? "active" : ""}`}
            onClick={() => handleChoiceHaptic(() => setUseNewVenue(true))}
          >
            Nuevo complejo
          </button>
        </div>

        {useNewVenue ? (
          <div className="history-level">
            <input
              type="text"
              className="elite-input"
              placeholder="Nombre del complejo"
              value={newVenueName}
              onChange={(event) => setNewVenueName(event.target.value)}
              required
            />
            <input
              type="text"
              className="elite-input"
              placeholder="Dirección"
              value={newVenueAddress}
              onChange={(event) => setNewVenueAddress(event.target.value)}
            />
            <input
              type="url"
              className="elite-input"
              placeholder="Link de Google Maps (opcional)"
              value={newVenueMapsUrl}
              onChange={(event) => setNewVenueMapsUrl(event.target.value)}
            />
          </div>
        ) : (
          <select
            className="elite-select"
            value={selectedVenueId}
            onChange={(event) => setSelectedVenueId(event.target.value)}
            required
          >
            {availableVenues.length === 0 ? <option value="">No hay complejos en el grupo</option> : null}
            {availableVenues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="elite-field-group">
        <label className="elite-field-label">Cancha</label>
        <div className="quick-chip-row">
          <button
            type="button"
            className={`quick-chip ${!useNewCourt ? "active" : ""}`}
            onClick={() => handleChoiceHaptic(() => setUseNewCourt(false))}
          >
            Guardada
          </button>
          <button
            type="button"
            className={`quick-chip ${useNewCourt ? "active" : ""}`}
            onClick={() => handleChoiceHaptic(() => setUseNewCourt(true))}
          >
            Nueva cancha
          </button>
        </div>

        {useNewCourt ? (
          <input
            type="text"
            className="elite-input"
            value={newCourtName}
            onChange={(event) => setNewCourtName(event.target.value)}
            placeholder="Ej: Cancha 1"
            required
          />
        ) : (
          <select
            className="elite-select"
            value={selectedCourtId}
            onChange={(event) => setSelectedCourtId(event.target.value)}
            required
          >
            {availableCourts.length === 0 ? <option value="">No hay canchas cargadas</option> : null}
            {availableCourts.map((court) => (
              <option key={court.id} value={court.id}>
                {court.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="elite-field-group">
        <label className="elite-field-label">Fecha del turno</label>
        <input type="date" className="elite-input" value={reservationDate} onChange={(e) => setReservationDate(e.target.value)} required />
      </div>

      <div className="elite-field-group">
        <label className="elite-field-label">Horario</label>
        <div className="elite-choice-grid times">
          {SUGGESTED_TIMES.map((time) => (
            <button
              key={time}
              type="button"
              className={`elite-btn-choice ${selectedTime === time && !useCustomTime ? "active" : ""}`}
              onClick={() =>
                handleChoiceHaptic(() => {
                  setUseCustomTime(false);
                  setSelectedTime(time);
                })
              }
            >
              {time}
            </button>
          ))}
          <button
            type="button"
            className={`elite-btn-choice icon-btn ${useCustomTime ? "active" : ""}`}
            onClick={() => handleChoiceHaptic(() => setUseCustomTime(!useCustomTime))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            Otro
          </button>
        </div>
      </div>

      {useCustomTime && (
        <div className="elite-field-group animate-in">
          <label className="elite-field-label">Horario específico (00 o 30 min)</label>
          <input type="time" className="elite-input" value={customTime} onChange={(e) => setCustomTime(e.target.value)} step={1800} required />
          {!hasValidTime && <p className="elite-error">El horario debe ser en bloques de 30 min.</p>}
        </div>
      )}

      <div className="elite-field-group">
        <label className="elite-field-label">Duración</label>
        <select className="elite-select" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
          <option value={60}>60 minutos</option>
          <option value={90}>90 minutos</option>
          <option value={120}>120 minutos</option>
        </select>
      </div>

      <footer className="form-actions-elite">
        <button type="submit" className="btn-primary-elite" disabled={!canSubmit}>Confirmar reserva</button>
        <button type="button" className="btn-ghost-elite" onClick={onCancel}>Cancelar</button>
      </footer>
    </form>
  );
}
