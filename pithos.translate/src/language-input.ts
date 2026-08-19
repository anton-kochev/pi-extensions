import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  Input,
  type Component,
  type Focusable,
  type TUI,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

export const TARGET_LANGUAGE_PLACEHOLDER = "English, Ukrainian, …";

/** Compact, single-line target-language field used by the configuration wizard. */
export class TargetLanguageInput implements Component, Focusable {
  private readonly input = new Input();
  private _focused = false;

  constructor(
    private readonly tui: Pick<TUI, "requestRender">,
    private readonly theme: Theme,
    initialValue: string | undefined,
    onDone: (value: string | undefined) => void,
  ) {
    if (initialValue) this.input.handleInput(initialValue);
    this.input.onSubmit = onDone;
    this.input.onEscape = () => onDone(undefined);
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.input.focused = value;
  }

  handleInput(data: string): void {
    this.input.handleInput(data);
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const label = this.theme.fg("accent", this.theme.bold("Target language")) + this.theme.fg("muted", ": ");
    if (this.input.getValue() === "") {
      const marker = this.focused ? CURSOR_MARKER : "";
      const cursor = `${marker}\u001b[7m \u001b[27m`;
      const placeholder = this.theme.fg("dim", TARGET_LANGUAGE_PLACEHOLDER);
      return [truncateToWidth(`${label}${cursor}${placeholder}`, width, "")];
    }

    const labelWidth = visibleWidth(label);
    const inputWidth = Math.max(3, width - labelWidth + 2);
    const rendered = this.input.render(inputWidth)[0] ?? "";
    const withoutPrompt = rendered.startsWith("> ") ? rendered.slice(2) : rendered;
    return [truncateToWidth(`${label}${withoutPrompt}`, width, "")];
  }

  invalidate(): void {
    this.input.invalidate();
  }
}
