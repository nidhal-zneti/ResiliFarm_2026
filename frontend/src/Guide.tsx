import { useTranslation } from "react-i18next";
import {
  Activity,
  CircuitBoard,
  Droplets,
  FlaskConical,
  LayoutDashboard,
  Map,
  Settings,
  ScanSearch,
  Sprout,
  ArrowRight,
} from "lucide-react";
import { Panel } from "./components";

export type ExperienceMode = "beginner" | "professional";

const sections = [
  ["overview", LayoutDashboard],
  ["twin", Map],
  ["agriculture", Sprout],
  ["water", Droplets],
  ["simulator", FlaskConical],
  ["fruitRipeness", ScanSearch],
  ["studio", CircuitBoard],
  ["settings", Settings],
] as const;

export function StartHere({
  mode,
  onNavigate,
}: {
  mode: ExperienceMode;
  onNavigate: (page: string) => void;
}) {
  const { t } = useTranslation();
  const journeyValue = t("homeJourneySteps", { returnObjects: true });
  const journey = Array.isArray(journeyValue) ? journeyValue as string[] : [];

  return (
    <div className="start-here">
      <div className="home-hero">
        <div>
          <span className="eyebrow">{t("homeEyebrow")}</span>
          <h1>{t("homeTitle")}</h1>
          <p>{t("homeIntro")}</p>
        </div>
        <div className="home-hero-actions">
          <button className="primary" onClick={() => onNavigate("agriculture")}>
            <Sprout size={17} /> {t("startIrrigation")}
          </button>
          <button onClick={() => onNavigate("overview")}>
            <LayoutDashboard size={17} /> {t("openDashboard")}
          </button>
        </div>
      </div>

      <div className="home-columns">
        <Panel title={t("homeQuickStart")}>
          <ol className="home-journey">
            {journey.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          <p className="caption">{t("homeDataNote")}</p>
        </Panel>
        <Panel title={t("homeModeTitle")}>
          <p>{t(mode === "beginner" ? "homeBeginnerMode" : "homeProMode")}</p>
          <p className="caption">{t("homeModeHelp")}</p>
        </Panel>
      </div>

      <div className="section-intro guide-section-heading">
        <div>
          <span className="eyebrow">{t("homeMapEyebrow")}</span>
          <h2>{t("homeSectionMap")}</h2>
          <p>{t("homeSectionMapHelp")}</p>
        </div>
      </div>
      <div className="guide-grid">
        {sections.map(([key, Icon]) => (
          <article className="guide-card" key={key}>
            <div className="guide-card-icon">
              <Icon size={19} />
            </div>
            <div className="guide-card-copy">
              <h3>{t(key)}</h3>
              <p>{t(`guides.${key}.purpose`)}</p>
              <p className="guide-card-mode">
                {t(
                  mode === "beginner"
                    ? `guides.${key}.beginner`
                    : `guides.${key}.professional`,
                )}
              </p>
            </div>
            <a
              className="button guide-open"
              href={`#${key}`}
              onClick={(event) => {
                if (
                  event.ctrlKey ||
                  event.metaKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                onNavigate(key);
              }}
              aria-label={`${t("openSection")} ${t(key)}`}
            >
              {t("openSection")} <ArrowRight size={15} />
            </a>
          </article>
        ))}
      </div>
      <div className="notice guide-demo-note">
        <Activity size={18} /> {t("homeScopeNote")}
      </div>
    </div>
  );
}

export function SectionGuide({
  section,
  mode,
}: {
  section: string;
  mode: ExperienceMode;
}) {
  const { t } = useTranslation();
  const stepValue = t(`guides.${section}.steps`, {
    returnObjects: true,
  });
  const steps = Array.isArray(stepValue) ? stepValue as string[] : [];

  return (
    <details key={`${section}-${mode}`} className="section-guide" open>
      <summary>{t("howToUseSection", { section: t(section) })}</summary>
      <div className="section-guide-content">
        <p>{t(`guides.${section}.purpose`)}</p>
        <h3>{t("guideSteps")}</h3>
        <ol>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="guide-facts">
          <p>
            <strong>{t("guideInputs")}:</strong> {t(`guides.${section}.inputs`)}
          </p>
          <p>
            <strong>{t("guideResults")}:</strong>{" "}
            {t(`guides.${section}.results`)}
          </p>
        </div>
        <p>
          <strong>{t("guideKeepInMind")}:</strong>{" "}
          {t(`guides.${section}.beginner`)}
        </p>
        {mode === "professional" && (
          <p className="guide-technical">
            <strong>{t("guideProfessionalDetail")}:</strong>{" "}
            {t(`guides.${section}.professional`)}
          </p>
        )}
      </div>
    </details>
  );
}
