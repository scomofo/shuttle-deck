"""Observe root-driven doors through real aft glazing using public GUI views.

Only the existing time-advance probe advances flight. Readouts inspect actual
meshes; no camera, mechanism, dynamics or checklist state is assigned.
"""
import argparse
import json
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright, expect, TimeoutError

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:4173')
parser.add_argument('--browser-executable', default=None)
parser.add_argument('--output', default=str(Path(tempfile.gettempdir())/'shuttle-payload-bay'))
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser_executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width':1280,'height':800})
    errors, failed_assets, states = [], [], {}
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('requestfailed', lambda r: failed_assets.append(r.url))
    page.on('response', lambda r: failed_assets.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    page.goto(args.base_url, wait_until='networkidle')
    focus = page.locator('.procedure-focus')
    save = page.get_by_role('button', name='Save checkpoint', exact=True)
    restore = page.get_by_role('button', name='Restore checkpoint', exact=True)

    def read():
        previous = page.evaluate('window.__payloadReadout?.sampleTime ?? -1')
        page.wait_for_function('(t) => window.__payloadReadout?.sampleTime > t', arg=previous)
        return page.evaluate('window.__payloadReadout')

    def verify_pose(state):
        assert abs(state['noseAlignment'] - 1) < 1e-8, state
        assert len(state['foreClosureRays']) == 4 and all(state['foreClosureRays']), state
        for presentation in ['seated','exterior']:
            for hinge, sign in zip(state[presentation], [1,-1]):
                assert abs(hinge['angle'] - sign*1.7*state['position']) < 1e-10, state

    def seated():
        state = read()
        assert max(abs(a-b) for a,b in zip(state['eye'],[-0.6,0,0])) < 1e-8, state['eye']
        verify_pose(state)
        return state

    def observe(name):
        before = read()
        live = focus.locator('.procedure-state dd').first.inner_text()
        page.get_by_role('button',name='Bay windows',exact=True).click()
        page.wait_for_function('window.__cockpitReadout?.target === "bay"')
        state = read()
        assert max(abs(a-b) for a,b in zip(state['eye'],[0.3,0.58,0.85])) < 1e-8, state['eye']
        assert state['get'] == before['get'] and state['position'] == before['position']
        expect(focus.locator('.procedure-state dd').first).to_have_text(live)
        verify_pose(state)
        states[name] = state
        page.screenshot(path=str(out/f'{name}.png'))
        return state

    def advance(steps):
        page.get_by_role('button',name='Resume',exact=True).click()
        page.evaluate('(n) => window.__controlsTest.tick(n)',steps)
        page.get_by_role('button',name='Pause',exact=True).click()
        return read()

    def find_pick(target):
        focus.get_by_role('button',name='Find in cockpit').focus()
        page.keyboard.press('Space')
        page.wait_for_function('(t) => window.__cockpitReadout?.target === t && window.__cockpitReadout.visible',arg=target)
        seated()
        point = page.evaluate('window.__cockpitReadout')
        assert page.evaluate('(p) => document.elementFromPoint(p.x,p.y)?.tagName === "CANVAS"',point)
        page.mouse.click(point['x'],point['y'])

    def dismiss():
        button = page.get_by_role('button',name='Dismiss checkpoint message',exact=True)
        if button.count():
            try:
                button.focus(timeout=5000)
                page.keyboard.press('Space')
            except TimeoutError:
                expect(button).not_to_be_visible(timeout=8000)

    page.get_by_role('button',name='Start in orbit',exact=True).click()
    page.get_by_role('button',name='1×',exact=True).click()
    page.get_by_role('button',name='Pause',exact=True).click()
    closed = observe('bay-closed')
    assert closed['position'] == 0 and closed['talkback'] == 'CL'
    assert any(n.startswith('bay-radiator-') for n in closed['hardware']), closed
    find_pick('doors-open')
    partial = advance(650)
    assert 0.4 < partial['position'] < 0.7 and partial['talkback'] == 'TRANSIT', partial
    partial = observe('bay-transit')
    again = read()
    assert again['get'] == partial['get']
    for key in ['position','seated','exterior']:
        assert again[key] == partial[key], f'Paused {key} drift'
    save.click()
    saved = page.evaluate('JSON.parse(localStorage.getItem("shuttle-deck-save"))')
    dismiss()
    page.reload(wait_until='networkidle')
    restore.click()
    expect(focus).to_contain_text('PAUSED')
    recovered = seated()
    for key in ['position','get','seated','exterior']:
        assert recovered[key] == partial[key], f'Cold recovery differs: {key}'
    dismiss()
    observe('bay-restored-transit')

    # Keyboard O is the public direction toggle; it reverses the real owner.
    page.locator('canvas').click(position={'x':20,'y':300})
    page.keyboard.press('o')
    reverse = advance(100)
    assert 0 < reverse['position'] < partial['position'], reverse
    observe('bay-reversing')
    advance(1400)
    assert read()['position'] == 0
    page.keyboard.press('Escape')
    seated()
    find_pick('doors-open')
    advance(650)
    observe('bay-opening-final')
    advance(1400)
    expect(focus).to_contain_text('Doors for deorbit')
    assert page.evaluate('window.__cockpitReadout?.target') == 'bay', 'Checklist advance must retain an explicit observation'
    opened = observe('bay-open')
    assert opened['position'] == 1 and opened['talkback'] == 'OP'
    assert all(opened['hardware'].get(f'bay-dfi-cover-{side}',0) > 0 for side in [-1,1]), opened
    assert any(n.startswith('bay-radiator-') for n in opened['hardware']), opened

    # Chase also uses the same actual hinges, with +Z aligned to the root nose.
    page.keyboard.press('v')
    page.wait_for_function('window.__payloadReadout?.view === "tower"')
    page.keyboard.press('v')
    page.wait_for_function('window.__payloadReadout?.view === "chase"')
    chase = read()
    verify_pose(chase)
    states['bay-chase-open'] = chase
    page.screenshot(path=str(out/'bay-chase-open.png'))
    page.keyboard.press('v')
    page.wait_for_function('window.__payloadReadout?.view === "cockpit"')
    seated()

    # The short phone exposes observation, Escape, Find and a genuine close
    # pick; navigation must neither hide Resume nor overflow the viewport.
    page.set_viewport_size({'width':390,'height':600})
    phone = observe('bay-phone-open')
    for side in [-1,1]:
        assert any(page.evaluate('(p) => document.elementFromPoint(p.x,p.y)?.tagName === "CANVAS"', point)
                   for point in phone['points'].get(f'bay-dfi-cover-{side}', [])), phone
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    for button in [page.get_by_role('button',name='Bay windows',exact=True),
                   page.get_by_role('button',name='Resume',exact=True)]:
        expect(button).to_be_in_viewport()
    page.keyboard.press('Escape')
    seated()
    find_pick('doors-close')
    states['bay-phone-find-close'] = read()
    page.screenshot(path=str(out/'bay-phone-find-close.png'))
    advance(1400)
    expect(focus).to_contain_text('APUs 2+3 for entry')
    assert read()['position'] == 0
    page.keyboard.press('Escape')
    seated()
    assert not errors, errors
    assert not failed_assets, failed_assets
    (out/'capture-state.json').write_text(json.dumps({'states':states,'saved':saved,'errors':errors,'failed_assets':failed_assets},indent=2)+'\n')
    print('Payload bay: public aperture view, actual opaque hits, continuous shared hinges, pause/cold recovery, reversal, proper chase attitude and phone Find/close passed.',flush=True)
    browser.close()
