"""Verify real F6 picks, gear pose continuity and checkpoint recovery.

Time advances only through the existing controls probe. The gear probe reads
actual matrices/centers; it cannot command a mechanism or move a camera.
"""
import argparse
import json
import math
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright, expect, TimeoutError

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:4173')
parser.add_argument('--browser-executable', default=None)
parser.add_argument('--output', default=str(Path(tempfile.gettempdir())/'shuttle-gear'))
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser_executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors, failed_assets, states = [], [], {}
    for label, viewport in [('desktop', {'width':1280,'height':800}), ('phone', {'width':390,'height':844})]:
        page = browser.new_page(viewport=viewport)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('requestfailed', lambda r: failed_assets.append(r.url))
        page.on('response', lambda r: failed_assets.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        page.goto(args.base_url, wait_until='networkidle')
        focus = page.locator('.procedure-focus')

        def read():
            previous = page.evaluate('window.__gearReadout?.sampleTime ?? -1')
            page.wait_for_function('(t)=>window.__gearReadout?.sampleTime>t',arg=previous)
            return page.evaluate('window.__gearReadout')

        def advance(n):
            page.get_by_role('button',name='Resume',exact=True).click()
            page.evaluate('(n)=>window.__controlsTest.tick(n)',n)
            page.get_by_role('button',name='Pause',exact=True).click()
            return read()

        def dismiss_checkpoint():
            dismiss = page.get_by_role('button', name='Dismiss checkpoint message', exact=True)
            if dismiss.count():
                try:
                    dismiss.focus(timeout=5000)
                    page.keyboard.press('Space')
                except TimeoutError:
                    # A software-rendered frame can outlive this transient toast.
                    expect(dismiss).not_to_be_visible(timeout=8000)
                expect(dismiss).not_to_be_visible(timeout=8000)

        def find_pick(target):
            before = read()
            focus.get_by_role('button',name='Find in cockpit').focus()
            page.keyboard.press('Space')
            page.wait_for_function('(t)=>window.__cockpitReadout?.target===t && window.__cockpitReadout.visible',arg=target)
            point = page.evaluate('window.__cockpitReadout')
            after = read()
            assert after['get'] == before['get'] and after['position'] == before['position'], 'Find must only inspect'
            assert page.evaluate('(p)=>document.elementFromPoint(p.x,p.y)?.tagName==="CANVAS"',point)
            page.mouse.click(point['x'],point['y'])

        def pose(s):
            return {'legs':[{'angle':g['angle'],'matrix':g['matrix'],'centers':[w['center'] for w in g['wheels']]} for g in s['assemblies']], 'nose':s['nose']}

        def check(s):
            progress = s['position']
            expected = -(1-progress*progress*(3-2*progress))*math.pi/2
            for g in s['assemblies']:
                if g['id']=='nose':
                    leg=max(0,min(1,(progress-.22)/.78))
                    travel=leg*leg/.32 if leg<.2 else 1-(1-leg)**2/.32 if leg>.8 else (leg-.1)/.8
                    angle=-(1-travel)*108*math.pi/180
                else: angle=expected
                assert abs(g['angle']-angle)<1e-10, s
                assert all(math.isfinite(v) for v in g['matrix']), s
                for w in g['wheels']:
                    assert all(math.isfinite(v) for v in w['center']), s
            if progress == 1:
                for g in s['assemblies']:
                    radius = .4 if g['id']=='nose' else .55
                    z = 8.25 if g['id']=='nose' else -5.25
                    for w in g['wheels']:
                        assert abs(w['center'][1]-radius+2.4)<1e-8, s
                        assert abs(w['center'][2]-z)<1e-8, s
                        assert abs(w['lowest']+2.4)<.02, s

        page.get_by_role('button',name='Final approach',exact=True).click()
        page.get_by_role('button',name='Pause',exact=True).click()
        initial = read()
        states[f'{label}-up'] = initial
        assert initial['position']==0 and initial['talkback']=='UP'
        assert not any(g['visible'] for g in initial['assemblies'])
        focus.get_by_role('button',name='Resume flight',exact=True).click()
        focus.get_by_role('button',name='Start APUs',exact=True).click()
        page.evaluate('window.__controlsTest.tick(1000)')
        page.get_by_role('button',name='Pause',exact=True).click()
        expect(focus).to_contain_text('Gear arm')
        find_pick('gear-arm')
        armed = advance(10)
        assert armed['talkback']=='ARM' and armed['position']==0
        expect(focus).to_contain_text('Gear down')
        for _ in range(200):
            if page.evaluate('window.__controlsTest.getSpeed()')<=190: break
            advance(20)
        find_pick('gear')
        partial = advance(80)
        assert .4<partial['position']<.65 and partial['talkback']=='TRANSIT' and not partial['downLocked'], partial
        check(partial)
        expect(focus).to_contain_text('Gear moving. Wait for DN.')
        assert not any(g['visible'] for g in partial['assemblies']), 'Cockpit exterior is intentionally hidden'
        page.get_by_role('button',name='Save checkpoint',exact=True).click()
        dismiss_checkpoint()
        saved = page.evaluate('localStorage.getItem("shuttle-deck-save")')
        states[f'{label}-partial'] = partial
        page.screenshot(path=str(out/f'{label}-transit.png'))
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        for locator in [focus.locator('.procedure-state'), focus.get_by_role('button',name='Resume flight',exact=True)]:
            box=locator.bounding_box()
            assert box and box['x']>=0 and box['x']+box['width']<=viewport['width']+1, box
            assert box['y']>=0 and box['y']+box['height']<=viewport['height']+1, box
        again = read()
        assert again['get']==partial['get'] and pose(again)==pose(partial), 'Pause drift'
        page.reload(wait_until='networkidle')
        page.get_by_role('button',name='Restore checkpoint',exact=True).click()
        dismiss_checkpoint()
        recovered = read()
        assert recovered['paused'] and recovered['position']==partial['position'] and recovered['get']==partial['get']
        assert pose(recovered)==pose(partial), 'Cold restore changed actual gear pose'
        states[f'{label}-restored'] = recovered
        page.screenshot(path=str(out/f'{label}-restored-transit.png'))
        if label=='desktop':
            page.get_by_role('button',name='Change view',exact=True).click()
            exterior = read()
            assert exterior['view']=='tower' and all(g['visible'] for g in exterior['assemblies'])
            assert pose(exterior)==pose(partial), 'Changing view changed gear pose'
            states['desktop-exterior-partial']=exterior
            page.get_by_role('button',name='Change view',exact=True).click()
            read()
            page.get_by_role('button',name='Change view',exact=True).click()
            read()
        final = advance(100)
        assert final['position']==1 and final['talkback']=='DN' and final['downLocked']
        check(final)
        expect(focus).to_contain_text('Wheel stop')
        states[f'{label}-dn']=final
        # A different running scenario must recover the earlier timer and clear
        # the later down-lock checklist latch, rather than simply re-open a menu.
        page.reload(wait_until='networkidle')
        page.get_by_role('button',name='Start in orbit',exact=True).click()
        page.get_by_role('button',name='Pause',exact=True).click()
        assert read()['position']==0
        page.get_by_role('button',name='Restore checkpoint',exact=True).click()
        dismiss_checkpoint()
        cross = read()
        assert cross['position']==partial['position'] and pose(cross)==pose(partial)
        expect(focus).to_contain_text('Gear down')
        expect(focus).to_contain_text('TRANSIT')
        assert page.evaluate('localStorage.getItem("shuttle-deck-save")')==saved
        print(label, 'F6 ARM/DOWN picks, TRANSIT wait, pause, actual hinge recovery, DN and cross-scenario rewind passed.',flush=True)
        page.close()
    assert not failed_assets, failed_assets
    assert not errors, errors
    (out/'states.json').write_text(json.dumps(states,indent=2)+'\n')
    browser.close()
