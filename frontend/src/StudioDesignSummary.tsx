import { useTranslation } from "react-i18next";
import type { Design, Validation } from "./types";
import { formatLocalPrice, materialBudgetRange, minimumLinePrice, minimumMaterialBudget, minimumUnitPrice } from "./studioPricing";

export default function StudioDesignSummary({ design, validation }: { design: Design; validation: Validation | null }) {
  const { t, i18n } = useTranslation();
  const estimate = design.material_estimate;
  const budget = minimumMaterialBudget(estimate);
  const range = materialBudgetRange(estimate);
  const rows = (estimate?.items ?? []).map((item) => ({
    item,
    unit: item.currency === estimate?.currency ? minimumUnitPrice(item) : null,
    line: item.currency === estimate?.currency ? minimumLinePrice(item) : null,
  }));
  const included = rows.filter((row) => row.line !== null);
  const largest = included.reduce<(typeof rows)[number] | null>((best, row) =>
    !best || row.line!.amount > best.line!.amount ? row : best, null);
  const partCount = design.bom.reduce((sum, item) => sum + item.quantity, 0);
  const money = (price: ReturnType<typeof minimumUnitPrice>) => price ? formatLocalPrice(price, i18n.language) : t("priceUnavailable");
  const quantity = (value: number | null) => value == null ? t("summaryUnknownQuantity") : value.toLocaleString(i18n.language, { maximumFractionDigits: 20 });

  return <section className="studio-design-summary" aria-label={t("summaryHeading")}>
    <div className="studio-design-hero">
      <div className="studio-summary-budget">
        <h3>{t("estimatedMaterialRange")}</h3>
        <strong className="studio-exact-amount studio-price-range">
          <bdi>{money(range.low)}</bdi><span>{t("priceRangeSeparator")}</span><bdi>{money(range.high)}</bdi>
        </strong>
        <p>{t("summaryBudgetScope")}</p>
        {largest && largest.item.quantity != null && <small className="studio-largest-cost">
          {t("summaryLargestCost", {
            item: t(`material_${largest.item.key}`, { defaultValue: largest.item.label }),
            quantity: quantity(largest.item.quantity),
            unit: t(`unit_${largest.item.unit}`, { defaultValue: largest.item.unit }),
          })}
        </small>}
        <small>{t("summaryPricedLines", { priced: included.length, total: rows.length })} · {t(budget.complete ? "summaryCompleteEstimate" : "partialPrice")}</small>
        <details className="studio-summary-details">
          <summary>{t("summaryShowCalculation")}</summary>
          <p>{t("summaryCalculationRule")}</p>
          {rows.length > 0 ? <div className="studio-table-wrap" tabIndex={0} role="region" aria-label={t("summaryShowCalculation")}>
            <table className="studio-table studio-calculation-table">
              <thead><tr><th>{t("studioItem")}</th><th>{t("quantity")}</th><th>{t("summaryMinimumUnitPrice")}</th><th>{t("minimumLineCost")}</th><th>{t("summaryPriceBasis")}</th></tr></thead>
              <tbody>{rows.map(({ item, unit, line }) => <tr key={item.key}>
                <th scope="row">{t(`material_${item.key}`, { defaultValue: item.label })}</th>
                <td>{quantity(item.quantity)} {t(`unit_${item.unit}`, { defaultValue: item.unit })}</td>
                <td><bdi>{unit ? formatLocalPrice(unit, i18n.language, 4) : t("priceUnavailable")}</bdi></td>
                <td><bdi>{line ? money(line) : t("summaryExcluded")}</bdi></td>
                <td>{t(`priceBasis_${item.price_basis ?? "unpriced"}`)}</td>
              </tr>)}</tbody>
              <tfoot><tr><th colSpan={3}>{t(budget.complete ? "minimumMaterialCost" : "summaryPartialTotal")}</th><td colSpan={2}><bdi>{money(budget.price)}</bdi></td></tr></tfoot>
            </table>
          </div> : <p>{t("studioBudgetUnavailable")}</p>}
          <p>{t("summaryEstimateLimits")}</p>
        </details>
      </div>
      <div>
        <h3>{t("summaryControllerComponents")}</h3>
        <strong>{partCount.toLocaleString(i18n.language)}</strong>
        <p>{t("summaryComponentScope", { types: design.bom.length })}</p>
        <details className="studio-summary-details">
          <summary>{t("summaryShowComponents")}</summary>
          <ul>{design.bom.map((item) => <li key={item.key}><span>{t(item.key)}</span><strong>×{quantity(item.quantity)}</strong></li>)}</ul>
        </details>
      </div>
      <div>
        <h3>{t("summaryCompatibilityTitle")}</h3>
        <strong className={validation?.valid ? "studio-compatible" : "studio-needs-review"}>{t(validation ? validation.valid ? "valid" : "invalid" : "summaryNotChecked")}</strong>
        {validation && <small>{t("studioIssueCount", { count: validation.issues.length })}</small>}
        <p>{t("summaryCompatibilityScope")}</p>
        {validation && <details className="studio-summary-details">
          <summary>{t("summaryShowChecks")}</summary>
          {validation.checks.length > 0 && <ul>{validation.checks.map((check) => <li key={check}>{t(check)}</li>)}</ul>}
          {validation.issues.map((issue) => <p className="warning" key={issue}>{t(issue)}</p>)}
          {validation.warnings.map((warning) => <p className="caption" key={warning}>{t(warning)}</p>)}
        </details>}
      </div>
    </div>
  </section>;
}
