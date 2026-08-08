import { createHash } from "node:crypto";
import {
  CustomEditor,
  sessionEntryToContextMessages,
  type BuildSystemPromptOptions,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  buildContextSnapshot,
  type ContextMessageLike,
  type ContextSnapshot,
} from "./context-model.ts";
import {
  createContextBarComponent,
  formatContextStatus,
  withoutTopEditorBorder,
} from "./ui.ts";

type EditorFactory = NonNullable<ReturnType<ExtensionContext["ui"]["getEditorComponent"]>>;

const WIDGET_KEY = "context-bar";
const STATE_ENTRY_TYPE = "context-bar-enabled";

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function requestFingerprint(
  systemPrompt: string,
  tools: ReturnType<ExtensionAPI["getAllTools"]>,
): string {
  const hash = createHash("sha256");
  hash.update(systemPrompt);
  for (const tool of [...tools].sort((left, right) => left.name.localeCompare(right.name))) {
    hash.update("\0");
    hash.update(tool.name);
    hash.update("\0");
    hash.update(tool.description ?? "");
    hash.update("\0");
    hash.update(stableJson(tool.parameters));
    hash.update("\0");
    hash.update(stableJson(tool.promptGuidelines));
  }
  return hash.digest("hex");
}

function assistantHasProviderUsage(message: ContextMessageLike): boolean {
  if (message.role !== "assistant" || message.stopReason === "aborted" || message.stopReason === "error") {
    return false;
  }
  if (!message.usage || typeof message.usage !== "object") return false;
  const usage = message.usage as Record<string, unknown>;
  const fields = ["totalTokens", "input", "output", "cacheRead", "cacheWrite"];
  return fields.reduce(
    (total, field) => total + (typeof usage[field] === "number" ? usage[field] as number : 0),
    0,
  ) > 0;
}

function emptySnapshot(): ContextSnapshot {
  return buildContextSnapshot({
    systemPrompt: "",
    messages: [],
    tools: [],
    contextWindow: 0,
  });
}

function restoreEnabled(ctx: ExtensionContext): boolean {
  for (const entry of [...ctx.sessionManager.getBranch()].reverse()) {
    if (entry.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE) continue;
    const data = entry.data as { enabled?: unknown } | undefined;
    if (typeof data?.enabled === "boolean") return data.enabled;
  }
  return true;
}

export default function contextBar(pi: ExtensionAPI): void {
  let enabled = true;
  let snapshot = emptySnapshot();
  let messages: ContextMessageLike[] = [];
  let systemPrompt = "";
  let systemPromptOptions: BuildSystemPromptOptions | undefined;
  let providerRequestFingerprint: string | undefined;
  let widgetInstalled = false;
  let requestWidgetRender: (() => void) | undefined;
  let previousEditorFactory: EditorFactory | undefined;
  let editorFactory: EditorFactory | undefined;
  let activeEditor: ReturnType<EditorFactory> | undefined;

  function activeTools() {
    const activeNames = new Set(pi.getActiveTools());
    return pi.getAllTools().filter((tool) => activeNames.has(tool.name));
  }

  function loadSessionMessages(ctx: ExtensionContext): ContextMessageLike[] {
    return ctx.sessionManager.buildContextEntries()
      .flatMap(sessionEntryToContextMessages) as ContextMessageLike[];
  }

  function computeSnapshot(ctx: ExtensionContext): void {
    const usage = ctx.getContextUsage();
    const tools = activeTools();
    snapshot = buildContextSnapshot({
      systemPrompt,
      systemPromptOptions,
      messages,
      tools,
      contextWindow: ctx.model?.contextWindow ?? usage?.contextWindow ?? 0,
      cwd: ctx.cwd,
      aggregateTokens: usage?.tokens,
      aggregateMatchesRequest: providerRequestFingerprint === requestFingerprint(systemPrompt, tools),
      model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
    });
  }

  function installEditorIntegration(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui" || editorFactory) return;
    previousEditorFactory = ctx.ui.getEditorComponent();
    const previous = previousEditorFactory;
    editorFactory = (tui, theme, keybindings) => {
      activeEditor = withoutTopEditorBorder(
        previous?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings),
      );
      return activeEditor;
    };
    ctx.ui.setEditorComponent(editorFactory);
  }

  function restoreEditor(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui" || !editorFactory) return;
    if (ctx.ui.getEditorComponent() === editorFactory) {
      ctx.ui.setEditorComponent(previousEditorFactory);
    }
    editorFactory = undefined;
    previousEditorFactory = undefined;
    activeEditor = undefined;
  }

  function clearWidget(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") return;
    if (widgetInstalled) {
      widgetInstalled = false;
      requestWidgetRender = undefined;
      ctx.ui.setWidget(WIDGET_KEY, undefined, { placement: "aboveEditor" });
    }
    restoreEditor(ctx);
  }

  function refresh(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") return;
    if (!enabled) {
      clearWidget(ctx);
      return;
    }
    computeSnapshot(ctx);
    installEditorIntegration(ctx);
    if (widgetInstalled) {
      requestWidgetRender?.();
      return;
    }

    widgetInstalled = true;
    ctx.ui.setWidget(
      WIDGET_KEY,
      (tui, theme) => {
        const render = () => tui.requestRender();
        requestWidgetRender = render;
        const component = createContextBarComponent(
          () => snapshot,
          theme,
          () => activeEditor?.borderColor,
        );
        return {
          ...component,
          dispose: () => {
            if (requestWidgetRender === render) {
              requestWidgetRender = undefined;
              widgetInstalled = false;
            }
          },
        };
      },
      { placement: "aboveEditor" },
    );
  }

  pi.on("session_start", (_event, ctx) => {
    enabled = restoreEnabled(ctx);
    providerRequestFingerprint = undefined;
    if (enabled) {
      systemPrompt = ctx.getSystemPrompt();
      systemPromptOptions = undefined;
      messages = loadSessionMessages(ctx);
    } else {
      systemPrompt = "";
      systemPromptOptions = undefined;
      messages = [];
    }
    refresh(ctx);
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (!enabled) return;
    systemPrompt = event.systemPrompt;
    systemPromptOptions = event.systemPromptOptions;
    refresh(ctx);
  });

  pi.on("agent_start", (_event, ctx) => {
    if (!enabled) return;
    systemPrompt = ctx.getSystemPrompt();
    refresh(ctx);
  });

  pi.on("context", (event, ctx) => {
    if (!enabled) return;
    messages = event.messages as ContextMessageLike[];
    refresh(ctx);
  });

  pi.on("message_end", (event, ctx) => {
    if (!enabled) return;
    const message = event.message as ContextMessageLike;
    messages = [...messages, message];
    if (assistantHasProviderUsage(message)) {
      providerRequestFingerprint = requestFingerprint(systemPrompt, activeTools());
    }
    refresh(ctx);
  });

  pi.on("agent_settled", (_event, ctx) => refresh(ctx));
  pi.on("model_select", (_event, ctx) => refresh(ctx));

  pi.on("session_compact", (_event, ctx) => {
    providerRequestFingerprint = undefined;
    if (!enabled) return;
    messages = loadSessionMessages(ctx);
    refresh(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    if (!enabled) return;
    messages = loadSessionMessages(ctx);
    refresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    messages = [];
    systemPrompt = "";
    systemPromptOptions = undefined;
    providerRequestFingerprint = undefined;
    snapshot = emptySnapshot();
    clearWidget(ctx);
  });

  function clearAccountingInputs(): void {
    messages = [];
    systemPrompt = "";
    systemPromptOptions = undefined;
  }

  function loadCommandInputs(ctx: ExtensionCommandContext): void {
    systemPrompt = ctx.getSystemPrompt();
    systemPromptOptions = ctx.getSystemPromptOptions();
    messages = loadSessionMessages(ctx);
  }

  function setEnabled(nextEnabled: boolean, ctx: ExtensionContext): void {
    if (enabled === nextEnabled) {
      if (ctx.hasUI) ctx.ui.notify(`context-bar is already ${enabled ? "on" : "off"}`, "info");
      return;
    }
    enabled = nextEnabled;
    pi.appendEntry(STATE_ENTRY_TYPE, { enabled });
    refresh(ctx);
    if (!enabled) clearAccountingInputs();
    if (ctx.hasUI) ctx.ui.notify(`context-bar ${enabled ? "enabled" : "disabled"}`, "info");
  }

  pi.registerCommand("context-bar", {
    description: "Toggle or inspect the context-window composition bar",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (!action) {
        if (!enabled) loadCommandInputs(ctx);
        setEnabled(!enabled, ctx);
      } else if (action === "on") {
        if (!enabled) loadCommandInputs(ctx);
        setEnabled(true, ctx);
      } else if (action === "off") setEnabled(false, ctx);
      else if (action === "status") {
        loadCommandInputs(ctx);
        computeSnapshot(ctx);
        if (ctx.hasUI) {
          ctx.ui.notify(
            formatContextStatus(snapshot, enabled, ctx.ui.theme, activeEditor?.borderColor),
            "info",
          );
        }
        if (!enabled) clearAccountingInputs();
      } else if (ctx.hasUI) {
        ctx.ui.notify("Usage: /context-bar [on|off|status]", "warning");
      }
    },
  });
}
