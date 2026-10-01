"""Browser regression for deliberate checklist commands and landing.

Requires Python Playwright and a running built app (npm run preview).
Simulation time advances through the existing controls probe; all commands
come from actual GUI, keyboard or pointer inputs.
"""
from pathlib import Path
import argparse
import json
import tempfile
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:4173')
parser.add_argument('--browser-executable', default=None)
parser.add_argument('--output', default=str(Path(tempfile.gettempdir()) / 'shuttle-walkthrough'))
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser_executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.base_url, wait_until='networkidle')
    page.keyboard.press('c')
    page.get_by_role('button', name='Start in orbit', exact=True).click()
    focus = page.locator('.procedure-focus')
    expect(focus).to_be_visible()
    expect(page.locator('.hud')).to_have_attribute('data-view', 'cockpit')
    expect(page.locator('.flightdeck')).not_to_be_visible()
    page.get_by_role('button', name='1×', exact=True).click()
    page.get_by_role('button', name='Open bay doors', exact=True).first.click()
    expect(focus).to_contain_text('Doors moving')
    expect(focus.get_by_role('button', name='Open bay doors')).to_be_disabled()
    page.get_by_role('button', name='Pause', exact=True).click()
    expect(focus).to_contain_text('PAUSED')
    focus.get_by_role('button', name='Resume flight').click()
    page.evaluate('window.__controlsTest.tick(3000)')
    page.wait_for_timeout(200)
    print('After opening:', focus.inner_text())
    page.screenshot(path=str(out / 'shuttle-doors-open.png'))
    focus.get_by_role('button', name='Close bay doors', exact=True).click()
    expect(focus).to_contain_text('Doors moving')
    page.evaluate('window.__controlsTest.tick(3000)')
    page.wait_for_timeout(200)
    print('After closing:', focus.inner_text())
    if focus.get_by_role('button', name='Start APUs', exact=True).count():
        focus.get_by_role('button', name='Start APUs', exact=True).click()
        page.evaluate('window.__controlsTest.tick(1000)')
        page.wait_for_timeout(200)
    print('Burn ready:', focus.inner_text())
    burn = focus.get_by_role('button', name='Hold deorbit burn', exact=True)
    expect(burn).to_be_enabled()
    burn.focus()
    page.keyboard.down('Space')
    page.evaluate('window.__controlsTest.tick(10)')
    page.wait_for_timeout(100)
    expect(focus).to_contain_text('BURNING')
    # Collapsing during a keyboard hold must release the crew input.
    page.keyboard.press('c')
    page.keyboard.up('Space')
    page.keyboard.press('c')
    page.evaluate('window.__controlsTest.tick(10)')
    page.wait_for_timeout(100)
    expect(focus).to_contain_text('IDLE')
    burn = focus.get_by_role('button', name='Hold deorbit burn', exact=True)
    burn.scroll_into_view_if_needed()
    point = burn.bounding_box()
    page.mouse.move(point['x'] + point['width']/2, point['y'] + point['height']/2)
    page.mouse.down()
    for _ in range(120):
        page.evaluate('window.__controlsTest.tick(100)')
        page.wait_for_timeout(50)
        if focus.get_by_role('button', name='Begin deorbit coast', exact=True).count():
            break
    page.mouse.up()
    page.evaluate('window.__controlsTest.tick(10)')
    page.wait_for_timeout(100)
    coast = focus.get_by_role('button', name='Begin deorbit coast', exact=True)
    expect(coast).to_be_enabled()
    page.screenshot(path=str(out / 'shuttle-cutoff.png'))
    coast.click()
    page.evaluate('window.__controlsTest.tick(10)')
    page.wait_for_timeout(100)
    expect(page.locator('.phase-pill')).to_contain_text('DEORBIT')
    expect(focus).to_contain_text('Entry interface')
    expect(focus).to_contain_text('COASTING')
    print('Deorbit coast verified:', focus.inner_text())
    page.screenshot(path=str(out / 'shuttle-after-burn.png'))
    page.get_by_role('button', name='Controls [X]', exact=True).click()
    expect(page.locator('.flightdeck')).to_be_visible()
    page.keyboard.press('x')
    expect(page.locator('.flightdeck')).not_to_be_visible()
    page.keyboard.press('c')
    expect(focus).not_to_be_visible()
    page.keyboard.press('c')
    expect(focus).to_be_visible()
    page.screenshot(path=str(out / 'shuttle-cabin-checklist.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(250)
    page.screenshot(path=str(out / 'shuttle-mobile.png'))
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), 'mobile layout must stay within the viewport'
    page.set_viewport_size({'width': 1280, 'height': 800})
    page.get_by_role('button', name='16×', exact=True).click()
    for _ in range(24):
        page.evaluate('window.__controlsTest.tick(100)')
        page.wait_for_timeout(50)
        if page.evaluate('window.__controlsTest.phase()') != 'orbit':
            break
    print('Coast result:', page.evaluate('window.__controlsTest.phase()'))
    assert page.evaluate('window.__controlsTest.phase()') == 'entry'
    # The supported final-approach scenario verifies the complete landing card.
    page.reload(wait_until='networkidle')
    page.get_by_role('button', name='Final approach', exact=True).click()
    focus.get_by_role('button', name='Start APUs', exact=True).click()
    page.evaluate('window.__controlsTest.tick(20)')
    page.wait_for_timeout(100)
    for _ in range(70):
        if focus.get_by_role('button', name='Arm landing gear', exact=True).count():
            break
        page.evaluate('window.__controlsTest.tick(20)')
        page.wait_for_timeout(20)
    focus.get_by_role('button', name='Arm landing gear', exact=True).click()
    page.evaluate('window.__controlsTest.tick(10)')
    page.wait_for_timeout(100)
    expect(focus).to_contain_text('Gear down')
    if focus.get_by_role('button', name='Lower landing gear').is_disabled():
        print('Speed restriction:', focus.inner_text())
        for _ in range(200):
            page.evaluate('window.__controlsTest.tick(20)')
            page.wait_for_timeout(20)
            if focus.get_by_role('button', name='Lower landing gear').is_enabled():
                break
    focus.get_by_role('button', name='Lower landing gear').click()
    page.evaluate('window.__controlsTest.tick(10)')
    page.wait_for_timeout(100)
    expect(focus).to_contain_text('Gear moving')
    page.screenshot(path=str(out / 'shuttle-gear-transit.png'))
    for _ in range(400):
        page.evaluate('window.__controlsTest.tick(20)')
        page.wait_for_timeout(20)
        if page.evaluate('window.__controlsTest.phase()') in ['landed', 'lost']:
            break
    print('Landing result:', page.evaluate('window.__controlsTest.phase()'))
    print('Landing status:', page.locator('.menu').inner_text() if page.locator('.menu').count() else focus.inner_text())
    assert page.evaluate('window.__controlsTest.phase()') == 'landed'
    page.screenshot(path=str(out / 'shuttle-wheel-stop.png'))
    print('Page errors:', json.dumps(errors))
    assert not errors
    browser.close()
