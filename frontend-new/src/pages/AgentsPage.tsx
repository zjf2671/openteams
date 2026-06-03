import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Gauge,
  RefreshCw,
  Save,
  Search,
  Settings,
  Terminal,
  X,
} from "lucide-react";
import {
  DropdownSelect,
  type DropdownSelectOption,
} from "@/components/DropdownSelect";
import { agentRuntimeApi, profilesApi } from "@/lib/api";
import type {
  AgentRuntimeDiagnostics,
  AgentRuntimeStatus,
  BaseCodingAgent,
  ExecutorConfig,
  ExecutorConfigs,
  JsonValue,
} from "@/types";
import {
  filterRuntimeRunners,
  getRunnerLabel,
  getRuntimeDisplayState,
  type AgentRuntimeFilter,
  type RuntimeDisplayState,
} from "./agent-runtime/agentRuntimeViewModel";
import ampSchema from "../../../shared/schemas/amp.json";
import claudeCodeSchema from "../../../shared/schemas/claude_code.json";
import codexSchema from "../../../shared/schemas/codex.json";
import copilotSchema from "../../../shared/schemas/copilot.json";
import cursorAgentSchema from "../../../shared/schemas/cursor_agent.json";
import droidSchema from "../../../shared/schemas/droid.json";
import geminiSchema from "../../../shared/schemas/gemini.json";
import kimiCodeSchema from "../../../shared/schemas/kimi_code.json";
import openTeamsCliSchema from "../../../shared/schemas/open_teams_cli.json";
import opencodeSchema from "../../../shared/schemas/opencode.json";
import qwenCodeSchema from "../../../shared/schemas/qwen_code.json";

const filters: Array<{ key: AgentRuntimeFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "error", label: "Error" },
  { key: "not_installed", label: "Not installed" },
];

const statusFilterOptions: DropdownSelectOption[] = filters.map((item) => ({
  id: item.key,
  label: item.label,
}));

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const brandIconPaths = {
  alibabaCloud:
    "M3.996 4.517h5.291L8.01 6.324 4.153 7.506a1.668 1.668 0 0 0-1.165 1.601v5.786a1.668 1.668 0 0 0 1.165 1.6l3.857 1.183 1.277 1.807H3.996A3.996 3.996 0 0 1 0 15.487V8.513a3.996 3.996 0 0 1 3.996-3.996m16.008 0h-5.291l1.277 1.807 3.857 1.182c.715.227 1.17.889 1.165 1.601v5.786a1.668 1.668 0 0 1-1.165 1.6l-3.857 1.183-1.277 1.807h5.291A3.996 3.996 0 0 0 24 15.487V8.513a3.996 3.996 0 0 0-3.996-3.996m-4.007 8.345H8.002v-1.804h7.995Z",
  amp: "M12 0c6.628 0 12 5.373 12 12s-5.372 12-12 12C5.373 24 0 18.627 0 12S5.373 0 12 0zm-.92 19.278l5.034-8.377a.444.444 0 00.097-.268.455.455 0 00-.455-.455l-2.851.004.924-5.468-.927-.003-5.018 8.367s-.1.183-.1.291c0 .251.204.455.455.455l2.831-.004-.901 5.458z",
  android:
    "M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z",
  anthropic:
    "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z",
  claude:
    "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z",
  copilot:
    "M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z",
  gemini:
    "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81",
  openai:
    "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
} as const;

const agentBrandMarks: Record<
  BaseCodingAgent,
  { title: string; path?: string; text?: string }
> = {
  AMP: { title: "Amp", path: brandIconPaths.amp },
  CLAUDE_CODE: { title: "Claude", path: brandIconPaths.claude },
  CODEX: { title: "OpenAI Codex", path: brandIconPaths.openai },
  COPILOT: { title: "GitHub Copilot", path: brandIconPaths.copilot },
  CURSOR_AGENT: { title: "Cursor", text: "C" },
  DROID: { title: "Droid", path: brandIconPaths.android },
  GEMINI: { title: "Google Gemini", path: brandIconPaths.gemini },
  KIMI_CODE: { title: "Kimi", text: "K" },
  OPENCODE: { title: "OpenCode", text: "OC" },
  OPEN_TEAMS_CLI: { title: "OpenTeams CLI", text: "OT" },
  QWEN_CODE: { title: "Qwen", path: brandIconPaths.alibabaCloud },
};

type JsonSchemaProperty = {
  title?: string;
  description?: string;
  type?: string | string[];
  enum?: Array<string | number | boolean | null>;
  format?: string;
  items?: { type?: string | string[] };
  additionalProperties?: unknown;
};

type AgentJsonSchema = {
  properties?: Record<string, JsonSchemaProperty>;
};

const agentConfigSchemas: Record<BaseCodingAgent, AgentJsonSchema> = {
  AMP: ampSchema,
  CLAUDE_CODE: claudeCodeSchema,
  CODEX: codexSchema,
  COPILOT: copilotSchema,
  CURSOR_AGENT: cursorAgentSchema,
  DROID: droidSchema,
  GEMINI: geminiSchema,
  KIMI_CODE: kimiCodeSchema,
  OPENCODE: opencodeSchema,
  OPEN_TEAMS_CLI: openTeamsCliSchema,
  QWEN_CODE: qwenCodeSchema,
};

const hiddenConfigFields = new Set(["env", "run_mode", "mode"]);
const nullOptionId = "__openteams_null__";

const isHiddenConfigField = (
  runner: BaseCodingAgent,
  fieldKey: string,
): boolean =>
  hiddenConfigFields.has(fieldKey) ||
  (runner === "OPEN_TEAMS_CLI" &&
    (fieldKey === "variant" || fieldKey === "agent"));

const formatRunnerKey = (runner: BaseCodingAgent): string =>
  runner.toLowerCase().replaceAll("_", " ");

const getSchemaValueType = (property: JsonSchemaProperty): string => {
  const rawType = Array.isArray(property.type)
    ? property.type.find((item) => item !== "null")
    : property.type;
  return rawType ?? "string";
};

const toFieldLabel = (key: string, property?: JsonSchemaProperty): string =>
  property?.title ??
  key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const getExecutorConfig = (
  profiles: ExecutorConfigs | null,
  runner: BaseCodingAgent,
): ExecutorConfig | null => profiles?.executors?.[runner] ?? null;

const getVariantNames = (
  profiles: ExecutorConfigs | null,
  runner: BaseCodingAgent,
): string[] => {
  const config = getExecutorConfig(profiles, runner);
  if (!config) return [];
  return Object.keys(config).sort((a, b) => {
    if (a === "DEFAULT") return -1;
    if (b === "DEFAULT") return 1;
    return a.localeCompare(b);
  });
};

const getVariantFormData = (
  profiles: ExecutorConfigs | null,
  runner: BaseCodingAgent,
  variant: string,
): Record<string, JsonValue | undefined> => {
  const config = getExecutorConfig(profiles, runner);
  const variantConfig = config?.[variant] ?? config?.DEFAULT;
  const raw = variantConfig?.[runner];
  return isObjectRecord(raw) ? { ...(raw as Record<string, JsonValue>) } : {};
};

const updateVariantFormData = (
  profiles: ExecutorConfigs,
  runner: BaseCodingAgent,
  variant: string,
  formData: Record<string, JsonValue | undefined>,
): ExecutorConfigs => {
  const currentExecutorConfig = profiles.executors[runner] ?? {};
  return {
    ...profiles,
    executors: {
      ...profiles.executors,
      [runner]: {
        ...currentExecutorConfig,
        [variant]: {
          [runner]: formData,
        },
      },
    },
  };
};

const getStringFormValue = (
  formData: Record<string, JsonValue | undefined>,
  key: string,
): string => {
  const value = formData[key];
  return typeof value === "string" ? value.trim() : "";
};

const buildModelOptions = (
  models: string[],
  selectedModel: string,
): DropdownSelectOption[] => {
  const uniqueModels = new Set<string>();
  if (selectedModel) uniqueModels.add(selectedModel);
  models.forEach((model) => {
    const trimmed = model.trim();
    if (trimmed) uniqueModels.add(trimmed);
  });

  return Array.from(uniqueModels).map((model) => ({
    id: model,
    label: model,
  }));
};

/* ---------- Status helpers ---------- */

function StatusDot({ state }: { state: RuntimeDisplayState }) {
  return (
    <span
      className={cx(
        "inline-block h-1.5 w-1.5 rounded-full",
        state === "available" && "bg-[var(--success)]",
        state === "error" && "bg-red-400",
        state === "not_installed" && "bg-[var(--ink-tertiary)]",
      )}
    />
  );
}

function StatusBadge({ runner }: { runner: AgentRuntimeStatus }) {
  const state = getRuntimeDisplayState(runner);
  const label =
    state === "available"
      ? "Available"
      : state === "error"
        ? "Error"
        : "Not installed";
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-[6px] border px-2 text-[14px] font-medium",
        state === "available" &&
          "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]",
        state === "error" &&
          "border-red-400/30 bg-red-400/10 text-red-300",
        state === "not_installed" &&
          "border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--ink-muted)]",
      )}
    >
      <StatusDot state={state} />
      {label}
    </span>
  );
}

function AgentBrandAvatar({ runner }: { runner: BaseCodingAgent }) {
  const brand = agentBrandMarks[runner];

  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--mono-border)] bg-[var(--mono-bg)] text-[var(--ink-muted)]"
      title={brand.title}
      aria-label={brand.title}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        focusable="false"
      >
        {brand.path ? (
          <path fill="currentColor" d={brand.path} />
        ) : (
          <text
            x="12"
            y="15"
            textAnchor="middle"
            className="fill-current font-mono text-[9px] font-semibold"
          >
            {brand.text}
          </text>
        )}
      </svg>
    </span>
  );
}

/* ---------- Sort priority: available first, then error, then not_installed ---------- */

const statePriority: Record<RuntimeDisplayState, number> = {
  available: 0,
  error: 1,
  not_installed: 2,
};

function sortRunnersByAvailability(
  runners: AgentRuntimeStatus[],
): AgentRuntimeStatus[] {
  return [...runners].sort(
    (a, b) =>
      statePriority[getRuntimeDisplayState(a)] -
      statePriority[getRuntimeDisplayState(b)],
  );
}

/* ---------- Agent row item ---------- */

function AgentRow({
  runner,
  selected,
  onOpenConfig,
}: {
  runner: AgentRuntimeStatus;
  selected: boolean;
  onOpenConfig: () => void;
}) {
  const state = getRuntimeDisplayState(runner);
  const models =
    runner.discovered_models.length > 0
      ? runner.discovered_models.join(", ")
      : state === "not_installed"
        ? "Install to discover models"
        : "No models reported";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenConfig}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenConfig();
        }
      }}
      className={cx(
        "group grid min-h-[58px] cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--hairline)] px-3 py-2.5 transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] md:grid-cols-[minmax(210px,1.15fr)_128px_minmax(220px,1.85fr)_72px]",
        selected && "bg-[var(--surface-3)] ring-1 ring-inset ring-[var(--primary)]/35",
        state === "available"
          ? "hover:bg-[var(--surface-2)]"
          : state === "error"
            ? "hover:bg-[var(--surface-2)]"
            : "opacity-70 hover:bg-[var(--surface-2)] hover:opacity-95",
        !selected && "bg-[var(--surface-1)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <AgentBrandAvatar runner={runner.runner_type} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium leading-[1.3] text-[var(--ink)]">
            {getRunnerLabel(runner.runner_type)}
          </p>
          <p className="mt-0.5 truncate font-mono text-[14px] leading-[1.3] text-[var(--ink-tertiary)]">
            {runner.version ?? formatRunnerKey(runner.runner_type)}
          </p>
        </div>
      </div>

      <div className="hidden md:block">
        <StatusBadge runner={runner} />
      </div>

      <div className="hidden min-w-0 md:block">
        <p
          className={cx(
            "truncate font-mono text-[14px] leading-[1.4]",
            runner.discovered_models.length > 0
              ? "text-[var(--ink-muted)]"
              : "text-[var(--ink-tertiary)]",
          )}
          title={models}
        >
          {models}
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenConfig();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--ink-tertiary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
          aria-label={`Configure ${getRunnerLabel(runner.runner_type)}`}
          title="Configure"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--hairline)] px-3 py-2.5 last:border-b-0">
      <p className="text-[14px] font-medium leading-tight text-[var(--ink-tertiary)]">
        {label}
      </p>
      <p className="break-all font-mono text-[14px] leading-[1.45] text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}

function ConfigSchemaField({
  fieldKey,
  property,
  value,
  onChange,
}: {
  fieldKey: string;
  property: JsonSchemaProperty;
  value: JsonValue | undefined;
  onChange: (key: string, value: JsonValue | undefined) => void;
}) {
  const [jsonDraft, setJsonDraft] = useState(() =>
    value === undefined || value === null
      ? ""
      : JSON.stringify(value, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const valueType = getSchemaValueType(property);
  const label = toFieldLabel(fieldKey, property);
  const description = property.description;

  useEffect(() => {
    if (valueType !== "object") return;
    setJsonDraft(
      value === undefined || value === null
        ? ""
        : JSON.stringify(value, null, 2),
    );
    setJsonError(null);
  }, [value, valueType]);

  const labelNode = (
    <div>
      <label className="text-[14px] font-medium text-[var(--ink)]">
        {label}
      </label>
      {description && (
        <p className="mt-1 text-[14px] leading-[1.45] text-[var(--ink-tertiary)]">
          {description}
        </p>
      )}
    </div>
  );

  if (property.enum) {
    const hasNullOption = property.enum.some((item) => item === null);
    const options: DropdownSelectOption[] = [
      ...(hasNullOption
        ? [{ id: nullOptionId, label: "Default" }]
        : []),
      ...property.enum
        .filter((item) => item !== null)
        .map((item) => ({
          id: String(item),
          label: String(item),
        })),
    ];
    const selectedValue =
      value === null || value === undefined ? nullOptionId : String(value);

    return (
      <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
        {labelNode}
        <DropdownSelect
          value={selectedValue}
          options={options}
          showSearch={options.length > 8}
          className="w-full [&>button]:bg-[var(--surface-2)]"
          panelClassName="max-w-none"
          onChange={(nextValue) =>
            onChange(fieldKey, nextValue === nullOptionId ? null : nextValue)
          }
        />
      </div>
    );
  }

  if (valueType === "boolean") {
    return (
      <label className="grid cursor-pointer gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        {labelNode}
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(fieldKey, event.target.checked)}
          className="mt-1 h-4 w-4"
        />
      </label>
    );
  }

  if (valueType === "array") {
    const arrayValue = Array.isArray(value) ? value : [];
    return (
      <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
        {labelNode}
        <textarea
          value={arrayValue.map(String).join("\n")}
          onChange={(event) => {
            const items = event.target.value
              .split(/\r?\n/u)
              .map((item) => item.trim())
              .filter(Boolean);
            onChange(fieldKey, items.length > 0 ? items : null);
          }}
          rows={4}
          spellCheck={false}
          placeholder="One value per line"
          className="w-full resize-none rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-[10px] font-mono text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-tertiary)] focus:border-[var(--primary)]"
        />
      </div>
    );
  }

  if (valueType === "object") {
    return (
      <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
        {labelNode}
        <div>
          <textarea
            value={jsonDraft}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setJsonDraft(nextDraft);
              if (!nextDraft.trim()) {
                setJsonError(null);
                onChange(fieldKey, null);
                return;
              }
              try {
                const parsed = JSON.parse(nextDraft) as JsonValue;
                setJsonError(null);
                onChange(fieldKey, parsed);
              } catch (error) {
                setJsonError(
                  error instanceof Error ? error.message : "Invalid JSON",
                );
              }
            }}
            rows={5}
            spellCheck={false}
            placeholder="{ }"
            className="w-full resize-none rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-[10px] font-mono text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-tertiary)] focus:border-[var(--primary)]"
          />
          {jsonError && (
            <p className="mt-1.5 text-[14px] text-amber-200">{jsonError}</p>
          )}
        </div>
      </div>
    );
  }

  const stringValue =
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : "";
  const InputElement = property.format === "textarea" ? "textarea" : "input";

  return (
    <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
      {labelNode}
      <InputElement
        value={stringValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(fieldKey, nextValue.trim() ? nextValue : null);
        }}
        rows={property.format === "textarea" ? 4 : undefined}
        spellCheck={property.format === "textarea"}
        className="w-full rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-[10px] font-mono text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-tertiary)] focus:border-[var(--primary)]"
      />
    </div>
  );
}

/* ---------- Embedded agent configuration sidebar ---------- */

function AgentConfigSidebar({
  runner,
  profiles,
  profilesLoading,
  profilesError,
  saving,
  saveError,
  onClose,
  onSave,
}: {
  runner: AgentRuntimeStatus;
  profiles: ExecutorConfigs | null;
  profilesLoading: boolean;
  profilesError: string | null;
  saving: boolean;
  saveError: string | null;
  onClose: () => void;
  onSave: (
    runner: BaseCodingAgent,
    variant: string,
    formData: Record<string, JsonValue | undefined>,
  ) => Promise<void>;
}) {
  const variants = useMemo(
    () => getVariantNames(profiles, runner.runner_type),
    [profiles, runner.runner_type],
  );
  const [selectedVariant, setSelectedVariant] = useState("DEFAULT");
  const [formData, setFormData] = useState<Record<
    string,
    JsonValue | undefined
  >>(() => getVariantFormData(profiles, runner.runner_type, "DEFAULT"));
  const [diagnostics, setDiagnostics] =
    useState<AgentRuntimeDiagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const schema = agentConfigSchemas[runner.runner_type];
  const supportsModelSelection = !!schema.properties?.model;
  const schemaFields = Object.entries(schema.properties ?? {}).filter(
    ([fieldKey]) =>
      fieldKey !== "model" &&
      !isHiddenConfigField(runner.runner_type, fieldKey),
  );
  const variantOptions: DropdownSelectOption[] = variants.map((variant) => ({
    id: variant,
    label: variant === "DEFAULT" ? "Default" : variant,
  }));
  const displayedModels =
    diagnostics?.discovered_models.length
      ? diagnostics.discovered_models
      : runner.discovered_models;
  const configPath =
    diagnostics?.config_path ??
    (diagnosticsLoading ? "Loading..." : "Not reported");
  const cliVersion = diagnosticsLoading
    ? "Checking..."
    : (diagnostics?.version ?? runner.version ?? "Not reported");
  const selectedModel = getStringFormValue(formData, "model");
  const modelOptions = buildModelOptions(displayedModels, selectedModel);
  const canChooseModel = supportsModelSelection && modelOptions.length > 0;

  useEffect(() => {
    const nextVariant = variants.includes(selectedVariant)
      ? selectedVariant
      : (variants[0] ?? "DEFAULT");
    if (nextVariant !== selectedVariant) {
      setSelectedVariant(nextVariant);
      return;
    }
    setFormData(getVariantFormData(profiles, runner.runner_type, nextVariant));
  }, [profiles, runner.runner_type, selectedVariant, variants]);

  useEffect(() => {
    let active = true;
    setDiagnostics(null);
    setDiagnosticsError(null);
    setDiagnosticsLoading(true);

    agentRuntimeApi
      .getDiagnostics(runner.runner_type)
      .then((result) => {
        if (active) setDiagnostics(result);
      })
      .catch((error) => {
        if (active) {
          setDiagnosticsError(
            error instanceof Error ? error.message : "Diagnostics failed",
          );
        }
      })
      .finally(() => {
        if (active) setDiagnosticsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [runner.runner_type]);

  const handleConfigFieldChange = (
    key: string,
    value: JsonValue | undefined,
  ) => {
    setFormData((current) => {
      const next = { ...current };
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const handleModelChange = (model: string) => {
    handleConfigFieldChange("model", model);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-1)]">
      <header className="shrink-0 border-b border-[var(--hairline)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <AgentBrandAvatar runner={runner.runner_type} />
            <div className="min-w-0">
              <h2 className="mt-1 truncate text-[18px] font-semibold leading-[1.2] tracking-[-0.2px] text-[var(--ink)]">
                {getRunnerLabel(runner.runner_type)}
              </h2>
              <p className="mt-1 font-mono text-[14px] leading-[1.35] text-[var(--ink-tertiary)]">
                {formatRunnerKey(runner.runner_type)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] p-1.5 text-[var(--ink-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            aria-label="Close configuration"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge runner={runner} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto ot-scroll-area-styled">
        <section className="border-b border-[var(--hairline)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[14px] font-medium text-[var(--ink)]">
              Runtime details
            </h3>
          </div>
          <div className="mt-3 overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)]">
            <DetailRow label="Config file" value={configPath} />
            <DetailRow label="CLI version" value={cliVersion} />
          </div>
          {diagnosticsError && (
            <div className="mt-3 rounded-[8px] border border-amber-400/25 bg-amber-400/10 p-3 text-[14px] text-amber-200">
              {diagnosticsError}
            </div>
          )}
        </section>

        <section className="border-b border-[var(--hairline)] px-4 py-4">
          <h3 className="text-[14px] font-medium text-[var(--ink)]">
            Model and profile
          </h3>
          <div className="mt-3 overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)]">
            <div className="grid gap-2 border-b border-[var(--hairline)] px-3 py-3 sm:grid-cols-[130px_minmax(0,1fr)] sm:items-center">
              <div>
                <p className="text-[14px] font-medium text-[var(--ink)]">
                  Profile
                </p>
                <p className="mt-0.5 text-[14px] text-[var(--ink-tertiary)]">
                  {profilesLoading ? "Loading..." : `${variants.length} saved`}
                </p>
              </div>
              <DropdownSelect
                value={selectedVariant}
                options={
                  variantOptions.length > 0
                    ? variantOptions
                    : [{ id: "DEFAULT", label: "Default", disabled: true }]
                }
                showSearch={variantOptions.length > 8}
                disabled={profilesLoading || variantOptions.length === 0}
                className="w-full [&>button]:bg-[var(--surface-1)]"
                panelClassName="max-w-none"
                onChange={(value) => {
                  setSelectedVariant(value);
                  setFormData(
                    getVariantFormData(profiles, runner.runner_type, value),
                  );
                }}
              />
            </div>

            <div className="grid gap-2 px-3 py-3 sm:grid-cols-[130px_minmax(0,1fr)] sm:items-center">
              <div>
                <p className="text-[14px] font-medium text-[var(--ink)]">
                  Model
                </p>
                <p className="mt-0.5 text-[14px] text-[var(--ink-tertiary)]">
                  {diagnosticsLoading
                    ? "Loading..."
                    : modelOptions.length > 0
                      ? `${modelOptions.length} available`
                      : "None reported"}
                </p>
              </div>
              <DropdownSelect
                value={selectedModel}
                options={
                  modelOptions.length > 0
                    ? modelOptions
                    : [
                        {
                          id: "__no_models__",
                          label: "No models reported",
                          disabled: true,
                        },
                      ]
                }
                placeholder="Select model"
                searchPlaceholder="Search models..."
                emptyLabel="No models match this search."
                showSearch={modelOptions.length > 6}
                disabled={!canChooseModel}
                className="w-full [&>button]:bg-[var(--surface-1)]"
                panelClassName="max-w-none"
                maxPanelHeightClassName="max-h-[260px]"
                onChange={handleModelChange}
              />
            </div>
          </div>
        </section>

        <section className="px-4 py-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-[14px] font-medium text-[var(--ink)]">
              Configuration
            </h3>
            {selectedModel && (
              <span className="min-w-0 truncate rounded-[4px] border border-[var(--mono-border)] bg-[var(--mono-bg)] px-2 py-0.5 font-mono text-[14px] text-[var(--ink-subtle)]">
                {selectedModel}
              </span>
            )}
          </div>

          {profilesError && (
            <div className="rounded-[8px] border border-red-500/30 bg-red-500/10 p-3 text-[14px] text-red-300">
              {profilesError}
            </div>
          )}

          {!profilesError && canChooseModel && !selectedModel && (
            <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] p-3 text-[14px] text-[var(--ink-tertiary)]">
              Select a model to view its configuration.
            </div>
          )}

          {!profilesError &&
            (!canChooseModel || selectedModel) &&
            schemaFields.length === 0 && (
              <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] p-3 text-[14px] text-[var(--ink-tertiary)]">
                No configurable fields reported for this agent.
              </div>
            )}

          {!profilesError &&
            (!canChooseModel || selectedModel) &&
            schemaFields.length > 0 && (
              <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] p-3">
                <div className="space-y-4">
                  {schemaFields.map(([fieldKey, property]) => (
                    <ConfigSchemaField
                      key={fieldKey}
                      fieldKey={fieldKey}
                      property={property}
                      value={formData[fieldKey]}
                      onChange={handleConfigFieldChange}
                    />
                  ))}
                </div>
              </div>
            )}

          {saveError && (
            <div className="mt-4 rounded-[8px] border border-red-500/30 bg-red-500/10 p-3 text-[14px] text-red-300">
              {saveError}
            </div>
          )}
        </section>
      </div>

      <footer className="shrink-0 border-t border-[var(--hairline)] bg-[var(--surface-1)] p-4">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-3)] px-[14px] py-[8px] text-[14px] font-medium text-[var(--ink-subtle)] hover:bg-[var(--surface-2)]"
          >
            Close
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void onSave(runner.runner_type, selectedVariant, formData)
            }
            className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--primary)] px-[14px] py-[8px] text-[14px] font-medium text-white hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </footer>
    </aside>
  );
}

function AgentConfigEmptyState() {
  return (
    <aside className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--ink-tertiary)]">
          <Settings className="h-5 w-5" />
        </span>
        <h3 className="mt-3 text-[14px] font-medium text-[var(--ink)]">
          Select an agent
        </h3>
        <p className="mt-1 max-w-[260px] text-[14px] leading-[1.5] text-[var(--ink-tertiary)]">
          Choose an agent from the list to inspect its CLI configuration,
          version, and supported models.
        </p>
      </div>
    </aside>
  );
}

/* ========== Main page ========== */

export function AgentsPage() {
  const [runners, setRunners] = useState<AgentRuntimeStatus[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AgentRuntimeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedRunner, setSelectedRunner] =
    useState<AgentRuntimeStatus | null>(null);
  const [autoSelectedRunner, setAutoSelectedRunner] = useState(false);
  const [profiles, setProfiles] = useState<ExecutorConfigs | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredRunners = useMemo(
    () =>
      sortRunnersByAvailability(filterRuntimeRunners(runners, query, filter)),
    [filter, query, runners],
  );

  const loadRuntime = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await agentRuntimeApi.list();
      setRunners(response.runners);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load agents",
      );
    } finally {
      setLoading(false);
    }
  };

  const loadProfiles = async () => {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const response = await profilesApi.load();
      const parsed = JSON.parse(response.content) as ExecutorConfigs;
      setProfiles(parsed);
    } catch (error) {
      setProfilesError(
        error instanceof Error
          ? error.message
          : "Failed to load agent profiles",
      );
      setProfiles(null);
    } finally {
      setProfilesLoading(false);
    }
  };

  useEffect(() => {
    void loadRuntime();
    void loadProfiles();
  }, []);

  useEffect(() => {
    if (!autoSelectedRunner && !selectedRunner && filteredRunners[0]) {
      setSelectedRunner(filteredRunners[0]);
      setAutoSelectedRunner(true);
    }
  }, [autoSelectedRunner, filteredRunners, selectedRunner]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const response = await agentRuntimeApi.refresh();
      setRunners(response.runners);
      setNotice(
        response.errors.length > 0
          ? `${response.errors.length} runner failed; cached discovery preserved.`
          : "Discovery refreshed.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Refresh discovery failed",
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async (
    runner: BaseCodingAgent,
    variant: string,
    formData: Record<string, JsonValue | undefined>,
  ) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (profiles) {
        const nextProfiles = updateVariantFormData(
          profiles,
          runner,
          variant,
          formData,
        );
        await profilesApi.save(JSON.stringify(nextProfiles, null, 2));
        setProfiles(nextProfiles);
      }

      const updated = await agentRuntimeApi.updateConfig(runner, {
        run_mode: null,
        env_json: null,
        model_override: "",
      });
      setRunners((current) =>
        current.map((item) =>
          item.runner_type === updated.runner_type ? updated : item,
        ),
      );
      setSelectedRunner(updated);
      setNotice("Agent configuration saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-2)] text-[var(--ink)]">
      <header className="shrink-0 border-b border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-4 md:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--primary)]">
              <Terminal className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.4px] text-[var(--ink)]">
                Agent runtime
              </h1>
              <p className="mt-1 max-w-[560px] text-[14px] leading-[1.45] text-[var(--ink-subtle)]">
                Manage local coding agents, model discovery, and runtime
                configuration.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-[var(--primary)] px-[14px] text-[14px] font-medium text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)]">
          <div className="shrink-0 border-b border-[var(--hairline)] px-3 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-[14px] font-medium leading-tight text-[var(--ink)]">
                  Runtime availability
                </h2>
                <p className="mt-1 text-[14px] leading-[1.4] text-[var(--ink-tertiary)]">
                  Available agents are kept first.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <div className="relative min-w-[220px] sm:w-[280px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-tertiary)]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search agents"
                    className="h-9 w-full rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] pl-8 pr-3 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-tertiary)] focus:border-[var(--primary)]"
                  />
                </div>
                <DropdownSelect
                  value={filter}
                  options={statusFilterOptions}
                  showSearch={false}
                  triggerIcon={
                    <Gauge className="h-3.5 w-3.5 shrink-0 text-[var(--ink-tertiary)]" />
                  }
                  className="min-w-[170px] [&>button]:h-9 [&>button]:bg-[var(--surface-2)] [&>button]:py-0"
                  panelClassName="max-w-none"
                  maxPanelHeightClassName="max-h-[220px]"
                  onChange={(value) => setFilter(value as AgentRuntimeFilter)}
                />
              </div>
            </div>
          </div>

          {(loadError || notice) && (
            <div className="shrink-0 space-y-2 border-b border-[var(--hairline)] p-3">
              {loadError && (
                <div className="rounded-[8px] border border-red-500/30 bg-red-500/10 p-3 text-[14px] text-red-300">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Agent runtime failed to load
                  </span>
                  <p className="mt-1 text-red-300/80">{loadError}</p>
                </div>
              )}
              {notice && (
                <div className="rounded-[8px] border border-[var(--primary)]/30 bg-[var(--primary-tint)] p-3 text-[14px] text-[var(--primary)]">
                  {notice}
                </div>
              )}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_500px]">
            <div className="min-h-0 flex-1 overflow-y-auto ot-scroll-area-styled">
              {loading ? (
                <div className="space-y-0">
                  {[0, 1, 2, 3, 4].map((item) => (
                    <div
                      key={item}
                      className="h-[58px] animate-pulse border-b border-[var(--hairline)] bg-[var(--surface-2)] last:border-b-0"
                    />
                  ))}
                </div>
              ) : filteredRunners.length === 0 ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
                  <Bot className="h-8 w-8 text-[var(--ink-tertiary)]" />
                  <h3 className="mt-3 text-[14px] font-medium text-[var(--ink)]">
                    No matching agents
                  </h3>
                  <p className="mt-1 max-w-sm text-[14px] leading-[1.5] text-[var(--ink-subtle)]">
                    Adjust search or status filters.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="sticky top-0 z-10 hidden grid-cols-[minmax(210px,1.15fr)_128px_minmax(220px,1.85fr)_72px] border-b border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-2 text-[14px] font-medium text-[var(--ink-tertiary)] md:grid">
                    <span>Agent</span>
                    <span>Status</span>
                    <span>Models</span>
                    <span className="text-right">Actions</span>
                  </div>
                  {filteredRunners.map((runner) => (
                    <AgentRow
                      key={runner.runner_type}
                      runner={runner}
                      selected={selectedRunner?.runner_type === runner.runner_type}
                      onOpenConfig={() => {
                        setSelectedRunner(runner);
                        setSaveError(null);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-[360px] overflow-hidden border-t border-[var(--hairline)] lg:min-h-0 lg:border-l lg:border-t-0">
              {selectedRunner ? (
                <AgentConfigSidebar
                  runner={selectedRunner}
                  profiles={profiles}
                  profilesLoading={profilesLoading}
                  profilesError={profilesError}
                  saving={saving}
                  saveError={saveError}
                  onClose={() => setSelectedRunner(null)}
                  onSave={handleSave}
                />
              ) : (
                <AgentConfigEmptyState />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
