(() => {
  'use strict';

  const OCR_PROMPT = `Tu regardes une photo d'un tableau de calculs dans un cahier de labo.
Notation française : la VIRGULE est le séparateur décimal. Convertis toutes les virgules en points dans le JSON.
Ignore les cellules "N/A" ou vides (mets null).

Identifie le type de tableau parmi 4 :

TYPE "distributed" : une colonne de valeurs + UN scalaire fixe + UN opérateur = une colonne de résultats.
Retourne :
{"type":"distributed","operation":"*","scalar":0.01,"rows":[{"label":"A","input":1.8,"written":0.018},{"label":"E","input":null,"written":null}]}

TYPE "vector" : chaque ligne est une expression arithmétique avec résultat à droite.
Les opérateurs peuvent être différents entre les colonnes et des parenthèses peuvent grouper des termes.
Représente l'expression comme un tableau "tokens" mixte : nombres et chaînes "+" "-" "*" "/" "(" ")".
Exemple simple       : 1,5 − 0,15 − 0,3 = 1,050
→ {"label":"A","tokens":[1.5,"-",0.15,"-",0.3],"written":1.050}
Exemple avec parenthèses : (0,035 + 19,600) × 1,13 = 22,19
→ {"label":"A","tokens":["(",0.035,"+",19.6,")","*",1.13],"written":22.19}
Retourne :
{"type":"vector","rows":[{"label":"A","tokens":[1.5,"-",0.15,"-",0.3,"-",0.00035],"written":1.050},{"label":"E","tokens":null,"written":null}]}

TYPE "yield" : deux colonnes sont multipliées pour donner une troisième (rendement, masse, etc.).
Retourne :
{"type":"yield","rows":[{"label":"A","a":0.4940,"c":0.522,"written":0.258},{"label":"E","a":null,"c":null,"written":null}]}

TYPE "average" : chaque ligne contient plusieurs valeurs, une colonne finale donne leur moyenne.
Retourne :
{"type":"average","rows":[{"label":"A","terms":[1.93,1.91,1.92],"written":1.92},{"label":"E","terms":null,"written":null}]}

Réponds UNIQUEMENT avec le JSON valide, sans markdown, sans explication.`;

  const state = {
    imageDataURL: null,
    ocrEngine:    localStorage.getItem('ocrEngine') || 'gemini',
    geminiKey:    localStorage.getItem('geminiKey') || '',
    openaiKey:    localStorage.getItem('openaiKey') || '',
    claudeKey:    localStorage.getItem('claudeKey') || '',
  };

  let editState = null;

  const $ = id => document.getElementById(id);

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
  }
  function setStatus(t) { $('status-text').textContent = t; }
  function showError(msg) { const el = $('error-banner'); el.textContent = msg; el.classList.add('visible'); }
  function clearError()   { $('error-banner').classList.remove('visible'); }
  function formatFR(n)    { return (n == null) ? '—' : n.toString().replace('.', ','); }

  // ── Capture ───────────────────────────────────────────────────────────────
  function handleFile(file) {
    if (!file) return;
    clearError();
    const reader = new FileReader();
    reader.onload = e => {
      state.imageDataURL = e.target.result;
      const img = $('preview-img');
      img.src = e.target.result;
      img.style.display = 'block';
      $('preview-placeholder').style.display = 'none';
      $('btn-next-crop').style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  $('btn-camera').addEventListener('click',  () => $('input-camera').click());
  $('btn-gallery').addEventListener('click', () => $('input-gallery').click());
  $('input-camera').addEventListener('change',  e => handleFile(e.target.files[0]));
  $('input-gallery').addEventListener('change', e => handleFile(e.target.files[0]));
  $('btn-next-crop').addEventListener('click', () => { if (state.imageDataURL) openCrop(); });

  $('btn-retry').addEventListener('click', () => {
    state.imageDataURL = null;
    $('preview-img').style.display = 'none';
    $('preview-img').src = '';
    $('preview-placeholder').style.display = '';
    $('btn-next-crop').style.display = 'none';
    $('input-camera').value = '';
    $('input-gallery').value = '';
    clearError();
    showScreen('screen-capture');
  });

  // ── Crop ──────────────────────────────────────────────────────────────────
  const cropCanvas = $('crop-canvas');
  const cropCtx    = cropCanvas.getContext('2d');
  const cropImg    = new Image();
  let imgRect   = { x: 0, y: 0, w: 0, h: 0 };
  let sel       = { x1: 0, y1: 0, x2: 0, y2: 0 };
  let dragState = null;
  const HANDLE_R = 28, MIN_SEL = 20;

  function openCrop() {
    cropImg.onload = () => {
      const wrap = cropCanvas.parentElement;
      const cw = wrap.clientWidth, ch = wrap.clientHeight;
      cropCanvas.width = cw; cropCanvas.height = ch;
      const scale = Math.min(cw / cropImg.naturalWidth, ch / cropImg.naturalHeight);
      const iw = cropImg.naturalWidth * scale, ih = cropImg.naturalHeight * scale;
      const ix = (cw - iw) / 2, iy = (ch - ih) / 2;
      imgRect = { x: ix, y: iy, w: iw, h: ih };
      sel = { x1: ix, y1: iy, x2: ix + iw, y2: iy + ih };
      drawCrop();
      showScreen('screen-crop');
    };
    cropImg.src = state.imageDataURL;
  }

  function drawCrop() {
    const cw = cropCanvas.width, ch = cropCanvas.height;
    cropCtx.clearRect(0, 0, cw, ch);
    cropCtx.drawImage(cropImg, imgRect.x, imgRect.y, imgRect.w, imgRect.h);
    cropCtx.fillStyle = 'rgba(0,0,0,0.55)';
    cropCtx.fillRect(0,      0,      cw,           sel.y1);
    cropCtx.fillRect(0,      sel.y2, cw,           ch - sel.y2);
    cropCtx.fillRect(0,      sel.y1, sel.x1,       sel.y2 - sel.y1);
    cropCtx.fillRect(sel.x2, sel.y1, cw - sel.x2, sel.y2 - sel.y1);
    cropCtx.strokeStyle = '#007aff'; cropCtx.lineWidth = 2.5;
    cropCtx.strokeRect(sel.x1, sel.y1, sel.x2 - sel.x1, sel.y2 - sel.y1);
    const hs = 14; cropCtx.fillStyle = '#007aff';
    [[sel.x1,sel.y1],[sel.x2,sel.y1],[sel.x1,sel.y2],[sel.x2,sel.y2]].forEach(([cx,cy]) => {
      cropCtx.fillRect(cx - hs/2, cy - hs/2, hs, hs);
    });
  }

  function getCorner(x, y) {
    return [
      { id:'tl', cx:sel.x1, cy:sel.y1 }, { id:'tr', cx:sel.x2, cy:sel.y1 },
      { id:'bl', cx:sel.x1, cy:sel.y2 }, { id:'br', cx:sel.x2, cy:sel.y2 },
    ].find(c => Math.hypot(x - c.cx, y - c.cy) < HANDLE_R) || null;
  }

  function clamp(x, y) {
    return {
      x: Math.min(Math.max(x, imgRect.x), imgRect.x + imgRect.w),
      y: Math.min(Math.max(y, imgRect.y), imgRect.y + imgRect.h),
    };
  }

  function touchXY(e) {
    const r = cropCanvas.getBoundingClientRect();
    const t = e.touches[0] || e.changedTouches[0];
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  cropCanvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const { x, y } = touchXY(e);
    const corner = getCorner(x, y);
    if (corner) {
      dragState = { mode: 'corner', corner: corner.id, ss: { ...sel } };
    } else if (x >= sel.x1 && x <= sel.x2 && y >= sel.y1 && y <= sel.y2) {
      dragState = { mode: 'move', sx: x, sy: y, ss: { ...sel } };
    } else {
      dragState = { mode: 'draw', sx: x, sy: y };
      const c = clamp(x, y);
      sel = { x1: c.x, y1: c.y, x2: c.x, y2: c.y };
    }
    drawCrop();
  }, { passive: false });

  cropCanvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!dragState) return;
    const { x, y } = touchXY(e);
    const c = clamp(x, y);
    const ss = dragState.ss;
    if (dragState.mode === 'draw') {
      const s = clamp(dragState.sx, dragState.sy);
      sel = { x1: Math.min(s.x,c.x), y1: Math.min(s.y,c.y), x2: Math.max(s.x,c.x), y2: Math.max(s.y,c.y) };
    } else if (dragState.mode === 'move') {
      const dx = x - dragState.sx, dy = y - dragState.sy;
      const w = ss.x2 - ss.x1, h = ss.y2 - ss.y1;
      let nx = Math.max(imgRect.x, Math.min(ss.x1 + dx, imgRect.x + imgRect.w - w));
      let ny = Math.max(imgRect.y, Math.min(ss.y1 + dy, imgRect.y + imgRect.h - h));
      sel = { x1: nx, y1: ny, x2: nx + w, y2: ny + h };
    } else if (dragState.mode === 'corner') {
      if (dragState.corner === 'tl') { sel.x1 = Math.min(c.x, ss.x2 - MIN_SEL); sel.y1 = Math.min(c.y, ss.y2 - MIN_SEL); }
      if (dragState.corner === 'tr') { sel.x2 = Math.max(c.x, ss.x1 + MIN_SEL); sel.y1 = Math.min(c.y, ss.y2 - MIN_SEL); }
      if (dragState.corner === 'bl') { sel.x1 = Math.min(c.x, ss.x2 - MIN_SEL); sel.y2 = Math.max(c.y, ss.y1 + MIN_SEL); }
      if (dragState.corner === 'br') { sel.x2 = Math.max(c.x, ss.x1 + MIN_SEL); sel.y2 = Math.max(c.y, ss.y1 + MIN_SEL); }
    }
    drawCrop();
  }, { passive: false });

  cropCanvas.addEventListener('touchend', e => { e.preventDefault(); dragState = null; }, { passive: false });

  function extractCrop() {
    const scaleX = cropImg.naturalWidth  / imgRect.w;
    const scaleY = cropImg.naturalHeight / imgRect.h;
    const sx = (sel.x1 - imgRect.x) * scaleX, sy = (sel.y1 - imgRect.y) * scaleY;
    const sw = (sel.x2 - sel.x1) * scaleX,    sh = (sel.y2 - sel.y1) * scaleY;
    if (sw < 10 || sh < 10) return state.imageDataURL;
    const off = document.createElement('canvas');
    off.width = Math.round(sw); off.height = Math.round(sh);
    off.getContext('2d').drawImage(cropImg, sx, sy, sw, sh, 0, 0, off.width, off.height);
    return off.toDataURL('image/jpeg', 0.92);
  }

  $('btn-crop-analyze').addEventListener('click', () => analyze(extractCrop()));
  $('btn-crop-all').addEventListener('click',     () => analyze(state.imageDataURL));
  $('btn-crop-cancel').addEventListener('click',  () => showScreen('screen-capture'));

  // ── Settings ──────────────────────────────────────────────────────────────
  const ENGINES = ['gemini', 'openai', 'claude'];

  function applyEngine(engine) {
    state.ocrEngine = engine;
    ENGINES.forEach(e => {
      $(`seg-${e}`).classList.toggle('active', e === engine);
      $(`key-row-${e}`).classList.toggle('visible', e === engine);
    });
  }

  $('btn-settings').addEventListener('click', () => {
    applyEngine(state.ocrEngine);
    $('key-gemini').value = state.geminiKey;
    $('key-openai').value = state.openaiKey;
    $('key-claude').value = state.claudeKey;
    showScreen('screen-settings');
  });

  ENGINES.forEach(e => $(`seg-${e}`).addEventListener('click', () => applyEngine(e)));

  $('btn-settings-save').addEventListener('click', () => {
    localStorage.setItem('ocrEngine', state.ocrEngine);
    ['gemini','openai','claude'].forEach(e => {
      state[`${e}Key`] = $(`key-${e}`).value.trim();
      localStorage.setItem(`${e}Key`, state[`${e}Key`]);
    });
    showScreen('screen-capture');
  });
  $('btn-settings-cancel').addEventListener('click', () => {
    applyEngine(localStorage.getItem('ocrEngine') || 'gemini');
    showScreen('screen-capture');
  });

  // ── API JSON parser ────────────────────────────────────────────────────────
  function parseAPIResponse(text) {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```|(\{[\s\S]*\})/);
    const jsonStr = m && (m[1] || m[2]);
    if (!jsonStr) throw new Error('Réponse API invalide. Réessayez.');
    return JSON.parse(jsonStr.trim());
  }

  // ── Gemini ─────────────────────────────────────────────────────────────────
  async function ocrWithGemini(dataURL, apiKey) {
    const base64 = dataURL.split(',')[1];
    const mime   = dataURL.split(';')[0].split(':')[1];
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mime, data: base64 } },
            { text: OCR_PROMPT }
          ]}],
          generationConfig: { maxOutputTokens: 1024 }
        })
      }
    );
    if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(e.error?.message || `Erreur Gemini ${resp.status}`); }
    const r = await resp.json();
    const text = r.candidates[0].content.parts.filter(p => !p.thought).map(p => p.text || '').join('').trim();
    return parseAPIResponse(text);
  }

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  async function ocrWithOpenAI(dataURL, apiKey) {
    const base64 = dataURL.split(',')[1];
    const mime   = dataURL.split(';')[0].split(':')[1];
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 1024,
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          { type: 'text', text: OCR_PROMPT }
        ]}]
      })
    });
    if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(e.error?.message || `Erreur OpenAI ${resp.status}`); }
    const r = await resp.json();
    return parseAPIResponse(r.choices[0].message.content.trim());
  }

  // ── Claude ─────────────────────────────────────────────────────────────────
  async function ocrWithClaude(dataURL, apiKey) {
    const base64 = dataURL.split(',')[1];
    const mime   = dataURL.split(';')[0].split(':')[1];
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-calls': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 1024,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
          { type: 'text', text: OCR_PROMPT }
        ]}]
      })
    });
    if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(e.error?.message || `Erreur Claude ${resp.status}`); }
    const r = await resp.json();
    return parseAPIResponse(r.content[0].text.trim());
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function decPlaces(n) {
    const s = n.toString(), d = s.indexOf('.');
    return d === -1 ? 0 : s.length - d - 1;
  }

  function isValidRounding(exact, written) {
    if (written == null || !isFinite(exact)) return false;
    const f = Math.pow(10, decPlaces(written));
    return Math.round(exact * f) === Math.round(written * f);
  }

  function roundToMatch(exact, written) {
    const f = Math.pow(10, decPlaces(written));
    return Math.round(exact * f) / f;
  }

  function evalTokens(tokens) {
    const expr = tokens.map(t => {
      if (typeof t === 'number') return t;
      if (t === 'x' || t === '×') return '*';
      if (t === '÷') return '/';
      return t;
    }).join(' ');
    try {
      return Function('"use strict"; return (' + expr + ')')();
    } catch (_) {
      return NaN;
    }
  }

  function validateRows(parsed) {
    if (parsed.type === 'distributed') {
      const op = parsed.operation;
      return (parsed.rows || []).map(row => {
        if (row.input == null || row.written == null)
          return { label: row.label, na: true };
        const computed = row.input * parsed.scalar;
        return {
          label: row.label, na: false,
          input: row.input, scalar: parsed.scalar, operation: op,
          computed, written: row.written,
          valid: isValidRounding(computed, row.written),
        };
      });
    }

    if (parsed.type === 'vector') {
      return (parsed.rows || []).map(row => {
        if (!row.tokens?.length || row.written == null)
          return { label: row.label, na: true };
        const computed = evalTokens(row.tokens);
        return {
          label: row.label, na: false,
          tokens: [...row.tokens],
          computed, written: row.written,
          valid: isValidRounding(computed, row.written),
        };
      });
    }

    if (parsed.type === 'yield') {
      return (parsed.rows || []).map(row => {
        if (row.a == null || row.c == null || row.written == null)
          return { label: row.label, na: true };
        const computed = row.a * row.c;
        return {
          label: row.label, na: false,
          a: row.a, c: row.c,
          computed, written: row.written,
          valid: isValidRounding(computed, row.written),
        };
      });
    }

    if (parsed.type === 'average') {
      return (parsed.rows || []).map(row => {
        if (!row.terms?.length || row.written == null)
          return { label: row.label, na: true };
        const computed = row.terms.reduce((s, v) => s + v, 0) / row.terms.length;
        return {
          label: row.label, na: false,
          terms: [...row.terms],
          computed, written: row.written,
          valid: isValidRounding(computed, row.written),
        };
      });
    }

    throw new Error('Type de tableau non reconnu : ' + parsed.type);
  }

  // ── Interactive result ─────────────────────────────────────────────────────
  function makeInput(val, rowIdx, field, extra) {
    const cls = ['cell-input', extra].filter(Boolean).join(' ');
    const v = val != null ? val : '';
    return `<input type="text" inputmode="decimal" class="${cls}" value="${v}" data-row="${rowIdx}" data-field="${field}">`;
  }

  function makeOpInput(val, rowIdx, tokIdx) {
    return `<input type="text" class="cell-input op-input" value="${val}" data-row="${rowIdx}" data-field="tok_${tokIdx}">`;
  }

  function renderTableBody() {
    const { type, rows } = editState;
    const tbody = $('result-tbody');
    tbody.innerHTML = '';

    rows.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.dataset.idx = i;

      if (row.na) {
        tr.className = 'row-na';
        tr.innerHTML = `<td class="col-label">${row.label}</td><td colspan="4" style="color:var(--text-secondary);font-size:13px">N/A</td>`;
        tbody.appendChild(tr);
        return;
      }

      tr.className = row.valid ? '' : 'row-err';

      let formulaHTML = '';
      if (type === 'distributed') {
        formulaHTML = makeInput(row.input, i, 'input');
      } else if (type === 'vector') {
        formulaHTML = row.tokens.map((t, ti) => {
          if (typeof t === 'number') return makeInput(t, i, `tok_${ti}`);
          if (t === '(' || t === ')') return `<span class="result-op">${t}</span>`;
          return makeOpInput(t, i, ti);
        }).join('');
      } else if (type === 'yield') {
        formulaHTML =
          makeInput(row.a, i, 'a') +
          `<span class="result-op"> × </span>` +
          makeInput(row.c, i, 'c');
      } else if (type === 'average') {
        formulaHTML = row.terms
          .map((t, ti) => makeInput(t, i, `term_${ti}`))
          .join('<span class="result-op"> + </span>') +
          `<span class="result-op"> ÷ ${row.terms.length}</span>`;
      }

      const writtenCls = row.valid ? 'cell-written' : 'cell-written input-error';
      const corrHTML = row.valid ? '' : `<span class="correct-val">${formatFR(roundToMatch(row.computed, row.written))}</span>`;

      tr.innerHTML = `
        <td class="col-label">${row.label}</td>
        <td class="col-formula">${formulaHTML}</td>
        <td class="col-written">${makeInput(row.written, i, 'written', writtenCls)}</td>
        <td class="col-status" data-col="status">${row.valid ? '✅' : '❌'}</td>
        <td class="col-correct" data-col="correct">${corrHTML}</td>`;

      tbody.appendChild(tr);
    });
  }

  function recomputeRow(idx) {
    const row = editState.rows[idx];
    if (row.na) return;
    const { type } = editState;

    if (type === 'distributed') {
      row.computed = row.input * editState.scalar;
    } else if (type === 'vector') {
      row.computed = evalTokens(row.tokens);
    } else if (type === 'yield') {
      row.computed = row.a * row.c;
    } else if (type === 'average') {
      row.computed = row.terms.reduce((s, v) => s + v, 0) / row.terms.length;
    }

    row.valid = isValidRounding(row.computed, row.written);

    const tbody = $('result-tbody');
    const tr = tbody.querySelector(`tr[data-idx="${idx}"]`);
    if (!tr) return;

    tr.className = row.valid ? '' : 'row-err';

    const writtenInput = tr.querySelector('[data-field="written"]');
    if (writtenInput) writtenInput.classList.toggle('input-error', !row.valid);

    tr.querySelector('[data-col="status"]').textContent = row.valid ? '✅' : '❌';
    tr.querySelector('[data-col="correct"]').innerHTML = row.valid
      ? '' : `<span class="correct-val">${formatFR(roundToMatch(row.computed, row.written))}</span>`;
  }

  function updateSummary() {
    if (!editState) return;
    const active = editState.rows.filter(r => !r.na);
    const ok = active.filter(r => r.valid).length;
    const allOk = ok === active.length && active.length > 0;
    const el = $('result-summary');
    el.textContent = `${ok}/${active.length} correctes`;
    el.className = 'result-summary ' + (allOk ? 'all-correct' : 'has-errors');
  }

  function displayResult(parsed, rows) {
    editState = {
      type: parsed.type,
      operation: parsed.operation,
      scalar: parsed.scalar,
      rows: rows.map(r => ({
        ...r,
        tokens: r.tokens ? [...r.tokens] : undefined,
        terms:  r.terms  ? [...r.terms]  : undefined,
      })),
    };

    const typeNames = {
      distributed: 'Opération distribuée', vector: 'Vecteur',
      yield: 'Rendement', average: 'Moyenne',
    };
    $('result-type-badge').textContent = typeNames[parsed.type] || parsed.type;

    const scalarRow = $('result-scalar-row');
    if (parsed.type === 'distributed' && parsed.scalar != null) {
      const sym = { '*':'×', '/':'÷', '+':'+', '-':'−' }[parsed.operation] || parsed.operation || '×';
      $('result-op-sym').textContent = sym;
      $('result-scalar-input').value = parsed.scalar;
      scalarRow.style.display = '';
    } else {
      scalarRow.style.display = 'none';
    }

    renderTableBody();
    updateSummary();
  }

  // Input delegation on result table
  $('result-tbody').addEventListener('input', e => {
    if (!e.target.matches('.cell-input')) return;
    const rowIdx = +e.target.dataset.row;
    const field  = e.target.dataset.field;
    const row    = editState.rows[rowIdx];

    // Operator token: string update, no float parsing
    if (field.startsWith('tok_')) {
      const idx = +field.slice(4);
      if (typeof row.tokens[idx] === 'string') {
        row.tokens[idx] = e.target.value.trim() || row.tokens[idx];
        recomputeRow(rowIdx);
        updateSummary();
        return;
      }
    }

    const value = parseFloat(e.target.value.replace(',', '.'));
    if (isNaN(value)) return;

    if      (field === 'input')   row.input = value;
    else if (field === 'written') row.written = value;
    else if (field === 'a')       row.a = value;
    else if (field === 'c')       row.c = value;
    else if (field.startsWith('tok_'))  row.tokens[+field.slice(4)] = value;
    else if (field.startsWith('term_')) row.terms[+field.slice(5)] = value;

    recomputeRow(rowIdx);
    updateSummary();
  });

  // Scalar input for distributed type
  $('result-scalar-input').addEventListener('input', e => {
    if (!editState || editState.type !== 'distributed') return;
    const value = parseFloat(e.target.value.replace(',', '.'));
    if (isNaN(value)) return;
    editState.scalar = value;
    editState.rows.forEach((row, i) => { if (!row.na) recomputeRow(i); });
    updateSummary();
  });

  // ── Main flow ──────────────────────────────────────────────────────────────
  async function analyze(dataURL) {
    showScreen('screen-processing');
    setStatus('Envoi en cours…');
    try {
      let parsed;
      const engine = state.ocrEngine;
      if (engine === 'gemini') {
        if (!state.geminiKey) throw new Error('Clé API Gemini manquante. Configurez-la dans les paramètres.');
        setStatus('Envoi à Gemini…');
        parsed = await ocrWithGemini(dataURL, state.geminiKey);
      } else if (engine === 'openai') {
        if (!state.openaiKey) throw new Error('Clé API OpenAI manquante. Configurez-la dans les paramètres.');
        setStatus('Envoi à OpenAI…');
        parsed = await ocrWithOpenAI(dataURL, state.openaiKey);
      } else if (engine === 'claude') {
        if (!state.claudeKey) throw new Error('Clé API Claude manquante. Configurez-la dans les paramètres.');
        setStatus('Envoi à Claude…');
        parsed = await ocrWithClaude(dataURL, state.claudeKey);
      } else {
        throw new Error('Aucun moteur OCR configuré.');
      }
      setStatus('Vérification…');
      const rows = validateRows(parsed);
      displayResult(parsed, rows);
      showScreen('screen-result');
    } catch (err) {
      showScreen('screen-capture');
      showError(err.message || 'Une erreur est survenue.');
    }
  }

})();
