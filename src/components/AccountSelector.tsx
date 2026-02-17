import { FormEvent, useMemo, useState } from "react";
import type { LocalAccount } from "../lib/accounts";

type Props = {
  accounts: LocalAccount[];
  rememberedAccountIds: string[];
  onLogin: (accountId: string, pin: string) => void;
  onCreate: (name: string, pin: string) => void;
  onForget: (accountId: string) => void;
};

export default function AccountSelector({
  accounts,
  rememberedAccountIds,
  onLogin,
  onCreate,
  onForget
}: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [pinInput, setPinInput] = useState("");
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const orderedAccounts = useMemo(() => {
    const rememberedSet = new Set(rememberedAccountIds);
    const remembered = accounts.filter((account) => rememberedSet.has(account.id));
    const others = accounts.filter((account) => !rememberedSet.has(account.id));
    return [...remembered, ...others];
  }, [accounts, rememberedAccountIds]);

  const submitLogin = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedAccountId) {
      setError("Seleccioná una cuenta.");
      return;
    }
    if (!pinInput.trim()) {
      setError("Ingresá tu PIN.");
      return;
    }

    try {
      onLogin(selectedAccountId, pinInput.trim());
      setPinInput("");
      setError(null);
    } catch (loginError) {
      setError((loginError as Error).message);
    }
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    try {
      onCreate(newName, newPin);
      setNewName("");
      setNewPin("");
      setError(null);
    } catch (createError) {
      setError((createError as Error).message);
    }
  };

  return (
    <main className="app mobile-shell">
      <section className="panel account-selector">
        <h2>Elegí tu cuenta</h2>
        <p className="private-hint">Ingresás con PIN y queda recordada en este dispositivo.</p>

        <div className="account-grid">
          {orderedAccounts.map((account) => (
            <article key={account.id} className="account-card">
              <button
                type="button"
                className="account-open"
                onClick={() => setSelectedAccountId(account.id)}
              >
                <strong>{account.name}</strong>
                <span>{rememberedAccountIds.includes(account.id) ? "Recordada" : "No recordada"}</span>
              </button>
              <button type="button" className="link-btn" onClick={() => onForget(account.id)}>
                Olvidar en este dispositivo
              </button>
            </article>
          ))}
        </div>

        <form onSubmit={submitLogin} className="panel account-panel">
          <h3>Entrar con PIN</h3>
          <label>
            Cuenta
            <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
              <option value="">Seleccionar</option>
              {orderedAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              maxLength={6}
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              placeholder="4 a 6 dígitos"
            />
          </label>
          <button type="submit">Entrar</button>
        </form>

        <form onSubmit={submitCreate} className="panel account-panel">
          <h3>Crear perfil</h3>
          <label>
            Nombre
            <input value={newName} onChange={(event) => setNewName(event.target.value)} />
          </label>
          <label>
            PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              maxLength={6}
              value={newPin}
              onChange={(event) => setNewPin(event.target.value)}
              placeholder="4 a 6 dígitos"
            />
          </label>
          <button type="submit">Crear e ingresar</button>
        </form>

        {error ? <p className="warning">{error}</p> : null}
      </section>
    </main>
  );
}
