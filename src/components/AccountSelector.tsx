import { FormEvent, useMemo, useState } from "react";
import type { AccountProfile } from "../lib/authApi";
import PinInput from "./PinInput";

type Mode = "home" | "search" | "pin" | "create-name" | "create-pin";

type Props = {
  rememberedAccounts: AccountProfile[];
  onForgetRemembered: (id: string) => void;
  onSearchExact: (name: string) => Promise<AccountProfile | null>;
  onLogin: (playerId: string, pin: string) => Promise<void>;
  onCreate: (name: string, pin: string) => Promise<{ redirectedToLogin: boolean; player: AccountProfile }>;
};

export default function AccountSelector({
  rememberedAccounts,
  onForgetRemembered,
  onSearchExact,
  onLogin,
  onCreate
}: Props) {
  const [mode, setMode] = useState<Mode>("home");
  const [queryName, setQueryName] = useState("");
  const [pin, setPin] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPin, setCreatePin] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<AccountProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remembered = useMemo(() => rememberedAccounts, [rememberedAccounts]);

  const resetPinState = () => {
    setPin("");
    setCreatePin("");
  };

  const goHome = () => {
    setMode("home");
    setError(null);
    setMessage(null);
    resetPinState();
  };

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!queryName.trim()) {
      setError("Ingresá un nombre exacto.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const profile = await onSearchExact(queryName);
      if (!profile) {
        setError("No encontramos ese usuario.");
        return;
      }
      setSelectedAccount(profile);
      setMode("pin");
      setPin("");
    } catch (searchError) {
      setError((searchError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async () => {
    if (!selectedAccount) {
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onLogin(selectedAccount.id, pin);
      resetPinState();
    } catch (loginError) {
      setError((loginError as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const submitCreateName = async (event: FormEvent) => {
    event.preventDefault();
    if (!createName.trim()) {
      setError("Ingresá un nombre.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const existing = await onSearchExact(createName.trim());
      if (existing) {
        setSelectedAccount(existing);
        setMode("pin");
        setMessage("Ese nombre ya existe. Ingresá tu PIN para entrar.");
        return;
      }
      setMode("create-pin");
    } catch (searchError) {
      setError((searchError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCreatePin = async () => {
    if (!/^\d{4}$/.test(createPin)) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await onCreate(createName.trim(), createPin);
      if (result.redirectedToLogin) {
        setSelectedAccount(result.player);
        setMode("pin");
        setPin("");
        setMessage("Ese nombre ya existía. Entrá con PIN.");
        return;
      }
      resetPinState();
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app mobile-shell">
      <section className="panel account-selector">
        <h2>Acceso</h2>
        <p className="private-hint">Entrá con tu cuenta y PIN.</p>

        {mode === "home" ? (
          <>
            <h3>Cuentas recordadas</h3>
            <div className="account-grid">
              {remembered.length === 0 ? <p className="private-hint">No hay cuentas recordadas.</p> : null}
              {remembered.map((account) => (
                <article key={account.id} className="account-card">
                  <button
                    type="button"
                    className="account-open"
                    onClick={() => {
                      setSelectedAccount(account);
                      setMode("pin");
                      setPin("");
                      setError(null);
                    }}
                  >
                    <strong>{account.name}</strong>
                    <span>{account.avatar || "Perfil"}</span>
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onForgetRemembered(account.id)}
                  >
                    Quitar
                  </button>
                </article>
              ))}
            </div>
            <div className="actions">
              <button type="button" onClick={() => setMode("create-name")}>
                Crear perfil
              </button>
              <button type="button" onClick={() => setMode("search")}>
                Ya tengo cuenta / Buscar
              </button>
            </div>
          </>
        ) : null}

        {mode === "search" ? (
          <form className="panel account-panel" onSubmit={submitSearch}>
            <h3>Buscar usuario</h3>
            <label>
              Nombre exacto
              <input value={queryName} onChange={(event) => setQueryName(event.target.value)} />
            </label>
            <div className="actions">
              <button type="submit" disabled={busy}>
                Buscar
              </button>
              <button type="button" className="link-btn" onClick={goHome}>
                Volver
              </button>
            </div>
          </form>
        ) : null}

        {mode === "pin" && selectedAccount ? (
          <section className="panel account-panel">
            <h3>{selectedAccount.name}</h3>
            <p className="private-hint">Ingresá tu PIN de 4 dígitos.</p>
            <PinInput value={pin} onChange={setPin} disabled={busy} />
            <div className="actions">
              <button type="button" onClick={submitLogin} disabled={pin.length !== 4 || busy}>
                Ingresar
              </button>
              <button type="button" className="link-btn" onClick={goHome}>
                Volver
              </button>
            </div>
          </section>
        ) : null}

        {mode === "create-name" ? (
          <form className="panel account-panel" onSubmit={submitCreateName}>
            <h3>Crear perfil</h3>
            <label>
              Nombre
              <input value={createName} onChange={(event) => setCreateName(event.target.value)} />
            </label>
            <div className="actions">
              <button type="submit" disabled={busy}>
                Continuar
              </button>
              <button type="button" className="link-btn" onClick={goHome}>
                Volver
              </button>
            </div>
          </form>
        ) : null}

        {mode === "create-pin" ? (
          <section className="panel account-panel">
            <h3>Definí tu PIN</h3>
            <p className="private-hint">Cuenta: {createName}</p>
            <PinInput value={createPin} onChange={setCreatePin} disabled={busy} />
            <div className="actions">
              <button type="button" onClick={submitCreatePin} disabled={createPin.length !== 4 || busy}>
                Crear cuenta
              </button>
              <button type="button" className="link-btn" onClick={goHome}>
                Volver
              </button>
            </div>
          </section>
        ) : null}

        {message ? <p className="private-hint">{message}</p> : null}
        {error ? <p className="warning">{error}</p> : null}
      </section>
    </main>
  );
}
