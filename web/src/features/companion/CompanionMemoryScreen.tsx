import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  IconActivity,
  IconFolder,
  IconMessage,
  IconMoon,
  IconPencil,
  IconPin,
  IconPlus,
  IconSearch,
  IconSun,
  IconTrash,
  IconUser,
  IconX,
} from "../../components/icons";
import { useCompanion } from "./CompanionContext";
import {
  MEMORY_UI_CATEGORIES,
  MEMORY_UI_LABELS,
  TIME_BUCKET_LABELS,
  TIME_BUCKET_ORDER,
  inferMemoryCategory,
  isNewMemory,
  memoryConfUi,
  memorySrc,
  relTime,
  sortMemoryRows,
  srcLabel,
  timeBucket,
  type MemorySrc,
  type TimeBucket,
} from "./policies/memoryUi";
import type { MemoryCategory, MemoryEntry } from "./types";

type Lens = "category" | "recent";
type ThemeMode = "dark" | "light";
type CatFilter = "ALL" | MemoryCategory;

function SrcIcon({ src, size = 14 }: { src: MemorySrc; size?: number }) {
  switch (src) {
    case "told":
      return <IconUser size={size} />;
    case "chat":
      return <IconMessage size={size} />;
    case "project":
      return <IconFolder size={size} />;
    case "activity":
      return <IconActivity size={size} />;
  }
}

function countLabel(n: number): string {
  return n === 1 ? "1 cosa" : `${n} cosas`;
}

export function CompanionMemoryScreen() {
  const {
    memory,
    forgetMemory,
    restoreMemory,
    rememberText,
    updateMemory,
  } = useCompanion();

  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [lens, setLens] = useState<Lens>("category");
  const [cat, setCat] = useState<CatFilter>("ALL");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState("");
  const [addCat, setAddCat] = useState<MemoryCategory>("PREFERENCES");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [undo, setUndo] = useState<{ id: string; text: string } | null>(null);
  const undoTimer = useRef<number | null>(null);

  const active = useMemo(
    () => memory.filter((m) => m.status === "ACTIVE"),
    [memory],
  );

  const counts = useMemo(() => {
    const map = Object.fromEntries(
      MEMORY_UI_CATEGORIES.map((c) => [c, 0]),
    ) as Record<MemoryCategory, number>;
    for (const m of active) map[m.category] = (map[m.category] || 0) + 1;
    return map;
  }, [active]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter((m) => {
      if (cat !== "ALL" && m.category !== cat) return false;
      if (!q) return true;
      const label = MEMORY_UI_LABELS[m.category].toLowerCase();
      return m.content.toLowerCase().includes(q) || label.includes(q);
    });
  }, [active, cat, query]);

  useEffect(() => {
    return () => {
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
    };
  }, []);

  function openAdd() {
    setAdding(true);
    setAddText("");
    setAddCat("PREFERENCES");
    setEditingId(null);
  }

  function onAddTextChange(text: string) {
    setAddText(text);
    if (text.trim()) setAddCat(inferMemoryCategory(text));
  }

  function submitAdd(e?: FormEvent) {
    e?.preventDefault();
    const text = addText.trim();
    if (!text) return;
    rememberText(text, { category: addCat, scope: "GLOBAL" });
    setAdding(false);
    setAddText("");
  }

  function startEdit(m: MemoryEntry) {
    setEditingId(m.id);
    setEditText(m.content);
    setAdding(false);
  }

  function saveEdit() {
    if (!editingId) return;
    const text = editText.trim();
    if (!text) return;
    updateMemory(editingId, { content: text });
    setEditingId(null);
  }

  function onEditKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditingId(null);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveEdit();
    }
  }

  function onForget(m: MemoryEntry) {
    forgetMemory(m.id);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setUndo({ id: m.id, text: m.content });
    undoTimer.current = window.setTimeout(() => setUndo(null), 6000);
  }

  function onUndo() {
    if (!undo) return;
    restoreMemory(undo.id);
    setUndo(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  }

  const searching = query.trim().length > 0;
  const sorted = sortMemoryRows(visible);

  let body: ReactNode;
  if (visible.length === 0) {
    body = (
      <EmptyState
        searching={searching}
        onAdd={openAdd}
      />
    );
  } else if (searching) {
    body = (
      <HeadedGroup
        label={`Resultados para “${query.trim()}”`}
        count={sorted.length}
        first
        rows={sorted}
        showCat
        markNew={false}
        editingId={editingId}
        editText={editText}
        setEditText={setEditText}
        onEditKey={onEditKey}
        onSaveEdit={saveEdit}
        onCancelEdit={() => setEditingId(null)}
        onStartEdit={startEdit}
        onForget={onForget}
      />
    );
  } else if (cat !== "ALL") {
    body = (
      <HeadedGroup
        label={MEMORY_UI_LABELS[cat]}
        count={sorted.length}
        first
        rows={sorted}
        showCat={false}
        markNew={false}
        editingId={editingId}
        editText={editText}
        setEditText={setEditText}
        onEditKey={onEditKey}
        onSaveEdit={saveEdit}
        onCancelEdit={() => setEditingId(null)}
        onStartEdit={startEdit}
        onForget={onForget}
      />
    );
  } else if (lens === "recent") {
    body = (
      <ChronoView
        rows={sorted}
        editingId={editingId}
        editText={editText}
        setEditText={setEditText}
        onEditKey={onEditKey}
        onSaveEdit={saveEdit}
        onCancelEdit={() => setEditingId(null)}
        onStartEdit={startEdit}
        onForget={onForget}
      />
    );
  } else {
    body = (
      <ByCategoryView
        rows={sorted}
        editingId={editingId}
        editText={editText}
        setEditText={setEditText}
        onEditKey={onEditKey}
        onSaveEdit={saveEdit}
        onCancelEdit={() => setEditingId(null)}
        onStartEdit={startEdit}
        onForget={onForget}
      />
    );
  }

  return (
    <div
      className="mem-app screen"
      data-agent="personal"
      data-theme={theme}
    >
      <div className="mem-page">
        <header className="mem-head">
          <div className="mem-head-text">
            <h1 className="mtitle">Memory</h1>
            <p className="msub">
              Lo que tu compañero ha aprendido de ti.{" "}
              <b>{countLabel(active.length)}</b>
            </p>
          </div>
          <div className="mem-head-actions">
            <button
              type="button"
              className="mem-icon-btn"
              aria-label={theme === "dark" ? "Tema claro" : "Tema oscuro"}
              onClick={() =>
                setTheme((t) => (t === "dark" ? "light" : "dark"))
              }
            >
              {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
            </button>
            <button type="button" className="btn mem-add-btn" onClick={openAdd}>
              <IconPlus size={15} />
              Añadir
            </button>
          </div>
        </header>

        <div className={`search${query ? " has-q" : ""}`}>
          <IconSearch size={16} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar lo que tu compañero sabe…"
            aria-label="Buscar memorias"
          />
          {query ? (
            <button
              type="button"
              className="mem-icon-btn clear"
              aria-label="Limpiar búsqueda"
              onClick={() => setQuery("")}
            >
              <IconX size={14} />
            </button>
          ) : null}
        </div>

        <div className="controls">
          <div className="pills" role="tablist" aria-label="Categorías">
            <button
              type="button"
              className={`pill${cat === "ALL" ? " on" : ""}`}
              onClick={() => setCat("ALL")}
            >
              Todas
              <span className="pc">{active.length}</span>
            </button>
            {MEMORY_UI_CATEGORIES.map((c) =>
              counts[c] > 0 || cat === c ? (
                <button
                  key={c}
                  type="button"
                  className={`pill${cat === c ? " on" : ""}`}
                  onClick={() => setCat(c)}
                >
                  {MEMORY_UI_LABELS[c]}
                  <span className="pc">{counts[c]}</span>
                </button>
              ) : null,
            )}
          </div>
          <div className="seg" role="group" aria-label="Vista">
            <button
              type="button"
              className={`seg-btn${lens === "recent" ? " on" : ""}`}
              onClick={() => setLens("recent")}
            >
              Recientes
            </button>
            <button
              type="button"
              className={`seg-btn${lens === "category" ? " on" : ""}`}
              onClick={() => setLens("category")}
            >
              Categoría
            </button>
          </div>
        </div>

        {adding ? (
          <form className="mem-add-panel" onSubmit={submitAdd}>
            <label className="mem-add-label" htmlFor="mem-add-text">
              ¿Qué debería recordar sobre ti?
            </label>
            <textarea
              id="mem-add-text"
              value={addText}
              onChange={(e) => onAddTextChange(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Prefiero… / Me interesa… / Recuerda que…"
            />
            <div className="mem-add-row">
              <label className="mem-add-cat">
                <span>Categoría</span>
                <select
                  value={addCat}
                  onChange={(e) =>
                    setAddCat(e.target.value as MemoryCategory)
                  }
                >
                  {MEMORY_UI_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {MEMORY_UI_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mem-add-actions">
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setAdding(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn sm" disabled={!addText.trim()}>
                  Recordar esto
                </button>
              </div>
            </div>
          </form>
        ) : null}

        <div className="mem-body">{body}</div>
      </div>

      {undo ? (
        <div className="mem-toast-wrap" role="status">
          <div className="toast">
            <span>Olvidado</span>
            <button type="button" className="toast-undo" onClick={onUndo}>
              Deshacer
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type RowHandlers = {
  editingId: string | null;
  editText: string;
  setEditText: (v: string) => void;
  onEditKey: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (m: MemoryEntry) => void;
  onForget: (m: MemoryEntry) => void;
};

function MemoryRow({
  m,
  showCat,
  markNew,
  ...h
}: {
  m: MemoryEntry;
  showCat?: boolean;
  markNew?: boolean;
} & RowHandlers) {
  const src = memorySrc(m);
  const conf = memoryConfUi(m);
  const editing = h.editingId === m.id;
  const nw = Boolean(markNew && isNewMemory(m.createdAt));

  return (
    <div className={`row${m.pin ? " pinned" : ""}`}>
      <span className="row-src" aria-hidden>
        <SrcIcon src={src} />
      </span>
      {editing ? (
        <div className="row-main medit">
          <textarea
            value={h.editText}
            onChange={(e) => h.setEditText(e.target.value)}
            onKeyDown={h.onEditKey}
            rows={2}
            autoFocus
            aria-label="Editar memoria"
          />
          <div className="mem-edit-actions">
            <button type="button" className="btn ghost sm" onClick={h.onCancelEdit}>
              Cancelar
            </button>
            <button type="button" className="btn sm" onClick={h.onSaveEdit}>
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <div className="row-main">
          <div className="row-text">
            {m.pin ? (
              <span className="pin-i" aria-label="Fijado">
                <IconPin size={12} />
              </span>
            ) : null}
            {m.content}
          </div>
          <div className="row-meta">
            <span className="m-src">
              <span className="ico">
                <SrcIcon src={src} size={12} />
              </span>
              {srcLabel(src)}
            </span>
            <span className="m-dot" aria-hidden />
            <span>{relTime(m.createdAt)}</span>
            {conf === "inferred" ? (
              <>
                <span className="m-dot" aria-hidden />
                <span className="m-inf">inferido</span>
              </>
            ) : null}
            {conf === "medium" ? (
              <>
                <span className="m-dot" aria-hidden />
                <span className="m-inf">por confirmar</span>
              </>
            ) : null}
            {nw ? (
              <>
                <span className="m-dot" aria-hidden />
                <span className="m-new">Nuevo</span>
              </>
            ) : null}
            {showCat ? (
              <span className="m-cat">{MEMORY_UI_LABELS[m.category]}</span>
            ) : null}
          </div>
        </div>
      )}
      {!editing ? (
        <div className="row-actions">
          <button
            type="button"
            className="act"
            aria-label="Editar"
            onClick={() => h.onStartEdit(m)}
          >
            <IconPencil />
          </button>
          <button
            type="button"
            className="act danger"
            aria-label="Olvidar"
            onClick={() => h.onForget(m)}
          >
            <IconTrash />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function HeadedGroup({
  label,
  count,
  first,
  rows,
  showCat,
  markNew,
  ...h
}: {
  label: string;
  count: number;
  first?: boolean;
  rows: MemoryEntry[];
  showCat?: boolean;
  markNew?: boolean;
} & RowHandlers) {
  return (
    <section>
      <div className={`cat-h${first ? " first" : ""}`}>
        <span className="g">{label}</span>
        <span className="c">{count}</span>
      </div>
      {rows.map((m) => (
        <MemoryRow
          key={m.id}
          m={m}
          showCat={showCat}
          markNew={markNew}
          {...h}
        />
      ))}
    </section>
  );
}

function ByCategoryView({
  rows,
  ...h
}: { rows: MemoryEntry[] } & RowHandlers) {
  let first = true;
  return (
    <>
      {MEMORY_UI_CATEGORIES.map((c) => {
        const group = sortMemoryRows(rows.filter((m) => m.category === c));
        if (group.length === 0) return null;
        const isFirst = first;
        first = false;
        return (
          <HeadedGroup
            key={c}
            label={MEMORY_UI_LABELS[c]}
            count={group.length}
            first={isFirst}
            rows={group}
            {...h}
          />
        );
      })}
    </>
  );
}

function ChronoView({ rows, ...h }: { rows: MemoryEntry[] } & RowHandlers) {
  const buckets = TIME_BUCKET_ORDER.map((b) => ({
    bucket: b,
    rows: sortMemoryRows(rows.filter((m) => timeBucket(m.createdAt) === b)),
  })).filter((g) => g.rows.length > 0);

  return (
    <>
      {buckets.map((g, i) => (
        <section key={g.bucket}>
          <div className={`divider${i === 0 ? " first" : ""}`}>
            <span className="l">{TIME_BUCKET_LABELS[g.bucket as TimeBucket]}</span>
            <span className="c">{g.rows.length}</span>
          </div>
          {g.rows.map((m) => (
            <MemoryRow key={m.id} m={m} markNew {...h} />
          ))}
        </section>
      ))}
    </>
  );
}

function EmptyState({
  searching,
  onAdd,
}: {
  searching: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="mem-empty">
      <span className="mem-empty-ico" aria-hidden>
        <IconMessage size={22} />
      </span>
      <p className="mem-empty-title">
        {searching ? "Ningún recuerdo coincide." : "Aún no hay nada aquí."}
      </p>
      <p className="mem-empty-sub">
        {searching
          ? "Prueba otra palabra, o añade algo que quieras que recuerde."
          : "Añade algo que tu compañero debería tener presente."}
      </p>
      {!searching ? (
        <button type="button" className="btn sm" onClick={onAdd}>
          Añadir recuerdo
        </button>
      ) : null}
    </div>
  );
}
