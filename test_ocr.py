#!/usr/bin/env python3
"""Test OCR APIs on lab notebook table images. Run with API keys in environment."""
import os, base64, json, glob, sys, re, math
import urllib.request, urllib.error

OPENAI_KEY    = os.environ.get('OPENAI_API_KEY', '')
GEMINI_KEY    = os.environ.get('GEMINI_API_KEY', '')
ANTHROPIC_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

PROMPT = """Tu regardes une photo d'un tableau de calculs dans un cahier de labo.
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

Réponds UNIQUEMENT avec le JSON valide, sans markdown, sans explication."""


def img_b64(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode()


def post_json(url, data, headers):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {'_error': e.code, '_body': e.read().decode()}


def test_openai(img_path):
    b64 = img_b64(img_path)
    resp = post_json(
        'https://api.openai.com/v1/chat/completions',
        {'model': 'gpt-4o', 'max_tokens': 1024,
         'messages': [{'role': 'user', 'content': [
             {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}},
             {'type': 'text', 'text': PROMPT}
         ]}]},
        {'Authorization': f'Bearer {OPENAI_KEY}', 'Content-Type': 'application/json'}
    )
    if '_error' in resp:
        return f'ERROR {resp["_error"]}: {resp["_body"][:300]}'
    return resp['choices'][0]['message']['content'].strip()


def test_gemini(img_path, model='gemini-2.5-flash-lite'):
    b64 = img_b64(img_path)
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_KEY}'
    resp = post_json(url,
        {'contents': [{'parts': [
            {'inline_data': {'mime_type': 'image/jpeg', 'data': b64}},
            {'text': PROMPT}
        ]}], 'generationConfig': {'maxOutputTokens': 1024}},
        {'Content-Type': 'application/json'}
    )
    if '_error' in resp:
        return f'ERROR {resp["_error"]}: {resp["_body"][:300]}'
    return resp['candidates'][0]['content']['parts'][0]['text'].strip()


def test_claude(img_path):
    b64 = img_b64(img_path)
    resp = post_json(
        'https://api.anthropic.com/v1/messages',
        {'model': 'claude-sonnet-4-6', 'max_tokens': 1024,
         'messages': [{'role': 'user', 'content': [
             {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': b64}},
             {'type': 'text', 'text': PROMPT}
         ]}]},
        {'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'}
    )
    if '_error' in resp:
        return f'ERROR {resp["_error"]}: {resp["_body"][:300]}'
    return resp['content'][0]['text'].strip()


def dec_places(n):
    s = str(n)
    dot = s.find('.')
    return 0 if dot == -1 else len(s) - dot - 1


def is_valid_rounding(exact, written):
    if written is None or not math.isfinite(exact):
        return False
    f = 10 ** dec_places(written)
    return round(exact * f) == round(written * f)


def round_to_match(exact, written):
    f = 10 ** dec_places(written)
    return round(exact * f) / f


def verify(response_text):
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```|(\{[\s\S]*\})', response_text)
    if not m:
        return '⚠ JSON introuvable'
    try:
        data = json.loads((m.group(1) or m.group(2)).strip())
    except Exception as e:
        return f'⚠ JSON invalide: {e}'

    t = data.get('type', '?')
    rows = data.get('rows', [])
    lines = [f'  Type: {t}']

    if t == 'distributed':
        op  = data.get('operation', '*')
        sc  = data.get('scalar', 1)
        ops = {'*':'×','/':'÷','+':'+','-':'−'}.get(op, op)
        for row in rows:
            lbl, inp, wr = row.get('label','?'), row.get('input'), row.get('written')
            if inp is None or wr is None:
                lines.append(f'  {lbl}: N/A')
                continue
            exact = inp * sc
            ok = is_valid_rounding(exact, wr)
            corr = f'  → {round_to_match(exact, wr)}' if not ok else ''
            lines.append(f'  {lbl}: {inp} {ops} {sc} = {wr}  {"✅" if ok else "❌"+corr}')

    elif t == 'vector':
        for row in rows:
            lbl, tokens, wr = row.get('label','?'), row.get('tokens'), row.get('written')
            if not tokens or wr is None:
                lines.append(f'  {lbl}: N/A')
                continue
            expr = ' '.join(str(tok).replace('×','*').replace('÷','/') for tok in tokens)
            try:
                computed = eval(expr)  # noqa: S307 — tokens from trusted AI response
            except Exception:
                lines.append(f'  {lbl}: expression invalide : {expr}')
                continue
            ok = is_valid_rounding(computed, wr)
            formula = ' '.join(str(tok) for tok in tokens)
            corr = f'  → {round_to_match(computed, wr)}' if not ok else ''
            lines.append(f'  {lbl}: {formula} = {wr}  {"✅" if ok else "❌"+corr}')

    elif t == 'yield':
        for row in rows:
            lbl, a, c, wr = row.get('label','?'), row.get('a'), row.get('c'), row.get('written')
            if a is None or c is None or wr is None:
                lines.append(f'  {lbl}: N/A')
                continue
            computed = a * c
            ok = is_valid_rounding(computed, wr)
            corr = f'  → {round_to_match(computed, wr)}' if not ok else ''
            lines.append(f'  {lbl}: {a} × {c} = {wr}  {"✅" if ok else "❌"+corr}')

    elif t == 'average':
        for row in rows:
            lbl, terms, wr = row.get('label', '?'), row.get('terms'), row.get('written')
            if not terms or wr is None:
                lines.append(f'  {lbl}: N/A')
                continue
            computed = sum(terms) / len(terms)
            ok = is_valid_rounding(computed, wr)
            formula = f'({" + ".join(str(x) for x in terms)}) / {len(terms)}'
            corr = f'  → {round_to_match(computed, wr)}' if not ok else ''
            lines.append(f'  {lbl}: {formula} = {wr}  {"✅" if ok else "❌"+corr}')
    else:
        lines.append(f'  ⚠ Type inconnu: {t}')

    return '\n'.join(lines)


# ── Main ───────────────────────────────────────────────────────────────────
IMAGES = {
    'mass_operation.png':          'Cas 1 — Opération distribuée',
    'multi_calcul.png':            'Cas 2 — Vecteur soustraction',
    'autre_cas2.jpeg':             'Cas 2 — Autre exemple vecteur',
    'autre_cas2_B.jpeg':           'Cas 2 — Parenthèses attendu (31.13/1.5)*0.8=16.603',
    'yeld_operation.png':          'Cas 3 — Rendement',
    'average.jpeg':                'Cas 4 — Moyenne',
}

engines = []
if OPENAI_KEY:    engines.append(('OpenAI gpt-4o',     test_openai))
if GEMINI_KEY:    engines.append(('Gemini 2.5-flash',  test_gemini))
if ANTHROPIC_KEY: engines.append(('Claude sonnet-4-6', test_claude))

if not engines:
    print("Aucune clé API trouvée. Exporte GEMINI_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY.")
    sys.exit(1)

base_dir = '/Users/alistef/workspace/Additions'

for img_name, description in IMAGES.items():
    img_path = os.path.join(base_dir, img_name)
    if not os.path.exists(img_path):
        print(f'\n⚠ Image introuvable : {img_name}')
        continue
    print(f'\n{"="*65}')
    print(f'IMAGE : {img_name}')
    print(f'Attendu : {description}')
    print('='*65)
    for label, fn in engines:
        print(f'\n  [{label}]')
        try:
            raw = fn(img_path)
            print(f'  Brut : {raw[:300]}')
            print(verify(raw))
        except Exception as e:
            print(f'  Exception : {e}')
