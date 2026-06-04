# answer

Interactive Q&A extraction for pi assistant responses.

`answer` adds an `/answer` command that turns questions from the last assistant response into an interactive answer form, then submits the compiled answers back to the agent.

It demonstrates the prompt-generator pattern with custom TUI:

1. `/answer` gets the last assistant message.
2. A spinner is shown while questions are extracted as structured JSON.
3. A custom TUI lets you navigate questions and write answers.
4. When done, the compiled answers are submitted as a new user message.

## Install

```bash
pi install npm:@anton-kochev/answer
```

Inside a [pithos](https://github.com/anton-kochev/pithos) container this extension is preinstalled — `/answer` works out of the box with no install step.

For local development from this repository:

```bash
pi install ./answer
pi install ./answer -l   # project-local
```

Temporary test run:

```bash
pi -e ./answer
```

## Usage

After an assistant response that contains questions, run:

```text
/answer
```

Keys in the TUI:

- `Tab`: go to next question
- `Shift+Tab`: go to previous question
- `Up` / `Down`: focus and navigate options when a question has them
- `Space` / `Enter`: select the focused option (`single` or `multiple`, depending on the question)
- Long free-text answers wrap across multiple lines
- `Shift+Enter` / `Alt+Enter`: insert a newline in the free-text answer
- `Left` / `Right`: move within the free-text answer
- `Enter`: save and go next when options are not focused; on the last question, submit if complete
- `Ctrl+S`: submit when all questions are answered or have selected options
- `Esc`: cancel

## Notes

This package imports pi runtime packages as peer dependencies:

- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

Do not bundle those dependencies; pi provides them at runtime.
