import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Court, Group, Venue } from "../lib/types";
import { canSearchGooglePlaces, searchGooglePlaces, type GooglePlaceCandidate } from "../lib/places";
import { triggerHaptic } from "../lib/utils";

type Props = {
  groups: Group[];
  venues: Venue[];
  courts: Court[];
  defaultGroupId?: string;
  onCreate: (payload: {
    groupId?: string;
    groupName?: string;
    visibilityScope?: "group" | "link_only";
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

const SUGGESTED_TIMES = ["17:00", "18:30", "20:00", "21:30"] as const;
const NEW_BADGE = "Nuevo";
const LINK_ONLY_GROUP_VALUE = "__link_only__";

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
  groups,
  venues,
  courts,
  defaultGroupId
}: Props) {
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? LINK_ONLY_GROUP_VALUE);
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
  const linkOnlyMode = groupId === LINK_ONLY_GROUP_VALUE;

  const availableVenues = useMemo(() => {
    if (linkOnlyMode) return venues;
    if (!selectedGroup) return [];
    return venues.filter((venue) => selectedGroup.venueIds.includes(venue.id));
  }, [venues, selectedGroup, linkOnlyMode]);

  const globalVenues = useMemo(() => {
    if (linkOnlyMode) return [];
    if (!selectedGroup) return [];
    return venues.filter((venue) => !selectedGroup.venueIds.includes(venue.id));
  }, [venues, selectedGroup, linkOnlyMode]);

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
    if (!groupId) {
      setGroupId(defaultGroupId ?? groups[0]?.id ?? LINK_ONLY_GROUP_VALUE);
      return;
    }
    if (groupId !== LINK_ONLY_GROUP_VALUE && !groups.some((group) => group.id === groupId)) {
      setGroupId(defaultGroupId ?? groups[0]?.id ?? LINK_ONLY_GROUP_VALUE);
    }
  }, [defaultGroupId, groupId, groups]);

  useEffect(() => {
    if (!selectedGroup) return;
    if (!selectedVenueId) return;
    const existsInGroup = availableVenues.some((venue) => venue.id === selectedVenueId);
    if (!existsInGroup) {
      setSelectedVenueId("");
      setVenueQuery("");
      setVenueAddress("");
      setVenueMapsUrl("");
      setSelectedCourtId("");
      setCourtQuery("");
    }
  }, [availableVenues, selectedGroup, selectedVenueId]);

  useEffect(() => {
    if (!selectedVenue) {
      setSelectedCourtId("");
      setCourtQuery("");
      return;
    }
    if (!selectedCourtId) return;
    const existsInVenue = availableCourts.some((court) => court.id === selectedCourtId);
    if (!existsInVenue) {
      setSelectedCourtId("");
      setCourtQuery("");
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
  const showVenueSuggestions = Boolean(venueQuery.trim()) && !selectedVenueId;
  const showCourtSuggestions = Boolean(courtQuery.trim()) && !selectedCourtId;

  const hasValidVenue = Boolean(selectedVenueId || venueQuery.trim().length >= 2);
  const canSubmit = Boolean(hasValidTime && hasValidVenue && durationMinutes > 0);

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
    if (!canSubmit) return;

    const venueId = selectedVenueId || matchedVenueByName?.id;
    const finalVenueName = venueId ? matchedVenueByName?.name ?? selectedVenue?.name : venueQuery.trim();
    const finalVenueAddress = venueId ? matchedVenueByName?.address ?? selectedVenue?.address : venueAddress.trim();
    const finalVenueMapsUrl = venueId ? matchedVenueByName?.mapsUrl ?? selectedVenue?.mapsUrl : venueMapsUrl.trim();

    const courtId = selectedCourtId || matchedCourtByName?.id;
    const finalCourtName = courtId ? matchedCourtByName?.name ?? courtQuery.trim() : courtQuery.trim();

    onCreate({
      groupId: linkOnlyMode ? undefined : selectedGroup?.id,
      groupName: linkOnlyMode ? undefined : selectedGroup?.name,
      visibilityScope: linkOnlyMode ? "link_only" : "group",
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
      <header className="form-header-elite animate-fade-in">
        <h2>Reservá un partido</h2>
        <p>Elegí grupo o modo por link, complejo y turno.</p>
      </header>

      <div className="elite-field-group">
        <label className="elite-field-label">Grupo</label>
        <select className="elite-select" value={groupId} onChange={(event) => setGroupId(event.target.value)} required>
          <option value={LINK_ONLY_GROUP_VALUE}>Solo por link</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        {linkOnlyMode ? <p className="private-hint">Esta reserva no aparece en Home grupal, solo por link.</p> : null}
      </div>

      <div className="elite-field-group">
        <label className="elite-field-label">Complejo</label>
        {recentVenues.length > 0 ? (
          <>
            <span className="elite-field-subtitle">Frecuentes</span>
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
          </>
        ) : null}

        <div className="autocomplete-shell">
          <input
            type="text"
            className="input-elite"
            placeholder="Nombre del complejo"
            value={venueQuery}
            onChange={(event) => {
              setVenueQuery(event.target.value);
              setSelectedVenueId("");
            }}
          />
          {creatingNewVenue ? <span className="quick-chip-badge-elite">+ {NEW_BADGE}</span> : null}
        </div>

        {showVenueSuggestions && venueSuggestions.length > 0 ? (
          <div className="autocomplete-list-elite animate-fade-in">
            {venueSuggestions.map((venue) => (
              <button
                key={`venue-suggestion-${venue.id}`}
                type="button"
                className="autocomplete-row-elite"
                onClick={() => chooseVenueSuggestion(venue)}
              >
                <div className="suggestion-main">
                  <strong>{venue.name}</strong>
                  <small>{venue.address}</small>
                </div>
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
          <>
            <span className="elite-field-subtitle">Frecuentes</span>
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
          </>
        ) : null}

        <div className="autocomplete-shell">
          <input
            type="text"
            className="input-elite"
            placeholder="Escribí la cancha o dejalo vacío"
            value={courtQuery}
            onChange={(event) => {
              setCourtQuery(event.target.value);
              setSelectedCourtId("");
            }}
          />
          {creatingNewCourt ? <span className="quick-chip-badge-elite">+ {NEW_BADGE}</span> : null}
        </div>

        {showCourtSuggestions && courtSuggestions.length > 0 ? (
          <div className="autocomplete-list-elite animate-fade-in">
            {courtSuggestions.map((court) => (
              <button
                key={`court-suggestion-${court.id}`}
                type="button"
                className="autocomplete-row-elite"
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
        <input type="date" className="input-elite" value={reservationDate} onChange={(e) => setReservationDate(e.target.value)} required />
      </div>

      <div className="elite-field-group">
        <label className="elite-field-label">Horario</label>
        <div className="quick-chip-row quick-chip-row-tight">
          {SUGGESTED_TIMES.map((time) => (
            <button
              key={time}
              type="button"
              className={`quick-chip ${selectedTime === time && !useCustomTime ? "active" : ""}`}
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
            className={`quick-chip ${useCustomTime ? "active" : ""}`}
            onClick={() => handleChoiceHaptic(() => setUseCustomTime(!useCustomTime))}
          >
            Otro
          </button>
        </div>
      </div>

      {useCustomTime ? (
        <div className="elite-field-group animate-fade-in">
          <label className="elite-field-label">Horario específico (00 o 30 min)</label>
          <input type="time" className="input-elite" value={customTime} onChange={(e) => setCustomTime(e.target.value)} step={1800} required />
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
        <button type="submit" className="btn-elite btn-elite-accent btn-block" disabled={!canSubmit}>Confirmar reserva</button>
        <button type="button" className="btn-elite btn-elite-outline btn-block" onClick={onCancel}>Cancelar</button>
      </footer>
    </form>
  );
}
