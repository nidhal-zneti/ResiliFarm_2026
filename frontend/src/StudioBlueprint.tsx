import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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
  Download,
  Gauge,
  Info,
  Radio,
  Search,
  Sun,
  Wind,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Design } from "./types";

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

type AssemblyBlock = {
  id: string;
  label: string;
  key?: string;
  position: [number, number, number];
  size: [number, number, number];
};

function assemblyBlocks(design: Design): AssemblyBlock[] {
  const columns = 5;
  const rows = Math.max(1, Math.ceil(design.bom.length / columns));
  const blocks: AssemblyBlock[] = [
    {
      id: "enclosure",
      label: "enclosure",
      position: [0, 0, 0],
      size: [3.7, 0.18, Math.max(2.1, rows * 0.44 + 0.25)],
    },
  ];
  design.bom.forEach((part, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const width = Math.min(0.65, 0.38 + Math.log2(part.quantity) * 0.035);
    const depth = Math.min(0.52, 0.28 + Math.log2(part.quantity) * 0.025);
    const height = categoryForPart(part.key) === "power" ? 0.28 : 0.18;
    blocks.push({
      id: `${part.key}:${index + 1}`,
      label: part.key,
      key: part.key,
      position: [
        (column - (columns - 1) / 2) * 0.68,
        0.12 + height / 2,
        (row - (rows - 1) / 2) * 0.42,
      ],
      size: [width, height, depth],
    });
  });
  return blocks;
}

function AssemblyScene({
  blocks,
  exploded,
  selected,
  onSelect,
}: {
  blocks: AssemblyBlock[];
  exploded: number;
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 8, 5]} intensity={1.7} />
      {blocks.map((block) => {
        const [x, y, z] = block.position;
        const selectedBlock = block.key === selected;
        return (
          <mesh
            key={block.id}
            position={[
              x,
              y + (block.key ? exploded * (0.25 + Math.abs(x) * 0.12) : 0),
              z,
            ]}
            onClick={(event) => {
              event.stopPropagation();
              if (block.key) onSelect(block.key);
            }}
          >
            <boxGeometry args={block.size} />
            <meshStandardMaterial
              color={block.key ? partColor(block.key) : "#d9e5d3"}
              transparent={!block.key}
              opacity={block.key ? 1 : 0.72}
              emissive={selectedBlock ? "#6d9d64" : "#000000"}
              emissiveIntensity={selectedBlock ? 0.3 : 0}
              roughness={0.6}
            />
          </mesh>
        );
      })}
      <OrbitControls enablePan minDistance={3} maxDistance={11} />
    </>
  );
}

function stlForBlocks(blocks: AssemblyBlock[]) {
  const triangles: number[][][] = [];
  for (const block of blocks) {
    const [cx, cy, cz] = block.position;
    const [sx, sy, sz] = block.size;
    const vertices = [
      [cx - sx / 2, cy - sy / 2, cz - sz / 2],
      [cx + sx / 2, cy - sy / 2, cz - sz / 2],
      [cx + sx / 2, cy + sy / 2, cz - sz / 2],
      [cx - sx / 2, cy + sy / 2, cz - sz / 2],
      [cx - sx / 2, cy - sy / 2, cz + sz / 2],
      [cx + sx / 2, cy - sy / 2, cz + sz / 2],
      [cx + sx / 2, cy + sy / 2, cz + sz / 2],
      [cx - sx / 2, cy + sy / 2, cz + sz / 2],
    ];
    const faces = [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [3, 7, 6, 2],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
    ];
    for (const [a, b, c, d] of faces) {
      triangles.push(
        [vertices[a], vertices[b], vertices[c]],
        [vertices[a], vertices[c], vertices[d]],
      );
    }
  }
  const facets = triangles.map((triangle) => {
    const [a, b, c] = triangle;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const length = Math.hypot(...normal) || 1;
    const n = normal.map((value) => value / length);
    return ` facet normal ${n.join(" ")}\n  outer loop\n${triangle
      .map((point) => `   vertex ${point.join(" ")}`)
      .join("\n")}\n  endloop\n endfacet`;
  });
  return `solid resilifarm_massing_model\n${facets.join("\n")}\nendsolid resilifarm_massing_model\n`;
}

function downloadStl(
  design: Design,
  blocks: AssemblyBlock[],
  partKey?: string,
) {
  const selectedBlocks = partKey
    ? blocks.filter((block) => block.key === partKey)
    : blocks;
  const blob = new Blob([stlForBlocks(selectedBlocks)], {
    type: "model/stl",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `resilifarm-${design.options.profile ?? "design"}-${partKey ?? "assembly"}.stl`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const { t } = useTranslation();
  const [tab, setTab] = useState<BlueprintTab>("info");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PartCategory | "all">("all");
  const [exploded, setExploded] = useState(0);
  const blocks = useMemo(() => assemblyBlocks(design), [design]);
  useEffect(() => {
    setTab("info");
    setQuery("");
    setCategory("all");
    setExploded(0);
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
    return {
      category: item,
      parts,
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
                  <strong>${group.subtotal.toFixed(2)}</strong>
                </summary>
                <ul>
                  {group.parts.map((part) => (
                    <li key={part.key}>
                      <button onClick={() => onSelect(part.key)}>
                        {t(part.key)} ×{part.quantity}
                      </button>
                      <span>
                        ${(part.price_usd * part.quantity).toFixed(2)}
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
                        ${(part.price_usd * part.quantity).toFixed(2)}
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
        <div className="mechanical-view">
          <div className="assembly-toolbar">
            <label>
              {t("explodedView")}
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={exploded}
                onChange={(event) => setExploded(Number(event.target.value))}
              />
            </label>
            <div className="assembly-export">
              <button onClick={() => downloadStl(design, blocks)}>
                <Download size={15} /> {t("exportAssemblyStl")}
              </button>
              <button
                disabled={!design.bom.some((part) => part.key === selected)}
                onClick={() => downloadStl(design, blocks, selected)}
              >
                <Download size={15} /> {t("exportSelectedStl")}
              </button>
            </div>
          </div>
          <div className="assembly-preview" aria-label={t("assemblyPreview")}>
            <Canvas camera={{ position: [4, 3.5, 5], fov: 42 }}>
              <AssemblyScene
                blocks={blocks}
                exploded={exploded}
                selected={selected}
                onSelect={onSelect}
              />
            </Canvas>
          </div>
          <p className="blueprint-caveat">{t("stlNote")}</p>
          <div className="assembly-tree">
            <h3>
              <Box size={17} /> {t("assemblyTree")}
            </h3>
            <ul>
              {CATEGORIES.filter((item) =>
                design.bom.some((part) => categoryForPart(part.key) === item),
              ).map((item) => (
                <li key={item}>
                  <span>{t(`category_${item}`)}</span>
                  <ul>
                    {design.bom
                      .filter((part) => categoryForPart(part.key) === item)
                      .map((part) => (
                        <li key={part.key}>
                          <button
                            className={selected === part.key ? "selected" : ""}
                            onClick={() => onSelect(part.key)}
                          >
                            {t(part.key)} ×{part.quantity}
                          </button>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
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
            <summary>{t("firmware")}</summary>
            <pre>{design.firmware}</pre>
          </details>
          <p className="blueprint-caveat">{t("qualifiedReview")}</p>
        </div>
      )}
    </div>
  );
}
