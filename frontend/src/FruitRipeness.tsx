import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, upload } from "./api";
import { Panel } from "./components";

type FruitResult = {
  id: number;
  user_id: number;
  fruit: string;
  ripeness: "unripe" | "ripe" | "rotten";
  confidence: number;
  recommendation: string;
  model_version: string;
  created_at: string;
};
type FruitStatus = { available_fruits: string[]; max_image_bytes: number; stores_images: false };

export default function FruitRipeness() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<FruitStatus | null>(null);
  const [results, setResults] = useState<FruitResult[]>([]);
  const [fruit, setFruit] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    const [modelStatus, history] = await Promise.all([
      api<FruitStatus>("/fruit/status"),
      api<FruitResult[]>("/fruit/results"),
    ]);
    setStatus(modelStatus);
    setResults(history);
    setFruit((selected) => selected && modelStatus.available_fruits.includes(selected)
      ? selected : modelStatus.available_fruits[0] || "");
  };
  useEffect(() => { void refresh().catch((e) => setError((e as Error).message)); }, []);

  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !fruit) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("fruit", fruit);
      form.append("image", file);
      await upload<FruitResult>("/fruit/analyze", form);
      setFile(null);
      const input = document.getElementById("fruit-image") as HTMLInputElement | null;
      if (input) input.value = "";
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="fruit-workspace">
    <Panel title={t("fruitRipeness") }>
      <p>{t("fruitIntro")}</p>
      <p className="notice">{t("fruitPrivacy")}</p>
      {error && <p role="alert" className="notice warning">{t(error, { defaultValue: t("error") })}</p>}
      {!status ? <p role="status">{t("loading")}</p> : status.available_fruits.length === 0 ? (
        <p role="status" className="notice">{t("fruitModelUnavailable")}</p>
      ) : <form onSubmit={analyze} className="fruit-form">
        <label>{t("fruitType")}<select value={fruit} onChange={(e) => setFruit(e.target.value)} required>
          {status.available_fruits.map((item) => <option key={item} value={item}>{t(item, { defaultValue: item })}</option>)}
        </select></label>
        <label>{t("fruitPhoto")}<input id="fruit-image" type="file" accept="image/jpeg,image/png,image/webp" required
          onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
        <p className="caption">{t("fruitPhotoLimit", { size: Math.round(status.max_image_bytes / (1024 * 1024)) })}</p>
        <button type="submit" className="primary" disabled={busy || !file}>{busy ? t("loading") : t("analyzeFruit")}</button>
      </form>}
    </Panel>
    <Panel title={t("fruitHistory")}>
      {results.length === 0 ? <p>{t("fruitNoResults")}</p> : <div className="fruit-results">
        {results.map((result) => <article key={result.id} className="fruit-result">
          <div><strong>{t(result.fruit, { defaultValue: result.fruit })} · {t(result.ripeness)}</strong>
            <p>{t("fruitConfidence")}: {Math.round(result.confidence * 100)}%</p>
            <p>{result.recommendation}</p>
            <small>{new Date(result.created_at).toLocaleString(i18n.language)} · {result.model_version}</small>
          </div>
        </article>)}
      </div>}
    </Panel>
  </div>;
}
