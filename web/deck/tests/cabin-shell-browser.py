"""Fixed checkpoint seat captures and actual enclosure-ray acceptance.

Uses saved packets through the GUI Restore path, navigation and pointer drag.
No vehicle/camera truth is assigned. The read-only probe raycasts real rendered
opaque surfaces; real control-command coverage remains in cockpit-browser.py.
"""
import argparse
import json
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:4173')
parser.add_argument('--browser-executable', default=None)
parser.add_argument('--output', default=str(Path(tempfile.gettempdir()) / 'shuttle-cabin-shell'))
parser.add_argument('--fixture', default=str(Path(__file__).resolve().parents[1] / 'review/cabin-fixture.json'))
parser.add_argument('--record-fixture', action='store_true', help='Record new GUI scenario checkpoints instead of reusing the review fixture')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
fixture_path = Path(args.fixture)
fixtures = {} if args.record_fixture else json.loads(fixture_path.read_text())
records = {}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser_executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1600, 'height': 900})
    errors, resources = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('requestfailed', lambda r: resources.append(r.url))
    page.on('response', lambda r: resources.append(f'{r.status} {r.url}') if r.status >= 400 else None)

    def enclosure():
        page.wait_for_function('window.__cabinReadout?.windows.length === 10 && Object.keys(window.__cabinReadout.crewRays).length >= 19')
        data = page.evaluate('window.__cabinReadout')
        assert len(data['surfaces']) == 7, data
        assert all(w['clear'] for w in data['windows']), data
        assert all(w['panelClear'] for w in data['windows'] if w['family'] != 'forward'), data['windows']
        assert all(data['crewRays'].values()), data['crewRays']
        assert sorted(data['housings']) == ['cabin-console-opaque-aft', 'cabin-console-opaque-port', 'cabin-console-opaque-starboard']
        assert all(data['assemblyRays'].values()), data['assemblyRays']
        assert all(w['assemblyClear'] for w in data['windows'] if w['family'] != 'forward'), data['windows']
        assert sorted(w['id'] for w in data['windows']) == sorted(f'W{i}' for i in range(1, 11))
        assert abs(data['eye'][0] + 0.6) < 1e-6 and abs(data['eye'][1]) < 1e-6 and abs(data['eye'][2]) < 1e-6
        return data

    def capture(name):
        enclosure()
        page.screenshot(path=str(out / (name + '.png')))
        records[name] = page.evaluate('({viewport:[innerWidth,innerHeight], instruments:window.__instrumentReadout, readingView:window.__cockpitReadout, cabin:window.__cabinReadout, landing:window.__landingReadout})')

    def inspect(label, target):
        previous = page.evaluate('window.__cockpitReadout?.revision ?? -1')
        page.get_by_role('button', name=label, exact=True).click()
        page.wait_for_function('(p) => window.__cockpitReadout?.target === p.target && window.__cockpitReadout.visible && window.__cockpitReadout.revision > p.previous && window.__instrumentReadout?.readingRevision === window.__cockpitReadout.revision', arg={'target': target, 'previous': previous})

    for mode, label in [('approach', 'Final approach'), ('orbit', 'Start in orbit')]:
        page.set_viewport_size({'width': 1600, 'height': 900})
        page.goto(args.base_url, wait_until='networkidle')
        if args.record_fixture:
            page.get_by_role('button', name=label, exact=True).click()
            page.get_by_role('button', name='Pause', exact=True).click()
            page.wait_for_function('window.__instrumentReadout?.faces.CRT1')
            page.get_by_role('button', name='Save checkpoint', exact=True).click()
            fixtures[mode] = page.evaluate('JSON.parse(localStorage.getItem("shuttle-deck-save"))')
        page.evaluate('(s) => localStorage.setItem("shuttle-deck-save",JSON.stringify(s))', fixtures[mode])
        page.get_by_role('button', name='Restore checkpoint', exact=True).click()
        page.wait_for_function('window.__instrumentReadout?.faces.CRT1')
        if mode == 'approach':
            alpha = page.evaluate('window.__instrumentReadout.alphaDegrees')
            assert abs(alpha) > 0.01, 'The old saved approach must recover nonzero aero telemetry while paused'
            page.get_by_role('button', name='Save checkpoint', exact=True).click()
            packet = page.evaluate('JSON.parse(localStorage.getItem("shuttle-deck-save"))')
            assert abs(packet['root']['dynamics']['telemetry']['aero']['alpha_deg'] - alpha) < 1e-9
            page.reload(wait_until='networkidle')
            page.get_by_role('button', name='Restore checkpoint', exact=True).click()
            page.wait_for_function('(alpha) => Math.abs((window.__instrumentReadout?.alphaDegrees ?? NaN) - alpha) < 1e-9', arg=alpha)
        expect(page.get_by_role('button', name='Resume', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Dismiss checkpoint message', exact=True)).not_to_be_visible(timeout=10000)
        slider = page.get_by_role('slider', name='Panel lighting')
        slider.focus(); page.keyboard.press('End'); page.keyboard.press('Escape')
        page.wait_for_function('window.__cockpitReadout === null')
        get = page.evaluate('window.__instrumentReadout.get')
        assert abs(get - fixtures[mode]['root']['clock']['get_s']) < 1e-9
        if mode == 'approach':
            page.wait_for_function('window.__landingReadout?.visible && window.__landingReadout.windowClear')
        capture(mode + '-forward')
        for label, target in [('Overhead', 'overhead'), ('Aft station', 'aft'), ('Flight instruments', 'displays')]:
            inspect(label, target)
            capture(mode + '-' + target)
            assert page.evaluate('window.__instrumentReadout.get') == get

        # The same eye can inspect both roof apertures with ordinary pointer
        # look, rather than relying on a fabricated screenshot-only camera.
        page.keyboard.press('Escape')
        if page.locator('.hud').get_attribute('data-checklist-open') == 'true':
            page.keyboard.press('c')
        page.mouse.move(600, 650); page.mouse.down()
        page.mouse.move(1153, 398, steps=8); page.mouse.up()
        page.wait_for_function('window.__cabinReadout?.windows.filter(w => w.family === "overhead").every(w => w.visible)')
        capture(mode + '-roof-windows')
        page.keyboard.press('Escape')
        page.mouse.move(700, 450); page.mouse.down()
        page.mouse.move(1120, 340, steps=8); page.mouse.up()
        page.mouse.move(700, 450); page.mouse.down()
        page.mouse.move(1067, 450, steps=8); page.mouse.up()
        page.wait_for_function('window.__cabinReadout?.windows.filter(w => w.family === "aft").every(w => w.visible)')
        capture(mode + '-aft-windows')
        page.keyboard.press('Escape')

        if mode == 'approach':
            page.set_viewport_size({'width': 390, 'height': 600})
            page.get_by_role('button', name='Restore checkpoint', exact=True).click()
            expect(page.get_by_role('button', name='Dismiss checkpoint message', exact=True)).not_to_be_visible(timeout=10000)
            inspect('Flight instruments', 'displays')
            page.wait_for_function('["F6-adi","F6-hsi","F6-ami","F6-avvi"].every(k => { const p=window.__instrumentReadout?.faces[k]; return p?.visible && document.elementFromPoint(p.x,p.y)?.tagName === "CANVAS"; })')
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            assert page.evaluate('(() => { const b=document.querySelector(".procedure-action").getBoundingClientRect(); const s=document.querySelector(".sheet").getBoundingClientRect(); return b.top >= s.top && b.bottom <= s.bottom; })()')
            capture('approach-phone-checklist')

    if args.record_fixture:
        fixture_path.write_text(json.dumps(fixtures, indent=2) + '\n')
    (out / 'capture-state.json').write_text(json.dumps(records, indent=2) + '\n')
    assert not errors, errors
    assert not resources, resources
    print('Cabin assembly: 10 shell apertures, clear control/instrument rays through housing, panel and seat geometry, unobstructed roof/aft centers, fixed saved-state views and short-phone recovery passed; zero browser/resource errors.', flush=True)
    browser.close()
