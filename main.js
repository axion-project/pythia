/* Pythia 0.1.0: approve-before-apply AI assistant for Acode.
   Providers: OpenRouter, Hugging Face router (OpenAI-compatible chat). */
(() => {
  const ID = 'com.aedin.pythia';
  const STORE = 'pythia:v1';
  const MAX_FILE = 30000;
  const RULE_FILES = ['AGENTS.md', 'rules.md', '.pythia/rules.md'];
  const PROVIDERS = {
    openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
    huggingface: { name: 'Hugging Face', url: 'https://router.huggingface.co/v1/chat/completions', model: 'Qwen/Qwen2.5-Coder-32B-Instruct' }
  };
  const SYS_CHAT = 'You are Pythia, a concise expert coding assistant inside a mobile code editor. Keep answers compact and readable on a small screen. Follow the project rules if provided.';
  const SYS_EDIT = 'You are Pythia, a coding assistant inside a mobile code editor. Reply with ONLY one JSON object, no markdown fences: ' +
    '{"kind":"replace_selection"|"replace_file"|"create_file"|"none","explanation":string,"path":string,"content":string}. ' +
    'replace_selection: content replaces exactly the provided selection. replace_file: content is the complete new active file. ' +
    'create_file: path is a bare filename, content is the file. none: no edit, put the answer in explanation. Follow the project rules if provided.';

  const $ = (n) => acode.require(n);
  const toast = (m) => (window.toast ? window.toast(m, 3000) : alert(m));

  // ---------- storage ----------
  const load = () => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) {}
    return Object.assign({ provider: 'openrouter', keys: {}, models: {}, history: [] }, s);
  };
  const save = (s) => localStorage.setItem(STORE, JSON.stringify(s));

  // ---------- tiny DOM helper ----------
  const h = (tag, css, text, props) => {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    if (props) Object.assign(e, props);
    return e;
  };
  const BTN = 'padding:10px 14px;border:0;border-radius:8px;background:var(--active-color,#3399ff);color:#fff;font-size:15px;';
  const BTN2 = 'padding:10px 14px;border:1px solid rgba(128,128,128,.6);border-radius:8px;background:transparent;color:inherit;font-size:15px;';

  // ---------- configuration ----------
  async function configure() {
    const s = load();
    const p = await $('select')('Provider', Object.keys(PROVIDERS).map((k) => [k, PROVIDERS[k].name]), { default: s.provider });
    if (!p) return;
    const key = await $('prompt')(PROVIDERS[p].name + ' API key' + (s.keys[p] ? ' (leave as is to keep)' : ''), s.keys[p] || '', 'text');
    if (key === null) return;
    const model = await $('prompt')('Model id', s.models[p] || PROVIDERS[p].model, 'text');
    if (model === null) return;
    s.provider = p; s.keys[p] = key.trim(); s.models[p] = model.trim() || PROVIDERS[p].model;
    save(s);
    toast('Pythia: using ' + PROVIDERS[p].name + ' / ' + s.models[p]);
  }

  // ---------- model call ----------
  async function callModel(messages) {
    const s = load(), p = PROVIDERS[s.provider], key = s.keys[s.provider];
    if (!key) throw new Error('No API key set. Run "Pythia: Configure Provider and Model".');
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
    if (s.provider === 'openrouter') headers['X-Title'] = 'Pythia';
    const r = await fetch(p.url, {
      method: 'POST', headers,
      body: JSON.stringify({ model: s.models[s.provider] || p.model, messages, temperature: 0.2 })
    });
    if (!r.ok) throw new Error('Request failed: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  }

  // ---------- context ----------
  async function readRules(file) {
    const uri = file.uri || '';
    const dir = uri.slice(0, uri.lastIndexOf('/'));
    if (!dir) return null;
    for (const name of RULE_FILES) {
      try {
        const txt = await $('fsOperation')(dir + '/' + name).readFile('utf8');
        if (typeof txt === 'string' && txt.trim()) return { name, text: txt.slice(0, 8000) };
      } catch (e) { /* not present */ }
    }
    return null;
  }

  async function buildContext(wantSelection) {
    const file = editorManager.activeFile, ed = editorManager.editor;
    if (!file) throw new Error('Open a file first.');
    const sel = ed.session.getTextRange(ed.getSelectionRange());
    if (wantSelection && !sel) throw new Error('Select some text first.');
    const full = ed.getValue();
    const truncated = full.length > MAX_FILE;
    const rules = await readRules(file);
    const range = sel ? ed.getSelectionRange().clone() : null;
    const items = [];
    items.push(file.filename + ', ' + (Math.min(full.length, MAX_FILE) / 1024).toFixed(1) + ' KB' + (truncated ? ' (truncated)' : ''));
    if (sel) items.push('Selection: lines ' + (range.start.row + 1) + '-' + (range.end.row + 1));
    if (rules) items.push(rules.name + ', ' + (rules.text.length / 1024).toFixed(1) + ' KB');
    return { file, sel, range, full, text: full.slice(0, MAX_FILE), truncated, rules, items };
  }

  function userMessage(c, instruction) {
    let m = '';
    if (c.rules) m += 'Project rules (' + c.rules.name + '):\n```\n' + c.rules.text + '\n```\n\n';
    m += 'Active file: ' + c.file.filename + (c.truncated ? ' (truncated)' : '') + '\n```\n' + c.text + '\n```\n\n';
    if (c.sel) m += 'Selection:\n```\n' + c.sel + '\n```\n\n';
    return m + 'Task: ' + instruction;
  }

  // ---------- diff ----------
  function diffOps(a, b) {
    const A = a.split('\n'), B = b.split('\n');
    let s = 0;
    while (s < A.length && s < B.length && A[s] === B[s]) s++;
    let e = 0;
    while (e < A.length - s && e < B.length - s && A[A.length - 1 - e] === B[B.length - 1 - e]) e++;
    const a2 = A.slice(s, A.length - e), b2 = B.slice(s, B.length - e);
    const ops = A.slice(0, s).map((x) => [' ', x]);
    const n = a2.length, m = b2.length;
    if (n * m > 4e6) {
      a2.forEach((x) => ops.push(['-', x])); b2.forEach((x) => ops.push(['+', x]));
    } else {
      const w = m + 1, dp = new Uint16Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
        dp[i * w + j] = a2[i] === b2[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (a2[i] === b2[j]) { ops.push([' ', a2[i]]); i++; j++; }
        else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) ops.push(['-', a2[i++]]);
        else ops.push(['+', b2[j++]]);
      }
      while (i < n) ops.push(['-', a2[i++]]);
      while (j < m) ops.push(['+', b2[j++]]);
    }
    A.slice(A.length - e).forEach((x) => ops.push([' ', x]));
    return ops;
  }

  function diffNode(oldText, newText) {
    const ops = diffOps(oldText, newText), keep = new Array(ops.length).fill(false);
    ops.forEach((o, i) => { if (o[0] !== ' ') for (let k = Math.max(0, i - 2); k <= Math.min(ops.length - 1, i + 2); k++) keep[k] = true; });
    const box = h('div', 'font-family:monospace;font-size:12px;overflow-x:auto;border:1px solid rgba(128,128,128,.4);border-radius:6px;margin:8px 0;white-space:pre;');
    let skipped = 0, changed = 0;
    const flush = () => { if (skipped) { box.appendChild(h('div', 'opacity:.5;padding:2px 6px;', '... ' + skipped + ' unchanged lines')); skipped = 0; } };
    ops.forEach((o, i) => {
      if (o[0] !== ' ') changed++;
      if (!keep[i]) { skipped++; return; }
      flush();
      const bg = o[0] === '+' ? 'rgba(60,180,80,.25)' : o[0] === '-' ? 'rgba(220,70,70,.25)' : 'transparent';
      box.appendChild(h('div', 'padding:0 6px;background:' + bg + ';min-width:max-content;', o[0] + ' ' + o[1]));
    });
    flush();
    if (!changed) box.appendChild(h('div', 'padding:6px;', 'No changes.'));
    return box;
  }

  // ---------- panel ----------
  let panel = null;
  function closePanel() { if (panel) { panel.root.remove(); panel = null; } }

  function openPanel(title, onSend) {
    closePanel();
    const root = h('div', 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:var(--primary-color,#222);color:var(--primary-text-color,#eee);font-family:sans-serif;padding-top:env(safe-area-inset-top,0px);');
    const head = h('div', 'display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.4);');
    head.appendChild(h('div', 'flex:1;font-weight:bold;', title));
    head.appendChild(h('button', BTN2, 'Close', { onclick: closePanel }));
    const body = h('div', 'flex:1;overflow:auto;padding:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word;user-select:text;-webkit-user-select:text;');
    const actions = h('div', 'display:none;gap:8px;padding:8px 12px;border-top:1px solid rgba(128,128,128,.4);');
    const foot = h('div', 'display:flex;gap:8px;padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(128,128,128,.4);');
    const ta = h('textarea', 'flex:1;min-height:44px;max-height:120px;border-radius:8px;padding:8px;background:rgba(128,128,128,.15);color:inherit;border:1px solid rgba(128,128,128,.4);', null, { placeholder: 'Follow up...' });
    const send = h('button', BTN, 'Send', {
      onclick: () => { const t = ta.value.trim(); if (t) { ta.value = ''; onSend(t); } }
    });
    foot.append(ta, send);
    root.append(head, body, actions, foot);
    document.body.appendChild(root);
    panel = {
      root,
      say(role, text) {
        body.appendChild(h('div', 'font-size:11px;opacity:.6;margin-top:10px;text-transform:uppercase;', role));
        body.appendChild(h('div', '', text));
        body.scrollTop = body.scrollHeight;
      },
      node(n) { body.appendChild(n); body.scrollTop = body.scrollHeight; },
      actions(list) {
        actions.textContent = '';
        list.forEach(([label, fn, primary]) => actions.appendChild(h('button', primary ? BTN : BTN2, label, { onclick: fn })));
        actions.style.display = list.length ? 'flex' : 'none';
      },
      busy(b) { send.disabled = b; send.textContent = b ? '...' : 'Send'; }
    };
    return panel;
  }

  // ---------- proposals ----------
  function parseProposal(text) {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    try {
      const p = JSON.parse(text.slice(a, b + 1));
      if (['replace_selection', 'replace_file', 'create_file', 'none'].includes(p.kind)) return p;
    } catch (e) {}
    return { kind: 'none', explanation: text };
  }

  function applyProposal(p, c) {
    const ed = editorManager.editor;
    if (p.kind !== 'create_file' && editorManager.activeFile !== c.file) throw new Error('Active file changed. Re-run.');
    if (p.kind === 'replace_selection') {
      if (!c.range || ed.session.getTextRange(c.range) !== c.sel) throw new Error('Selection changed since the request. Re-run.');
      ed.session.replace(c.range, p.content);
    } else if (p.kind === 'replace_file') {
      if (c.truncated) throw new Error('File was truncated when sent; whole-file replace is refused. Use a selection edit.');
      if (ed.getValue() !== c.full) throw new Error('File changed since the request. Re-run.');
      const last = ed.session.getLength() - 1, Range = ace.require('ace/range').Range;
      ed.session.replace(new Range(0, 0, last, ed.session.getLine(last).length), p.content);
    } else if (p.kind === 'create_file') {
      const name = String(p.path || 'pythia-new.txt').split(/[\\/]/).pop().replace(/[^\w.\- ]/g, '_') || 'pythia-new.txt';
      editorManager.addNewFile(name, { text: p.content, render: true });
    }
  }

  function showProposal(p, c) {
    if (p.explanation) panel.say('Pythia', p.explanation);
    if (p.kind === 'none') { panel.actions([]); return; }
    if (typeof p.content !== 'string') { panel.say('Pythia', 'Malformed proposal (no content).'); return; }
    const before = p.kind === 'replace_selection' ? c.sel : p.kind === 'replace_file' ? c.full : '';
    panel.say('Proposal', p.kind + (p.kind === 'create_file' ? ': ' + p.path : ''));
    panel.node(diffNode(before, p.content));
    panel.actions([
      ['Apply', () => {
        try { applyProposal(p, c); toast('Applied. Use "Pythia: Undo Last Apply" to revert.'); panel.actions([]); if (p.kind !== 'create_file') closePanel(); }
        catch (e) { toast(e.message); }
      }, true],
      ['Discard', () => panel.actions([])]
    ]);
  }

  // ---------- session runner ----------
  async function run({ title, mode, instruction, wantSelection }) {
    let c;
    try { c = await buildContext(wantSelection); } catch (e) { return toast(e.message); }
    const s = load();
    const model = s.models[s.provider] || PROVIDERS[s.provider].model;
    const ok = await $('confirm')('Send to ' + PROVIDERS[s.provider].name + '?',
      model + '\n\n' + c.items.map((i) => '- ' + i).join('\n') + '\n\nNothing else leaves your device.');
    if (!ok) return;

    const conv = [
      { role: 'system', content: mode === 'edit' ? SYS_EDIT : SYS_CHAT },
      { role: 'user', content: userMessage(c, instruction) }
    ];
    const entry = { id: Date.now(), title: title + ': ' + c.file.filename, provider: s.provider, model, messages: [] };

    const persist = () => {
      const st = load();
      entry.messages = conv.slice(1);
      st.history = [entry].concat(st.history.filter((x) => x.id !== entry.id)).slice(0, 40);
      save(st);
    };

    const turn = async () => {
      panel.busy(true);
      try {
        const reply = await callModel(conv);
        conv.push({ role: 'assistant', content: reply });
        persist();
        if (mode === 'edit') showProposal(parseProposal(reply), c); else panel.say('Pythia', reply);
      } catch (e) { panel.say('Error', e.message); }
      panel.busy(false);
    };

    openPanel(title, (t) => {
      panel.say('You', t);
      conv.push({ role: 'user', content: t });
      turn();
    });
    panel.say('You', instruction);
    turn();
  }

  const ask = (msg, def) => $('prompt')(msg, def || '', 'text');

  const TASKS = {
    ask: async () => { const q = await ask('Ask Pythia'); if (q) run({ title: 'Ask', mode: 'chat', instruction: q }); },
    explain: () => run({ title: 'Explain', mode: 'chat', instruction: 'Explain what this file does, how it is structured, and anything surprising.' }),
    review: () => run({ title: 'Review', mode: 'chat', instruction: 'Review this code for bugs, security issues and missing edge cases. Prioritize findings, be specific.' }),
    refactor: async () => {
      const q = await ask('Refactor instruction', 'Refactor for clarity without changing behavior.');
      if (q) run({ title: 'Refactor', mode: 'edit', wantSelection: true, instruction: q + ' Use replace_selection.' });
    },
    tests: () => run({ title: 'Tests', mode: 'edit', instruction: 'Write tests for the selection if present, otherwise the file. Use create_file with a sensible filename.' }),
    propose: async () => { const q = await ask('Describe the edit'); if (q) run({ title: 'Edit', mode: 'edit', instruction: q }); },
    create: async () => { const q = await ask('Describe the file to create'); if (q) run({ title: 'Create', mode: 'edit', instruction: q + ' Use create_file.' }); }
  };

  async function exportConversation() {
    const hist = load().history;
    if (!hist.length) return toast('No conversations yet.');
    const id = await $('select')('Export which?', hist.map((x) => [String(x.id), new Date(x.id).toLocaleString() + '  ' + x.title]));
    const e = hist.find((x) => String(x.id) === id);
    if (!e) return;
    const md = '# ' + e.title + '\n\n' + e.provider + ' / ' + e.model + '\n\n' +
      e.messages.map((m) => '## ' + m.role + '\n\n' + m.content).join('\n\n');
    editorManager.addNewFile('pythia-' + e.id + '.md', { text: md, render: true });
  }

  // ---------- registration ----------
  const COMMANDS = [
    ['pythia-ask', 'Pythia: Ask About Selection or File', TASKS.ask],
    ['pythia-explain', 'Pythia: Explain Active File', TASKS.explain],
    ['pythia-review', 'Pythia: Review Active File', TASKS.review],
    ['pythia-refactor', 'Pythia: Refactor Selection', TASKS.refactor],
    ['pythia-tests', 'Pythia: Generate Tests', TASKS.tests],
    ['pythia-propose', 'Pythia: Propose Edit', TASKS.propose],
    ['pythia-create', 'Pythia: Create File', TASKS.create],
    ['pythia-config', 'Pythia: Configure Provider and Model', configure],
    ['pythia-export', 'Pythia: Export Conversation', exportConversation],
    ['pythia-undo', 'Pythia: Undo Last Apply', () => editorManager.editor.undo()]
  ];

  acode.setPluginInit(ID, async () => {
    COMMANDS.forEach(([name, description, fn]) =>
      editorManager.editor.commands.addCommand({ name, description, bindKey: null, exec: () => { fn(); } }));
  });
  acode.setPluginUnmount(ID, () => {
    closePanel();
    COMMANDS.forEach(([name]) => editorManager.editor.commands.removeCommand(name));
  });
})();
