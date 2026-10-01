"""Verify cockpit navigation and real 3D control picks against the live vehicle.

Requires Python Playwright and a running app. Only time advances through the
existing controls probe; target projection is read-only. Commands use GUI,
keyboard and scene pointer events.
"""
import argparse
from pathlib import Path
import re
import tempfile
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:4173')
parser.add_argument('--browser-executable', default=None)
parser.add_argument('--output', default=str(Path(tempfile.gettempdir()) / 'shuttle-cockpit'))
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser_executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width':1280,'height':800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url, wait_until='networkidle')
    page.get_by_role('button', name='Start in orbit', exact=True).click()
    page.get_by_role('button', name='1×', exact=True).click()
    page.get_by_role('button', name='Pause', exact=True).click()
    focus = page.locator('.procedure-focus')
    expect(page.locator('.hud')).to_have_attribute('data-view', 'cockpit')
    expect(page.locator('.flightdeck')).not_to_be_visible()

    def advance(steps):
        page.get_by_role('button', name='Resume', exact=True).click()
        page.evaluate('(steps) => window.__controlsTest.tick(steps)', steps)
        page.get_by_role('button', name='Pause', exact=True).click()

    def find(target):
        live = focus.locator('.procedure-state dd').first.inner_text()
        previous_revision = page.evaluate('window.__cockpitReadout?.revision ?? -1')
        focus.get_by_role('button', name='Find in cockpit').focus()
        page.keyboard.press('Space')
        page.wait_for_function('(p) => window.__cockpitReadout?.target === p.target && window.__cockpitReadout.revision > p.previous && window.__cockpitReadout.visible',
            arg={'target':target, 'previous':previous_revision})
        point = page.evaluate('window.__cockpitReadout')
        expect(focus.locator('.procedure-state dd').first).to_have_text(live)
        expect(page.locator('.flightdeck')).not_to_be_visible()
        # The projected scene control must be exposed, rather than hidden by DOM.
        assert page.evaluate('(p) => document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS"', point)
        return point

    def pick(point):
        page.mouse.click(point['x'], point['y'])

    # Finding and dragging cannot acknowledge a condition or issue a command.
    point = find('doors-open')
    page.mouse.move(point['x'], point['y'])
    page.mouse.down()
    page.mouse.move(point['x'] + 90, point['y'], steps=5)
    page.mouse.up()
    advance(10)
    expect(focus.locator('.procedure-state dd').first).to_have_text('CLOSED')
    point = find('doors-open')
    page.screenshot(path=str(out/'find-doors.png'))
    pick(point)
    advance(10)
    expect(focus).to_contain_text('TRANSIT')
    advance(3000)
    expect(focus).to_contain_text('Doors for deorbit')
    expect(focus.locator('.procedure-state dd').first).to_have_text('OPEN')
    page.set_viewport_size({'width':390,'height':844})
    point = find('doors-close')
    page.screenshot(path=str(out/'mobile-find-doors.png'))
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    pick(point)
    advance(10)
    expect(focus).to_contain_text('TRANSIT')
    advance(3000)
    expect(focus).to_contain_text('APUs 2+3 for entry')
    pick(find('apu'))
    advance(10)
    expect(focus).to_contain_text('STARTING')
    page.screenshot(path=str(out/'mobile-apu-starting.png'))
    advance(1000)
    expect(focus).to_contain_text('Lower orbital periapsis')
    print('Physical doors/APU and mobile picks passed.', flush=True)
    page.set_viewport_size({'width':1280,'height':800})
    page.keyboard.press('Escape')
    page.keyboard.press('c')
    page.screenshot(path=str(out/'forward-orbit.png'))
    for button, target in [('Flight displays','displays'), ('Overhead','overhead'), ('Aft station','aft')]:
        page.get_by_role('button',name=button,exact=True).click()
        page.wait_for_function('(target) => window.__cockpitReadout?.target === target', arg=target)
        page.screenshot(path=str(out/f'{target}.png'))
        if target == 'displays':
            lighting = page.get_by_role('slider', name='Panel lighting')
            lighting.focus()
            page.keyboard.press('Home')
            expect(lighting).to_have_value('25')
            page.screenshot(path=str(out/'displays-dim.png'))
            page.keyboard.press('End')
            expect(lighting).to_have_value('100')
            page.screenshot(path=str(out/'displays-bright.png'))
            expect(page.get_by_role('button',name='Resume',exact=True)).to_be_visible()
    page.keyboard.press('Escape')
    page.wait_for_function('window.__cockpitReadout === null')
    page.keyboard.press('c')

    # The optional console must also release its held burn when hidden.
    page.get_by_role('button',name='Resume',exact=True).click()
    page.get_by_role('button',name='Controls [X]',exact=True).click()
    burn = page.locator('.flightdeck .paddle').filter(has_text='OMS BURN')
    burn.focus()
    page.keyboard.down('Space')
    page.evaluate('window.__controlsTest.tick(10)')
    expect(focus).to_contain_text('BURNING')
    page.keyboard.press('x')
    page.keyboard.up('Space')
    page.evaluate('window.__controlsTest.tick(10)')
    expect(focus).to_contain_text('IDLE')
    page.get_by_role('button',name='Pause',exact=True).click()

    # A real helper switch first creates the EPS condition; Find does not fix it.
    page.get_by_role('button',name='Controls [X]',exact=True).click()
    page.locator('.flightdeck .paddle').filter(has_text='FC/MN').click()
    advance(20)
    expect(focus).to_contain_text('Fuel cells')
    pick(find('fuel-cells'))
    advance(20)
    # Removing electrical power stopped the APUs; restored power must spool
    # them again rather than acknowledging RUN immediately.
    expect(focus).to_contain_text('STARTING')
    advance(1000)
    expect(focus).to_contain_text('Lower orbital periapsis')
    print('Navigation, drawer hold cancellation and physical fuel-cell recovery passed.', flush=True)

    page.reload(wait_until='networkidle')
    page.get_by_role('button',name='Final approach',exact=True).click()
    expect(page.get_by_role('slider',name='Panel lighting')).to_have_value('100')
    page.get_by_role('button',name='Pause',exact=True).click()
    page.keyboard.press('c')
    page.screenshot(path=str(out/'forward-approach.png'))
    page.keyboard.press('c')
    pick(find('apu'))
    advance(10)
    expect(focus).to_contain_text('STARTING')
    advance(1000)
    expect(focus).to_contain_text('Gear arm')
    pick(find('gear-arm'))
    advance(10)
    expect(focus).to_contain_text('Gear down')
    point = find('gear')
    page.screenshot(path=str(out/'find-gear.png'))
    pick(point)
    advance(10)
    expect(focus).to_contain_text('TRANSIT')
    # Observe the modeled extend duration rather than assuming a five-second
    # transit. Reading the guide cannot acknowledge a moving gear down-lock.
    for _ in range(20):
        if 'Wheel stop' in focus.inner_text():
            break
        advance(20)
    expect(focus).to_contain_text('Wheel stop')
    page.locator('.procedure-overview summary').click()
    expect(page.locator('.procedure-overview .step').filter(has_text='Gear down').locator('em')).to_have_text('DN')
    print('Cockpit: physical doors, APU, fuel cells, gear, mobile picks, camera navigation and hold cancellation passed.')
    assert not errors, errors
    browser.close()
