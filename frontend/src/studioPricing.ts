import type { MaterialEstimate, Part } from "./types";

type Item = MaterialEstimate["items"][number];
export type LocalPrice = { currency: "TND" | "JPY"; amount: number };
const materialKeys: Record<string, string> = {
  esp32: "controller", soil: "soil_sensor", pump: "pump", valve: "valve",
};
const valid = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function minimumUnitPrice(item: Item): LocalPrice | null {
  const amount = item.unit_price_low ?? item.unit_price;
  if (!valid(amount) || (item.currency !== "TND" && item.currency !== "JPY")) return null;
  return { currency: item.currency, amount };
}

export function minimumLinePrice(item: Item, quantity = item.quantity): LocalPrice | null {
  if (!valid(quantity)) return null;
  if (quantity === 0 && (item.currency === "TND" || item.currency === "JPY")) {
    return { currency: item.currency, amount: 0 };
  }
  const unit = minimumUnitPrice(item);
  return unit && { ...unit, amount: round(unit.amount * quantity) };
}

export function minimumPartPrice(part: Part, estimate?: MaterialEstimate): LocalPrice | null {
  const item = estimate?.items.find((entry) => entry.key === materialKeys[part.key]);
  return item && item.currency === estimate?.currency ? minimumLinePrice(item, part.quantity) : null;
}

export function sumLocalPrices(prices: (LocalPrice | null)[], currency: MaterialEstimate["currency"] | undefined) {
  const included = prices.filter((price): price is LocalPrice => price != null && price.currency === currency);
  return {
    price: included.length ? { currency: included[0].currency, amount: round(included.reduce((sum, price) => sum + price.amount, 0)) } : null,
    complete: prices.length > 0 && included.length === prices.length,
  };
}

export function minimumMaterialBudget(estimate?: MaterialEstimate) {
  return sumLocalPrices(estimate?.items.map((item) => minimumLinePrice(item)) ?? [], estimate?.currency);
}

export function formatLocalPrice(price: LocalPrice, locale: string) {
  return `${price.currency} ${price.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
