/**
 * Lista de modelos seleccionables al administrar una inteligencia.
 */
export type ModelPickOption = {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
};

type Props = {
  options: ModelPickOption[];
  value: string;
  disabled?: boolean;
  onChange: (modelId: string) => void;
  /** Si false, solo muestra el valor (Cloud gestionado). */
  selectable?: boolean;
  managedLabel?: string;
  managedHint?: string;
};

export function IntelligenceModelSection({
  options,
  value,
  disabled,
  onChange,
  selectable = true,
  managedLabel,
  managedHint,
}: Props) {
  const selected = options.find((o) => o.id === value) || options[0];

  return (
    <section className="intel-model-section" aria-label="Modelo">
      <p className="intel-kicker">Modelo</p>
      {!selectable ? (
        <div className="intel-model-managed">
          <strong>{managedLabel || "Seleccionado por Personal Agent"}</strong>
          {managedHint ? <p className="muted">{managedHint}</p> : null}
        </div>
      ) : (
        <>
          <p className="intel-model-current">
            <strong>{selected?.label || value}</strong>
          </p>
          <ul className="intel-model-list" role="listbox">
            {options.map((opt) => {
              const active = opt.id === (selected?.id || value);
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`intel-model-option${active ? " is-active" : ""}`}
                    disabled={disabled || opt.disabled}
                    onClick={() => onChange(opt.id)}
                  >
                    <span className="intel-model-option-text">
                      <strong>{opt.label}</strong>
                      {opt.hint ? (
                        <span className="muted">{opt.hint}</span>
                      ) : null}
                    </span>
                    {active ? (
                      <span className="intel-model-check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
