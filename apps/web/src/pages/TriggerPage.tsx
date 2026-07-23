import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type {
  TriggerInputValues,
  WorkflowDispatchSchema,
  WorkflowInputField,
} from "@testops-hub/shared";
import { api } from "../api";

function defaultsFromSchema(schema: WorkflowDispatchSchema): TriggerInputValues {
  const values: TriggerInputValues = {};
  for (const field of schema.inputs) {
    values[field.name] = field.defaultValue;
  }
  return values;
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: WorkflowInputField;
  value: string;
  onChange: (next: string) => void;
}) {
  const id = `wf-${field.name}`;

  if (field.type === "choice" || field.type === "boolean") {
    const options =
      field.options.length > 0
        ? field.options
        : field.type === "boolean"
          ? ["false", "true"]
          : [];
    return (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required={field.required}>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      id={id}
      type={field.type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={field.required}
      placeholder={field.defaultValue || undefined}
    />
  );
}

export function TriggerPage() {
  const [schema, setSchema] = useState<WorkflowDispatchSchema | null>(null);
  const [inputs, setInputs] = useState<TriggerInputValues>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.workflowInputs();
      setSchema(next);
      setInputs(defaultsFromSchema(next));
    } catch (err) {
      setSchema(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchema();
  }, [loadSchema]);

  function setField(name: string, value: string) {
    setInputs((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.dispatch(inputs);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2>Trigger workflow</h2>
          <p className="lead">
            {schema
              ? `Inputs loaded from ${schema.workflowFile} (${schema.workflowName})`
              : "Loads workflow_dispatch inputs from the configured workflow YAML."}
          </p>
        </div>
        <button className="btn" type="button" onClick={() => void loadSchema()} disabled={loading || busy}>
          {loading ? "Loading…" : "Reload inputs"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && (
        <div className="ok-box">
          {message}{" "}
          <Link to="/">View runs</Link>
        </div>
      )}

      {loading && !schema && <p className="muted">Fetching workflow inputs…</p>}

      {schema && (
        <form className="stack" onSubmit={(e) => void onSubmit(e)}>
          {schema.inputs.length === 0 ? (
            <p className="muted">
              This workflow has no <span className="mono">workflow_dispatch</span> inputs — it will
              run with defaults.
            </p>
          ) : (
            <div className="grid-2">
              {schema.inputs.map((field) => (
                <div className="field" key={field.name}>
                  <label htmlFor={`wf-${field.name}`}>
                    {field.name}
                    {field.required ? " *" : ""}
                  </label>
                  {field.description && field.description !== field.name && (
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {field.description}
                    </span>
                  )}
                  <FieldControl
                    field={field}
                    value={inputs[field.name] ?? field.defaultValue}
                    onChange={(next) => setField(field.name, next)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={busy || loading}>
              {busy ? "Dispatching…" : "Run workflow"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
