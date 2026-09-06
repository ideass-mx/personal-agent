import { useState } from "react";
import { useApp } from "../state/AppState";
import { Modal } from "./Modal";

export function CreateProjectModal() {
  const { createProjectOpen, setCreateProjectOpen, createProject } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  const close = () => {
    setCreateProjectOpen(false);
    setName("");
    setDescription("");
    setInstructions("");
  };

  const submit = () => {
    createProject({ name, description, instructions });
    setName("");
    setDescription("");
    setInstructions("");
  };

  return (
    <Modal
      open={createProjectOpen}
      title="Nuevo proyecto"
      onClose={close}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
            Crear proyecto
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Nombre</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Informe Q3 mercado LATAM"
          autoFocus
        />
      </label>
      <label className="field">
        <span className="field-label">Descripción / objetivo</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Qué quieres lograr con este trabajo"
        />
      </label>
      <label className="field">
        <span className="field-label">
          Instrucciones para el agente <span className="muted">(opcional)</span>
        </span>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="Preferencias, tono, restricciones…"
        />
      </label>
    </Modal>
  );
}
