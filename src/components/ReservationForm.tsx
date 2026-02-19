import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Court, Group, User, Venue } from "../lib/types";
import { canSearchGooglePlaces, searchGooglePlaces, type GooglePlaceCandidate } from "../lib/places";
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
    courtName?: string;
    startDateTime: string;
    durationMinutes: number;
  }) => void;
  onCancel: () => void;
};

const SUGGESTED_TIMES = ["17:00", "18:30", "20:00"] as const;
const NEW_BADGE = "Nuevo";

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

const normalize = (value: string) => value.trim().toLowerCase();

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
  const [venueQuery, setVenueQuery] = useState("");
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueMapsUrl, setVenueMapsUrl] = useState("");
  const [mapsResults, setMapsResults] = useState<GooglePlaceCandidate[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);

  const [courtQuery, setCourtQuery] = useState("");
  const [selectedCourtId, setSelectedCourtId] = useState("");

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

  const globalVenues = useMemo(() => {
    if (!selectedGroup) return [];
    return venues.filter((venue) => !selectedGroup.venueIds.includes(venue.id));
  }, [venues, selectedGroup]);

  const venueSuggestions = useMemo(() => {
    const source = [...availableVenues, ...globalVenues];
    const query = normalize(venueQuery);
    const ranked = source
      .filter((venue) => (query.length === 0 ? true : normalize(venue.name).includes(query)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return ranked.slice(0, 6);
  }, [availableVenues, globalVenues, venueQuery]);

  const recentVenues = useMemo(
    () => availableVenues.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4),
    [availableVenues]
  );

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? null,
    [venues, selectedVenueId]
  );

  const availableCourts = useMemo(() => {
    if (!selectedVenue) return [];
    return courts
      .filter((court) => court.venueId === selectedVenue.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [courts, selectedVenue]);

  const courtSuggestions = useMemo(() => {
    const query = normalize(courtQuery);
    return availableCourts
      .filter((court) => (query.length === 0 ? true : normalize(court.name).includes(query)))
      .slice(0, 6);
  }, [availableCourts, courtQuery]);

  const recentCourts = useMemo(() => availableCourts.slice(0, 4), [availableCourts]);

  useEffect(() => {
    if (!groupId && groups.length > 0) {
      setGroupId(defaultGroupId ?? groups[0].id);
    }
  }, [defaultGroupId, groupId, groups]);

  useEffect(() => {
    if (!selectedGroup) return;
    if (availableVenues.length === 0) {
      setSelectedVenueId("");
      setVenueQuery("");
      return;
    }
    if (!selectedVenueId) {
      const first = availableVenues[0];
      setSelectedVenueId(first.id);
      setVenueQuery(first.name);
      setVenueAddress(first.address ?? "");
      setVenueMapsUrl(first.mapsUrl ?? "");
    }
  }, [availableVenues, selectedGroup, selectedVenueId]);

  useEffect(() => {
    if (!selectedVenue) {
      setSelectedCourtId("");
      setCourtQuery("");
      return;
    }
    if (availableCourts.length === 0) {
      setSelectedCourtId("");
      setCourtQuery("");
      return;
    }
    if (!selectedCourtId) {
      const first = availableCourts[0];
      setSelectedCourtId(first.id);
      setCourtQuery(first.name);
    }
  }, [availableCourts, selectedCourtId, selectedVenue]);

  const finalTime = useMemo(() => (useCustomTime ? customTime : selectedTime), [customTime, selectedTime, useCustomTime]);
  const hasValidTime = useMemo(() => isHalfHourSlot(finalTime), [finalTime]);

  const matchedVenueByName = useMemo(
    () => venues.find((venue) => normalize(venue.name) === normalize(venueQuery)),
    [venues, venueQuery]
  );

  const matchedCourtByName = useMemo(
    () => availableCourts.find((court) => normalize(court.name) === normalize(courtQuery)),
    [availableCourts, courtQuery]
  );

  const creatingNewVenue = Boolean(venueQuery.trim()) && !matchedVenueByName;
  const creatingNewCourt = Boolean(courtQuery.trim()) && !matchedCourtByName;

  const hasValidVenue = Boolean(selectedVenueId || venueQuery.trim().length >= 2);
  const canSubmit = Boolean(groupId && hasValidTime && hasValidVenue && durationMinutes > 0);

  const handleSearchMaps = async () => {
    if (!canSearchGooglePlaces()) {
      alert("Configurá VITE_GOOGLE_MAPS_API_KEY para usar búsqueda de complejos.");
      return;
    }
    if (venueQuery.trim().length < 3) return;
    try {
      setMapsLoading(true);
      const candidates = await searchGooglePlaces(venueQuery);
      setMapsResults(candidates);
    } catch (error) {
      alert((error as Error).message);
      setMapsResults([]);
    } finally {
      setMapsLoading(false);
    }
  };

  const applyMapsCandidate = (candidate: GooglePlaceCandidate) => {
    setVenueQuery(candidate.name);
    setVenueAddress(candidate.address);
    setVenueMapsUrl(candidate.mapsUrl ?? "");
    setSelectedVenueId("");
    triggerHaptic("light");
  };

  const chooseVenueSuggestion = (venue: Venue) => {
    setSelectedVenueId(venue.id);
    setVenueQuery(venue.name);
    setVenueAddress(venue.address ?? "");
    setVenueMapsUrl(venue.mapsUrl ?? "");
    setMapsResults([]);
    triggerHaptic("light");
  };

  const chooseCourtSuggestion = (court: Court) => {
    setSelectedCourtId(court.id);
    setCourtQuery(court.name);
    triggerHaptic("light");
  };

  const clearCourt = () => {
    setSelectedCourtId("");
    setCourtQuery("");
    triggerHaptic("light");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !selectedGroup) return;

    const venueId = selectedVenueId || matchedVenueByName?.id;
    const finalVenueName = venueId ? matchedVenueByName?.name ?? selectedVenue?.name : venueQuery.trim();
    const finalVenueAddress = venueId ? matchedVenueByName?.address ?? selectedVenue?.address : venueAddress.trim();
    const finalVenueMapsUrl = venueId ? matchedVenueByName?.mapsUrl ?? selectedVenue?.mapsUrl : venueMapsUrl.trim();

    const courtId = selectedCourtId || matchedCourtByName?.id;
    const finalCourtName = courtId ? matchedCourtByName?.name ?? courtQuery.trim() : courtQuery.trim();

    onCreate({
      groupId: selectedGroup.id,
      groupName: selectedGroup.name,
      venueId: venueId || undefined,
      venueName: finalVenueName,
      venueAddress: finalVenueAddress,
      venueMapsUrl: finalVenueMapsUrl,
      courtId: courtId || undefined,
      courtName: finalCourtName || undefined,
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
        <select className="elite-select" value={groupId} onChange={(event) => setGroupId(event.target.value)} required>
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
        {recentVenues.length > 0 ? (
          <div className="quick-chip-row">
            {recentVenues.map((venue) => (
              <button
                key={`recent-venue-${venue.id}`}
                type="button"
                className={`quick-chip ${selectedVenueId === venue.id ? "active" : ""}`}
                onClick={() => chooseVenueSuggestion(venue)}
              >
                {venue.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="autocomplete-shell">
          <input
            type="text"
            className="elite-input"
            placeholder="Escribí el nombre del complejo"
            value={venueQuery}
            onChange={(event) => {
              setVenueQuery(event.target.value);
              setSelectedVenueId("");
            }}
            required
          />
          {creatingNewVenue ? <span className="quick-chip autocomplete-new">+ {NEW_BADGE}</span> : null}
        </div>

        {venueSuggestions.length > 0 ? (
          <div className="autocomplete-list">
            {venueSuggestions.map((venue) => (
              <button
                key={`venue-suggestion-${venue.id}`}
                type="button"
                className="autocomplete-row"
                onClick={() => chooseVenueSuggestion(venue)}
              >
                <strong>{venue.name}</strong>
                <small>{venue.address}</small>
              </button>
            ))}
          </div>
        ) : null}

        {creatingNewVenue ? (
          <div className="history-level">
            <div className="quick-chip-row">
              <button
                type="button"
                className="quick-chip active"
                onClick={handleSearchMaps}
                disabled={mapsLoading || venueQuery.trim().length < 3}
              >
                {mapsLoading ? "Buscando..." : "Buscar en Maps"}
              </button>
            </div>
            {mapsResults.length > 0 ? (
              <div className="autocomplete-list">
                {mapsResults.map((candidate) => (
                  <button
                    key={candidate.googlePlaceId}
                    type="button"
                    className="autocomplete-row"
                    onClick={() => applyMapsCandidate(candidate)}
                  >
                    <strong>{candidate.name}</strong>
                    <small>{candidate.address}</small>
                  </button>
                ))}
              </div>
            ) : null}
            <input
              type="text"
              className="elite-input"
              placeholder="Dirección (opcional)"
              value={venueAddress}
              onChange={(event) => setVenueAddress(event.target.value)}
            />
            <input
              type="url"
              className="elite-input"
              placeholder="Link de Google Maps (opcional)"
              value={venueMapsUrl}
              onChange={(event) => setVenueMapsUrl(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      <div className="elite-field-group">
        <label className="elite-field-label">Cancha (opcional)</label>
        {recentCourts.length > 0 ? (
          <div className="quick-chip-row">
            {recentCourts.map((court) => (
              <button
                key={`recent-court-${court.id}`}
                type="button"
                className={`quick-chip ${selectedCourtId === court.id ? "active" : ""}`}
                onClick={() => chooseCourtSuggestion(court)}
              >
                {court.name}
              </button>
            ))}
            <button type="button" className="quick-chip" onClick={clearCourt}>
              Sin cancha
            </button>
          </div>
        ) : null}

        <div className="autocomplete-shell">
          <input
            type="text"
            className="elite-input"
            placeholder="Escribí la cancha o dejalo vacío"
            value={courtQuery}
            onChange={(event) => {
              setCourtQuery(event.target.value);
              setSelectedCourtId("");
            }}
          />
          {creatingNewCourt ? <span className="quick-chip autocomplete-new">+ {NEW_BADGE}</span> : null}
        </div>

        {courtSuggestions.length > 0 ? (
          <div className="autocomplete-list">
            {courtSuggestions.map((court) => (
              <button
                key={`court-suggestion-${court.id}`}
                type="button"
                className="autocomplete-row"
                onClick={() => chooseCourtSuggestion(court)}
              >
                <strong>{court.name}</strong>
              </button>
            ))}
          </div>
        ) : null}
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

      {useCustomTime ? (
        <div className="elite-field-group animate-in">
          <label className="elite-field-label">Horario específico (00 o 30 min)</label>
          <input type="time" className="elite-input" value={customTime} onChange={(e) => setCustomTime(e.target.value)} step={1800} required />
          {!hasValidTime ? <p className="elite-error">El horario debe ser en bloques de 30 min.</p> : null}
        </div>
      ) : null}

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
