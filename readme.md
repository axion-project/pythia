# Pythia

Approve-before-apply AI assistant for Acode. Bring your own OpenRouter or Hugging Face key.

## Setup
1. Install the zip via Acode > Plugins > Install from file.
2. Open the command palette, run **Pythia: Configure Provider and Model**.

## Commands
Ask, Explain Active File, Review Active File, Refactor Selection, Generate Tests, Propose Edit, Create File, Configure, Export Conversation, Undo Last Apply.

## Safety model
- Only the active file (capped at 30 KB), the selection, and a rules file (`AGENTS.md`, `rules.md` or `.pythia/rules.md` next to the active file) are sent. You confirm the list every time.
- Edits show a diff. Nothing changes until you tap Apply. Undo Last Apply reverts.
- Whole-file and selection edits refuse to apply if the file or selection changed meanwhile.
- New files open as unsaved tabs; the model never chooses a path.
- Keys and history live in this app's local storage only.
