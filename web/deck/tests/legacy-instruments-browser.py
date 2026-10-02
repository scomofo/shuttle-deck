"""Capture fixed seated views and exercise the rendered legacy CRT faces.

Vehicle/camera actions use GUI; the rendering probe is read-only. The public
NASA photographs are topology evidence, not calibrated crew-eye fixtures.
"""
import argparse
import json
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:4173')
parser.add_argument('--browser-executable', default=None)
parser.add_argument('--output', default=str(Path(tempfile.gettempdir()) / 'shuttle-legacy-instruments'))
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
records = {}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser_executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width':1600, 'height':900})
    errors, console_errors = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)

    def capture(name):
        page.screenshot(path=str(out / (name + '.png')))
        records[name] = page.evaluate('({viewport:[innerWidth,innerHeight], instruments:window.__instrumentReadout, readingView:window.__cockpitReadout})')

    def start(button):
        page.goto(args.base_url, wait_until='networkidle')
        page.get_by_role('button', name=button, exact=True).click()
        page.get_by_role('button', name='Pause', exact=True).click()
        page.keyboard.press('c')
        page.wait_for_function('Object.keys(window.__instrumentReadout?.faces ?? {}).length === 13')
        data = page.evaluate('window.__instrumentReadout')
        assert sorted(k for k in data['faces'] if k.startswith('CRT')) == ['CRT1','CRT2','CRT3','CRT4']
        assert len([k for k in data['faces'] if not k.startswith('CRT')]) == 9
        assert abs(data['altitudeFeet'] * 0.3048 - data['sourceAltitudeMeters']) < 1e-6
        assert abs(data['verticalSpeedFpm'] * 0.3048 / 60 - data['sourceVerticalSpeedMps']) < 1e-6
        return data

    def inspect(button, target):
        previous = page.evaluate('window.__cockpitReadout?.revision ?? -1')
        page.get_by_role('button', name=button, exact=True).click()
        page.wait_for_function('(p) => window.__cockpitReadout?.target === p.target && window.__cockpitReadout.visible && window.__cockpitReadout.revision > p.previous && window.__instrumentReadout?.readingRevision === window.__cockpitReadout.revision', arg={'target':target, 'previous':previous})

    orbit = start('Start in orbit')
    assert orbit['altitudeFeet'] > 500000
    capture('orbit-forward')
    inspect('Center CRTs', 'crts')
    page.wait_for_function('window.__instrumentReadout?.faces.CRT1.visible')
    point = page.evaluate('window.__instrumentReadout.faces.CRT1')
    get = page.evaluate('window.__instrumentReadout.get')
    assert page.evaluate('(p) => document.elementFromPoint(p.x,p.y)?.tagName === "CANVAS"', point)
    page.mouse.click(point['x'], point['y'])
    page.wait_for_function('(old) => window.__instrumentReadout.faces.CRT1.format !== old', arg=point['format'])
    assert page.evaluate('window.__instrumentReadout.get') == get
    capture('orbit-center-crts')
    # Dragging across a CRT must look around without selecting another format.
    current = page.evaluate('window.__instrumentReadout.faces.CRT1.format')
    page.mouse.move(point['x'], point['y']); page.mouse.down()
    page.mouse.move(point['x'] + 65, point['y'], steps=4); page.mouse.up()
    inspect('Center CRTs', 'crts')
    assert page.evaluate('window.__instrumentReadout.faces.CRT1.format') == current
    page.wait_for_function('window.__instrumentReadout.faces.CRT3.visible')
    lower = page.evaluate('window.__instrumentReadout.faces.CRT3')
    assert page.evaluate('(p) => document.elementFromPoint(p.x,p.y)?.tagName === "CANVAS"', lower)
    page.mouse.click(lower['x'], lower['y'])
    page.wait_for_function('(old) => window.__instrumentReadout.faces.CRT3.format !== old', arg=lower['format'])
    capture('orbit-center-crts')
    inspect('Aft station', 'aft')
    capture('orbit-aft')
    page.keyboard.press('Escape')
    page.wait_for_function('window.__cockpitReadout === null')

    approach = start('Final approach')
    assert approach['altitudeFeet'] < 10000 and approach['verticalSpeedFpm'] < 0
    capture('approach-forward')
    inspect('Flight instruments', 'displays')
    capture('approach-instruments')
    lighting = page.get_by_role('slider', name='Panel lighting')
    lighting.focus(); page.keyboard.press('Home')
    expect(lighting).to_have_value('25')
    capture('approach-instruments-dim')
    page.keyboard.press('End')
    capture('approach-instruments-bright')
    page.get_by_role('button', name='Save checkpoint', exact=True).click()
    checkpoint = page.evaluate('window.__instrumentReadout')
    page.get_by_role('button', name='Resume', exact=True).click()
    page.evaluate('window.__controlsTest.tick(30)')
    page.get_by_role('button', name='Pause', exact=True).click()
    page.wait_for_function('(y) => window.__instrumentReadout.sourceAltitudeMeters < y - 1', arg=checkpoint['sourceAltitudeMeters'])
    page.get_by_role('button', name='Restore checkpoint', exact=True).click()
    page.wait_for_function('(saved) => Math.abs(window.__instrumentReadout.sourceAltitudeMeters - saved) < 1e-6', arg=checkpoint['sourceAltitudeMeters'])
    expect(page.get_by_role('button', name='Resume', exact=True)).to_be_visible()
    # Recovery opens the real checklist; instruments remain readable on phones.
    page.set_viewport_size({'width':390, 'height':844})
    inspect('Flight instruments', 'displays')
    page.wait_for_function('["F6-adi","F6-hsi","F6-ami","F6-avvi"].every(k => { const p=window.__instrumentReadout?.faces[k]; return p?.visible && document.elementFromPoint(p.x,p.y)?.tagName === "CANVAS"; })')
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    capture('mobile-instruments-checklist')
    page.set_viewport_size({'width':390, 'height':600})
    page.wait_for_function('["F6-adi","F6-hsi","F6-ami","F6-avvi"].every(k => { const p=window.__instrumentReadout?.faces[k]; return p?.visible && document.elementFromPoint(p.x,p.y)?.tagName === "CANVAS"; })')
    assert page.evaluate('(() => { const b=document.querySelector(".procedure-action").getBoundingClientRect(); const s=document.querySelector(".sheet").getBoundingClientRect(); return b.top >= s.top && b.bottom <= s.bottom; })()'), 'The full Resume button must fit without scrolling the inspection card'
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    capture('short-mobile-instruments-checklist')
    page.keyboard.press('Escape')
    page.wait_for_function('window.__cockpitReadout === null')

    # Leaving a portrait reading crop must not carry it into an outside view.
    page.get_by_role('button', name='Change view', exact=True).click()
    expect(page.locator('.hud')).not_to_have_attribute('data-view', 'cockpit')
    page.wait_for_function('window.__instrumentReadout === undefined')
    for _ in range(2):
        if page.locator('.hud').get_attribute('data-view') == 'cockpit':
            break
        page.get_by_role('button', name='Change view', exact=True).click()
    expect(page.locator('.hud')).to_have_attribute('data-view', 'cockpit')
    page.wait_for_function('Object.keys(window.__instrumentReadout?.faces ?? {}).length === 13')

    (out / 'capture-state.json').write_text(json.dumps(records, indent=2) + '\n')
    assert not errors, errors
    assert not console_errors, console_errors
    print('Legacy cockpit: four real CRT nodes, nine discrete instruments, units, ray-picked format/drag, paused updates, recovery and desktop/phone captures passed.', flush=True)
    browser.close()
