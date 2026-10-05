"""Capture production nose meshes at positions observed by the real GUI harness.

The separate inspection renderer does not alter a flight or a public camera.
Its matrices must match the gameplay readout before any image is accepted.
"""
import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('states', type=Path, help='states.json from gear-deployment-browser.py')
parser.add_argument('output', type=Path)
parser.add_argument('--base-url', default='http://127.0.0.1:5173')
parser.add_argument('--browser-executable', default='/usr/bin/chromium')
args = parser.parse_args()
states = json.loads(args.states.read_text())
args.output.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parent.parent
source_paths = ['src/game/gear-layout.ts', 'src/game/nose-gear-model.ts', 'src/game/orbiter-skin.ts', 'tools/nose-review.html', 'tools/nose-review.py']
record = {'kind':'supplemental fixed inspection, not a historical camera match',
    'observed_states_sha256':hashlib.sha256(args.states.read_bytes()).hexdigest(),
    'sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in source_paths},
    'captures':[]}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser_executable, headless=True,
        args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width':1280,'height':960})
    errors, failures = [], []
    page.on('pageerror', lambda e:errors.append(str(e)))
    page.on('console', lambda m:errors.append(m.text) if m.type=='error' else None)
    page.on('requestfailed', lambda r:failures.append(r.url))
    page.on('response', lambda r:failures.append(f'{r.status} {r.url}') if r.status>=400 else None)
    page.goto(args.base_url+'/tools/nose-review.html', wait_until='networkidle')
    page.wait_for_function('window.noseReviewReady===true')
    for label, key in [('up','desktop-up'),('transit','desktop-partial'),('dn','desktop-dn')]:
        state = states[key]
        assert state['paused']
        actual = next(g for g in state['assemblies'] if g['id']=='nose')
        for view in ['underside','internal']:
            rendered = page.evaluate('([position,view])=>window.renderNoseReview(position,view)', [state['position'],view])
            assert max(abs(a-b) for a,b in zip(rendered['hinge'],actual['matrix']))<1e-12
            for got, observed in zip(rendered['doors'],state['nose']['doors']):
                assert max(abs(a-b) for a,b in zip(got,observed['matrix']))<1e-12
            image = args.output/f'nose-{label}-{view}.png'
            page.screenshot(path=str(image))
            record['captures'].append({'image':image.name,'image_sha256':hashlib.sha256(image.read_bytes()).hexdigest(),
                'observed_gameplay_key':key,'observed_get':state['get'],'observed_position':state['position'],
                'observed_talkback':state['talkback'],'inspection':rendered})
    assert not errors, errors
    assert not failures, failures
    browser.close()
(args.output/'nose-captures.json').write_text(json.dumps(record,indent=2)+'\n')
print('Six fixed underside/internal captures match actual paused GUI matrices; zero page, console or resource errors.')
