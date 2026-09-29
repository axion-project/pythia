# Pythia v0.1.0

**Pythia** is a mobile-first, approve-before-apply AI assistant for [ACode](https://acode.app/).

Use your own OpenRouter or Hugging Face API key to ask questions about the active file, review code, refactor a selection, generate tests, and propose edits. Pythia shows the context that will leave your device, renders a diff for proposed changes, and never applies an edit until you approve it.

## Install

1. Download `pythia-v0.1.0.zip` from this folder.
2. Open **ACode** on Android.
3. Open **Plugins**.
4. Choose **Install from file**.
5. Select `pythia-v0.1.0.zip`.
6. Open ACode's command palette and run **Pythia: Configure Provider and Model**.
7. Select a provider, enter your API key, and enter or accept a model ID.

## Supported providers

- **OpenRouter**
  - Default model: `nvidia/nemotron-3-ultra-550b-a55b:free`
  - API endpoint: `https://openrouter.ai/api/v1/chat/completions`

- **Hugging Face Router**
  - Default model: `Qwen/Qwen2.5-Coder-32B-Instruct`
  - API endpoint: `https://router.huggingface.co/v1/chat/completions`

Pythia uses OpenAI-compatible chat-completions requests. You may enter another compatible model ID available through your selected provider.

## Commands

Open ACode's command palette and run one of the following commands:

| Command | What it does |
|---|---|
| **Pythia: Ask About Selection or File** | Ask a question using the active file and, when present, the current selection. |
| **Pythia: Explain Active File** | Explain the file's purpose, structure, and notable behavior. |
| **Pythia: Review Active File** | Review the active file for bugs, security concerns, and edge cases. |
| **Pythia: Refactor Selection** | Propose a replacement for the selected code. |
| **Pythia: Generate Tests** | Draft a new test file from the current selection or active file. |
| **Pythia: Propose Edit** | Request a specific edit to the active file. |
| **Pythia: Create File** | Draft a new file as an unsaved ACode editor tab. |
| **Pythia: Configure Provider and Model** | Choose OpenRouter or Hugging Face and configure a model/API key. |
| **Pythia: Export Conversation** | Export a saved conversation as a Markdown file in ACode. |
| **Pythia: Undo Last Apply** | Use ACode's editor undo action to revert the most recent applied edit. |

## Context and privacy

Before each model request, Pythia displays the provider, selected model, and the exact project material it will send.

Pythia can send only:

- The active file, capped at 30 KB.
- The current editor selection, if one exists.
- One optional project rules file, capped at 8 KB.

Pythia looks for project rules beside the active file in this order:

```text
AGENTS.md
rules.md
.pythia/rules.md
```

Pythia does not recursively scan or index the project. It does not run terminal commands, access GitHub, deploy software, or make external changes beyond sending the reviewed context to the model provider you select.

## Edit safety

Pythia uses an approve-before-apply workflow:

1. You request an edit.
2. Pythia sends the displayed context to your chosen model provider.
3. The model returns a structured proposal.
4. Pythia shows an in-editor diff.
5. You choose **Apply** or **Discard**.

Additional safeguards:

- Selection edits fail if the selection changed after the request was sent.
- Whole-file edits fail if the active file changed after the request was sent.
- Whole-file replacement is refused when the active file was truncated for the model request.
- New files open as unsaved tabs. The model does not choose where to save them.
- You can use **Pythia: Undo Last Apply** after an applied edit.

## Local storage

Pythia stores its provider selection, configured model IDs, API keys, and conversation history in ACode's local plugin storage on the device.

Use a scoped or low-limit API key where your provider supports one. Do not use a credential that has broader privileges than needed for model inference.

## Known limitations

- Pythia works with the active file, selection, and one local rules file only; it does not provide whole-codebase retrieval.
- Large files are capped at 30 KB of outbound context.
- Generated test conventions are inferred from the supplied context; include an existing test file manually when framework-specific conventions matter.
- Pythia requires network access to the provider you select.
- API keys are stored locally by ACode; this release does not integrate an Android Keystore-backed credential vault.

## Source and license

Source code and license information are available in the repository root:

[axion-project/pythia](https://github.com/axion-project/pythia)

## Version

`v0.1.0`
