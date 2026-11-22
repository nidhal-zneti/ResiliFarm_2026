import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  BookOpen,
  Box,
  Check,
  ArrowRight,
  ChevronRight,
  CircuitBoard,
  Cpu,
  Gauge,
  Info,
  Radio,
  Search,
  Sun,
  Wind,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Design, MaterialEstimate, Part } from "./types";
import StudioAssembly from "./StudioAssembly";

type BlueprintTab =
  "info" | "parts" | "architecture" | "wiring" | "mechanical" | "instructions";
type PartCategory =
  | "controller"
  | "sensing"
  | "communication"
  | "actuation"
  | "power"
  | "protection";
type NetType = "data" | "power" | "ground";
type StudioPin = { id: string; label: string };
type StudioNode = Node<
  { label: string; detail: string; pins: StudioPin[] },
  "studioPart"
>;

const TABS: BlueprintTab[] = [
  "info",
  "parts",
  "architecture",
  "wiring",
  "mechanical",
  "instructions",
];
const CATEGORIES: PartCategory[] = [
  "controller",
  "sensing",
  "communication",
  "actuation",
  "power",
  "protection",
];

function categoryForPart(key: string): PartCategory {
  if (key === "esp32") return "controller";
  if (
    [
      "soil",
      "temperature",
      "humidity",
      "light",
      "co2",
      "ph",
      "ec",
      "flow",
      "pressure",
      "soil_mux",
    ].includes(key)
  )
    return "sensing";
  if (key === "lora") return "communication";
  if (
    [
      "relay",
      "driver",
      "pump",
      "valve",
      "fan",
      "cooler",
      "shade",
      "vent",
      "misting",
    ].includes(key)
  )
    return "actuation";
  if (["solar", "battery", "charger", "regulator"].includes(key))
    return "power";
  return "protection";
}

function partColor(key: string) {
  const category = categoryForPart(key);
  return {
    controller: "#31513a",
    sensing: "#5e8a65",
    communication: "#557a8d",
    actuation: "#b8753c",
    power: "#bd9b3b",
    protection: "#7b7186",
  }[category];
}

function iconForPart(key: string) {
  const category = categoryForPart(key);
  if (category === "controller") return Cpu;
  if (category === "sensing") return Gauge;
  if (category === "communication") return Radio;
  if (category === "actuation") return Wind;
  if (category === "power") return key === "solar" ? Sun : Zap;
  return CircuitBoard;
}

const sourcedMaterialKey: Record<string, string> = {
  esp32: "controller",
  soil: "soil_sensor",
  pump: "pump",
  valve: "valve",
};

function sourcedPartTotal(part: Part, estimate: MaterialEstimate | undefined) {
  const key = sourcedMaterialKey[part.key];
  const price = estimate?.items.find((item) => item.key === key);
  if (!price || price.unit_price == null) return null;
  return {
    currency: price.currency,
    low: (price.unit_price_low ?? price.unit_price) * part.quantity,
    high: (price.unit_price_high ?? price.unit_price) * part.quantity,
  };
}

function sourcedPartPrice(part: Part, estimate: MaterialEstimate | undefined, locale: string) {
  const total = sourcedPartTotal(part, estimate);
  if (!total) return null;
  const format = (amount: number) => amount.toLocaleString(locale, { maximumFractionDigits: 2 });
  const range = total.low !== total.high ? `${format(total.low)}–${format(total.high)}` : format(total.low);
  return `${total.currency} ${range}`;
}

function endpointKey(value: string) {
  return value.split(":")[0];
}

function pinLabel(component: string, signal: string, source: boolean) {
  const key = endpointKey(component);
  if (key === "esp32") {
    const gpio = signal.match(/GPIO\s*(\d+(?:\/\d+)?)/i);
    if (gpio) return `GPIO ${gpio[1]}`;
    if (/I²?C/i.test(signal)) return "I²C SDA/SCL";
    if (/SPI/i.test(signal)) return "SPI";
    if (/VIN/i.test(signal)) return source ? "5 V" : "VIN";
    return source ? "GPIO / signal" : "signal input";
  }
  if (key === "soil") return "SIG";
  if (key === "temperature" || key === "humidity") return "I²C";
  if (key === "flow") return "PULSE";
  if (key === "pressure" || key === "ph") return "ANALOG OUT";
  if (key === "lora") return "SPI";
  if (key === "levelShift") return source ? "OUT" : "IN";
  if (key === "relay")
    return /digital output/i.test(signal) ? "COIL" : "CONTACT";
  if (key === "driver") return source ? "SWITCH OUT" : "LOGIC IN";
  if (key === "solar") return "DC OUT";
  if (key === "charger")
    return /18\s*V/i.test(signal) ? "PV IN" : "BATTERY OUT";
  if (key === "battery") return source ? "DC OUT" : "DC IN";
  if (key === "regulator") return source ? "5 V OUT" : "12 V IN";
  if (key === "pump" || key === "valve") return "DC IN";
  return source ? "OUT" : "IN";
}

function pinId(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function netForSignal(signal: string): NetType {
  if (/\b(GND|ground|0\s*V)\b/i.test(signal)) return "ground";
  if (/\b\d+(?:\.\d+)?\s*V\b|power|DC/i.test(signal)) return "power";
  return "data";
}

function netColor(net: NetType) {
  return net === "power" ? "#d28b36" : net === "ground" ? "#68727b" : "#4f7894";
}

function makeGraph(design: Design) {
  const keys = Array.from(
    new Set([
      ...design.bom.map((part) => part.key),
      ...design.connections.flatMap((wire) => [
        endpointKey(wire.source),
        endpointKey(wire.target),
      ]),
    ]),
  );
  const pins = new Map<string, Map<string, StudioPin>>();
  for (const wire of design.connections) {
    for (const [component, label] of [
      [endpointKey(wire.source), pinLabel(wire.source, wire.signal, true)],
      [endpointKey(wire.target), pinLabel(wire.target, wire.signal, false)],
    ]) {
      const byId = pins.get(component) ?? new Map<string, StudioPin>();
      const id = pinId(label);
      byId.set(id, { id, label });
      pins.set(component, byId);
    }
  }
  const partsByKey = new Map(design.bom.map((part) => [part.key, part]));
  const nodes: StudioNode[] = keys.map((key, index) => {
    const part = partsByKey.get(key);
    const columns = 3;
    return {
      id: key,
      type: "studioPart",
      position: {
        x: key === "esp32" ? 280 : 35 + (index % columns) * 225,
        y: key === "esp32" ? 25 : 160 + Math.floor(index / columns) * 145,
      },
      data: {
        label: part ? key : key,
        detail: part
          ? `${part.voltage_v} V · ×${part.quantity}`
          : "connection node",
        pins: Array.from(pins.get(key)?.values() ?? []),
      },
    };
  });
  const edges: Edge[] = design.connections.map((wire, index) => {
    const source = endpointKey(wire.source);
    const target = endpointKey(wire.target);
    const sourcePin = pinLabel(wire.source, wire.signal, true);
    const targetPin = pinLabel(wire.target, wire.signal, false);
    const net = netForSignal(wire.signal);
    const color = netColor(net);
    return {
      id: `wire-${index}`,
      source,
      target,
      sourceHandle: pinId(sourcePin),
      targetHandle: pinId(targetPin),
      label: wire.signal,
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: { stroke: color, strokeWidth: 1.8 },
    };
  });
  return { nodes, edges };
}

function BlueprintNode({ data, selected }: NodeProps<StudioNode>) {
  const { t } = useTranslation();
  return (
    <div
      className={selected ? "studio-flow-node selected" : "studio-flow-node"}
      style={{ height: Math.max(60, 42 + data.pins.length * 16) }}
    >
      <strong>{t(data.label, { defaultValue: data.label })}</strong>
      <small>{data.detail}</small>
      {data.pins.map((pin, index) => (
        <span
          className="blueprint-pin"
          key={pin.id}
          style={{ top: `${36 + index * 16}px` }}
        >
          <Handle id={pin.id} type="target" position={Position.Left} />
          <span>{pin.label}</span>
          <Handle id={pin.id} type="source" position={Position.Right} />
        </span>
      ))}
    </div>
  );
}

function WiringView({
  design,
  onSelect,
}: {
  design: Design;
  onSelect: (key: string) => void;
}) {
  const { t } = useTranslation();
  const graph = useMemo(() => makeGraph(design), [design]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const nodeTypes = useMemo(() => ({ studioPart: BlueprintNode }), []);
  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);
  const onConnect = useCallback(
    (connection: Parameters<typeof addEdge>[0]) =>
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          current,
        ),
      ),
    [setEdges],
  );
  return (
    <>
      <div className="blueprint-legend">
        {(["data", "power", "ground"] as const).map((net) => (
          <span key={net}>
            <i style={{ backgroundColor: netColor(net) }} />
            {t(`net_${net}`)}
          </span>
        ))}
        <small>{t("pinEstimateNote")}</small>
      </div>
      <div className="blueprint-canvas wiring-canvas">
        <ReactFlow<StudioNode, Edge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => onSelect(node.id)}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.35}
          maxZoom={1.8}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={16} size={1} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      <div className="connection-list blueprint-connections">
        {design.connections.map((wire, index) => (
          <details key={`${wire.source}-${wire.target}-${index}`}>
            <summary>
              {t(endpointKey(wire.source), {
                defaultValue: endpointKey(wire.source),
              })}
              {wire.source.includes(":") ? ` ${wire.source.split(":")[1]}` : ""}
              <ArrowRight size={13} />
              {t(endpointKey(wire.target), {
                defaultValue: endpointKey(wire.target),
              })}
              <code>{wire.signal}</code>
            </summary>
            <p>{t(wire.rule, { defaultValue: wire.rule })}</p>
          </details>
        ))}
      </div>
    </>
  );
}

function TabTitle({ tab }: { tab: BlueprintTab }) {
  const { t } = useTranslation();
  const labels: Record<BlueprintTab, string> = {
    info: "tabInfo",
    parts: "tabParts",
    architecture: "tabArchitecture",
    wiring: "tabWiring",
    mechanical: "tabMechanical",
    instructions: "tabInstructions",
  };
  return <>{t(labels[tab])}</>;
}

export function BlueprintWorkspace({
  design,
  selected,
  onSelect,
  projectId,
  completedSteps,
  onToggleStep,
  sketchUrl,
  onSketch,
}: {
  design: Design;
  selected: string;
  onSelect: (key: string) => void;
  projectId: number;
  completedSteps: string[];
  onToggleStep: (key: string) => void;
  sketchUrl: string;
  onSketch: (file?: File) => void;
}) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<BlueprintTab>("info");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PartCategory | "all">("all");
  useEffect(() => {
    setTab("info");
    setQuery("");
    setCategory("all");
  }, [projectId]);
  const filteredParts = design.bom.filter((part) => {
    const matchesText = `${part.key} ${t(part.key)} ${part.protocol}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return (
      matchesText &&
      (category === "all" || categoryForPart(part.key) === category)
    );
  });
  const phases = [
    {
      key: "phaseReview",
      steps: ["qualifiedReview", "confirmRequirements"],
    },
    { key: "phasePrepare", steps: ["powerOff", "checkRails"] },
    { key: "phaseConnect", steps: ["connectSensors", "protectPump"] },
    { key: "phaseCommission", steps: ["testDryRun", "fieldCalibration"] },
  ];
  const availableSteps = phases.flatMap((phase) =>
    phase.steps.filter((step) => design.instructions.includes(step)),
  );
  const progress = availableSteps.filter((step) =>
    completedSteps.includes(step),
  ).length;
  const bomGroups = CATEGORIES.map((item) => {
    const parts = design.bom.filter(
      (part) => categoryForPart(part.key) === item,
    );
    const sourcedPrices = parts.map((part) => sourcedPartTotal(part, design.material_estimate));
    const sourcedSubtotal = parts.length && sourcedPrices.every((price) => price != null)
      ? {
          currency: sourcedPrices[0]!.currency,
          low: sourcedPrices.reduce((sum, price) => sum + price!.low, 0),
          high: sourcedPrices.reduce((sum, price) => sum + price!.high, 0),
        }
      : null;
    return {
      category: item,
      parts,
      sourcedSubtotal,
      subtotal: parts.reduce(
        (sum, part) => sum + part.price_usd * part.quantity,
        0,
      ),
    };
  }).filter((group) => group.parts.length > 0);
  const powerPath = [
    "solar",
    "charger",
    "battery",
    "regulator",
    "esp32",
  ].filter((key) => design.bom.some((part) => part.key === key));

  return (
    <div className="blueprint-workspace">
      <nav
        className="blueprint-tabs"
        role="tablist"
        aria-label={t("blueprintViews")}
      >
        {TABS.map((view) => (
          <button
            key={view}
            className={tab === view ? "active" : ""}
            role="tab"
            aria-selected={tab === view}
            aria-pressed={tab === view}
            onClick={() => setTab(view)}
          >
            <TabTitle tab={view} />
          </button>
        ))}
      </nav>
      <p className="blueprint-view-hint">{t(`hint_${tab}`)}</p>
      {tab === "info" && (
        <div className="blueprint-info">
          <div className="blueprint-info-summary">
            <Info size={20} />
            <div>
              <h3>{t("designSummary")}</h3>
              <p>
                {t("summaryText", {
                  profile: t(
                    design.options.profile === "greenhouse"
                      ? "choice_greenhouse"
                      : "choice_irrigation",
                  ),
                  sensors:
                    design.greenhouse?.soil_sensors ??
                    design.options.soil_count,
                  valves:
                    design.greenhouse?.irrigation_valves ??
                    design.options.valves ??
                    1,
                })}
              </p>
            </div>
          </div>
          <div className="profile-banner">
            <strong>
              {t(
                design.options.profile === "greenhouse"
                  ? "choice_greenhouse"
                  : "choice_irrigation",
              )}
            </strong>
            <span>
              {design.options.soil_count} · {t("soil")}
              {" · "}
              {design.options.valves ?? 1} · {t("valve")}
            </span>
            <span>
              {t(design.options.solar ? "choice_solar" : "choice_grid")}
              {" · "}
              {t(design.options.lora ? "choice_lora" : "choice_wifi")}
            </span>
            <span>
              {t(
                design.generation_source === "provider"
                  ? "providerEngine"
                  : "ruleDesigner",
              )}
            </span>
            {design.greenhouse && (
              <span className="greenhouse-summary">
                {t("greenhouseDetails", {
                  area: design.greenhouse.area_m2,
                  crop: t(design.greenhouse.crop),
                  zones: design.greenhouse.zones,
                  humidity: design.greenhouse.humidity_sensors,
                  light: design.greenhouse.light_sensors,
                  fans: design.greenhouse.fans,
                })}
              </span>
            )}
          </div>
          <div className="blueprint-stats">
            <div>
              <strong>
                {design.bom.reduce((sum, part) => sum + part.quantity, 0)}
              </strong>
              <span>{t("totalItems")}</span>
            </div>
            <div>
              <strong>{design.connections.length}</strong>
              <span>{t("connectionCount")}</span>
            </div>
            <div>
              <strong>${design.cost_usd.toFixed(2)}</strong>
              <span>{t("estimatedCost")}</span>
            </div>
          </div>
          <section>
            <h3>{t("partPlate")}</h3>
            <div className="part-plate">
              {design.bom.map((part) => {
                const Icon = iconForPart(part.key);
                return (
                  <button
                    className={
                      selected === part.key
                        ? "part-plate-item selected"
                        : "part-plate-item"
                    }
                    key={part.key}
                    onClick={() => onSelect(part.key)}
                  >
                    <span
                      className="part-glyph"
                      style={{ color: partColor(part.key) }}
                    >
                      <Icon size={20} />
                    </span>
                    <strong>{t(part.key)}</strong>
                    <small>×{part.quantity}</small>
                    {sourcedPartPrice(part, design.material_estimate, i18n.language) && (
                      <small>{sourcedPartPrice(part, design.material_estimate, i18n.language)}</small>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="bom-rollup">
            <h3>{t("bomRollup")}</h3>
            {bomGroups.map((group) => (
              <details key={group.category}>
                <summary>
                  <span>{t(`category_${group.category}`)}</span>
                  <strong>{group.sourcedSubtotal != null
                    ? `${group.sourcedSubtotal.currency} ${group.sourcedSubtotal.low.toLocaleString(i18n.language, { maximumFractionDigits: 2 })}–${group.sourcedSubtotal.high.toLocaleString(i18n.language, { maximumFractionDigits: 2 })}`
                    : `$${group.subtotal.toFixed(2)}`}</strong>
                </summary>
                <ul>
                  {group.parts.map((part) => (
                    <li key={part.key}>
                      <button onClick={() => onSelect(part.key)}>
                        {t(part.key)} ×{part.quantity}
                      </button>
                      <span>
                        {sourcedPartPrice(part, design.material_estimate, i18n.language) ?? `$${(part.price_usd * part.quantity).toFixed(2)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <strong className="bom-grand-total">
              {t("grandTotal")} · ${design.cost_usd.toFixed(2)}
            </strong>
          </section>
          <div className="blueprint-notes">
            <h3>{t("designAssumptions")}</h3>
            <p>{t("qualifiedReview")}</p>
            <p>{t("supplyNote")}</p>
            <small>{t("blueprintProjectId", { id: projectId })}</small>
          </div>
          <div className="blueprint-tools">
            <label>
              {t("uploadSketch")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(event) => onSketch(event.target.files?.[0])}
              />
            </label>
            {sketchUrl && (
              <img
                className="sketch-preview"
                src={sketchUrl}
                alt={t("uploadedSketch")}
              />
            )}
          </div>
        </div>
      )}
      {tab === "parts" && (
        <div className="parts-view">
          <div className="parts-filters">
            <label>
              <Search size={16} />
              <span className="sr-only">{t("searchParts")}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchParts")}
              />
            </label>
            <label>
              <span className="sr-only">{t("filterCategory")}</span>
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as PartCategory | "all")
                }
              >
                <option value="all">{t("allCategories")}</option>
                {CATEGORIES.map((item) => (
                  <option value={item} key={item}>
                    {t(`category_${item}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filteredParts.length ? (
            <div className="parts-grid">
              {filteredParts.map((part) => {
                const Icon = iconForPart(part.key);
                return (
                  <button
                    className={
                      selected === part.key ? "part-card selected" : "part-card"
                    }
                    key={part.key}
                    onClick={() => onSelect(part.key)}
                  >
                    <span
                      className="part-glyph"
                      style={{ color: partColor(part.key) }}
                    >
                      <Icon size={22} />
                    </span>
                    <span className="part-card-title">
                      <strong>{t(part.key)}</strong>
                      <small>
                        {t(`category_${categoryForPart(part.key)}`)}
                      </small>
                    </span>
                    <span className="part-card-cost">
                      ×{part.quantity}
                      <strong>
                        {sourcedPartPrice(part, design.material_estimate, i18n.language) ?? `$${(part.price_usd * part.quantity).toFixed(2)}`}
                      </strong>
                    </span>
                    <span className="part-card-spec">
                      {part.voltage_v} V · {part.protocol}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="caption">{t("noPartsFound")}</p>
          )}
        </div>
      )}
      {tab === "architecture" && (
        <div className="architecture-view">
          <div className="architecture-flow">
            {(
              [
                ["sensing", "sense"],
                ["controller", "compute"],
                ["actuation", "act"],
              ] as const
            ).map(([categoryName, lane]) => {
              const parts = design.bom.filter(
                (part) => categoryForPart(part.key) === categoryName,
              );
              return (
                <section
                  className={`architecture-lane lane-${lane}`}
                  key={lane}
                >
                  <h3>{t(`lane_${lane}`)}</h3>
                  <div>
                    {parts.length ? (
                      parts.map((part) => (
                        <button
                          key={part.key}
                          className={
                            selected === part.key
                              ? "architecture-block selected"
                              : "architecture-block"
                          }
                          onClick={() => onSelect(part.key)}
                        >
                          <strong>{t(part.key)}</strong>
                          <small>
                            ×{part.quantity} · {part.protocol}
                          </small>
                        </button>
                      ))
                    ) : (
                      <span className="architecture-empty">
                        {t("noPartsInLane")}
                      </span>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <section className="power-tree">
            <h3>
              <Zap size={16} /> {t("powerTree")}
            </h3>
            <div className="power-chain">
              {powerPath.length ? (
                powerPath.map((key, index) => (
                  <span className="power-chain-item" key={key}>
                    <button
                      className={
                        selected === key
                          ? "architecture-block selected"
                          : "architecture-block"
                      }
                      onClick={() => onSelect(key)}
                    >
                      {t(key)}
                    </button>
                    {index < powerPath.length - 1 && <ChevronRight size={16} />}
                  </span>
                ))
              ) : (
                <span className="architecture-empty">
                  {t("noDedicatedPower")}
                </span>
              )}
            </div>
          </section>
        </div>
      )}
      {tab === "wiring" && <WiringView design={design} onSelect={onSelect} />}
      {tab === "mechanical" && (
        <StudioAssembly
          design={design}
          selected={selected}
          onSelect={onSelect}
        />
      )}
      {tab === "instructions" && (
        <div className="build-instructions">
          <div className="build-progress">
            <BookOpen size={18} />
            <strong>
              {t("stepsComplete", {
                done: progress,
                total: availableSteps.length,
              })}
            </strong>
            <progress
              value={progress}
              max={Math.max(availableSteps.length, 1)}
            />
          </div>
          {phases.map((phase) => {
            const steps = phase.steps.filter((step) =>
              design.instructions.includes(step),
            );
            return steps.length ? (
              <section className="instruction-phase" key={phase.key}>
                <h3>{t(phase.key)}</h3>
                {steps.map((step) => (
                  <label className="instruction-step" key={step}>
                    <input
                      type="checkbox"
                      checked={completedSteps.includes(step)}
                      onChange={() => onToggleStep(step)}
                    />
                    <span>{t(step)}</span>
                    {completedSteps.includes(step) && <Check size={16} />}
                  </label>
                ))}
              </section>
            ) : null;
          })}
          <details className="firmware-preview">
            <summary>{t(design.firmware_generation ? "firmwareGeneratedCode" : "firmware")}</summary>
            <pre>{design.firmware}</pre>
          </details>
          <p className="blueprint-caveat">{t("qualifiedReview")}</p>
        </div>
      )}
    </div>
  );
}
