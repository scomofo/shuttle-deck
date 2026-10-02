"""Inspect the dry-lake approach through real GUI/checklist controls.

The landing probe only reads projected scene positions. Time advances through
the existing controls probe; no camera or vehicle truth is assigned.
"""
import argparse
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:4173')
parser.add_argument('--browser-executable', default=None)
parser.add_argument('--output', default=str(Path(tempfile.gettempdir())/'shuttle-landing'))
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser_executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width':1280, 'height':800})
    errors = []
    failed_assets = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('requestfailed', lambda r: failed_assets.append(r.url))
    page.on('response', lambda r: failed_assets.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    page.goto(args.base_url, wait_until='networkidle')
    page.get_by_role('button', name='Final approach', exact=True).click()
    page.get_by_role('button', name='Pause', exact=True).click()
    page.wait_for_function('window.__landingReadout?.surface === "dry-lake"')
    guides = page.get_by_role('button', name='Approach guides', exact=True)
    expect(guides).to_have_attribute('aria-pressed','false')
    assert not page.evaluate('window.__landingReadout.guides')
    assert page.evaluate('window.__landingReadout.visible && window.__landingReadout.windowClear'), 'Runway threshold must project through a real window opening'
    print('Initial runway projection:', page.evaluate('window.__landingReadout'), flush=True)
    page.keyboard.press('c')
    page.screenshot(path=str(out/'dry-lake-forward.png'))
    guides.click()
    page.wait_for_function('window.__landingReadout.guides')
    expect(guides).to_have_attribute('aria-pressed','true')
    expect(page.get_by_role('button',name='Resume',exact=True)).to_be_visible()
    page.screenshot(path=str(out/'dry-lake-guides.png'))

    # Esc must work even from a native range input in an inspection view.
    page.get_by_role('button',name='Flight displays',exact=True).click()
    page.wait_for_function('window.__cockpitReadout?.target === "displays"')
    page.get_by_role('slider',name='Panel lighting').focus()
    page.keyboard.press('Escape')
    page.wait_for_function('window.__cockpitReadout === null')
    page.keyboard.press('c')

    # Assistance is a display preference, not a pause/checklist command.
    page.reload(wait_until='networkidle')
    page.get_by_role('button',name='Final approach',exact=True).click()
    page.get_by_role('button',name='Pause',exact=True).click()
    guides = page.get_by_role('button',name='Approach guides',exact=True)
    expect(guides).to_have_attribute('aria-pressed','true')
    guides.click()
    page.wait_for_function('window.__landingReadout && !window.__landingReadout.guides')

    focus = page.locator('.procedure-focus')
    expect(focus).to_contain_text('PAUSED')
    focus.get_by_role('button',name='Resume flight',exact=True).click()
    focus.get_by_role('button',name='Start APUs',exact=True).click()
    page.evaluate('window.__controlsTest.tick(1000)')
    expect(focus).to_contain_text('Gear arm')
    focus.get_by_role('button',name='Arm landing gear',exact=True).click()
    page.evaluate('window.__controlsTest.tick(10)')
    lower = focus.get_by_role('button',name='Lower landing gear',exact=True)
    for _ in range(200):
        if lower.is_enabled():
            break
        page.evaluate('window.__controlsTest.tick(20)')
    lower.click()
    page.evaluate('window.__controlsTest.tick(170)')
    expect(focus).to_contain_text('Wheel stop')
    page.get_by_role('button',name='Pause',exact=True).click()
    page.keyboard.press('c')
    page.screenshot(path=str(out/'dry-lake-final.png'))
    page.set_viewport_size({'width':390,'height':844})
    page.keyboard.press('c')
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    expect(page.get_by_role('button',name='Approach guides',exact=True)).to_be_visible()
    def assert_within_viewport(locator):
        box = locator.bounding_box()
        viewport = page.viewport_size
        assert box and box['x'] >= 0 and box['x']+box['width'] <= viewport['width']+1, box
        assert box['y'] >= 0 and box['y']+box['height'] <= viewport['height']+1, box

    # overflow:hidden can conceal clipped UI while scrollWidth still passes.
    for locator in [page.locator('.topbar'),page.locator('.phase-pill'),
        page.get_by_role('button',name='Checklist [C]',exact=True),focus,
        focus.locator('.procedure-state'),focus.get_by_role('button',name='Resume flight',exact=True)]:
        assert_within_viewport(locator)
    print('Mobile header/checklist/indication/action bounds passed.',flush=True)
    page.screenshot(path=str(out/'dry-lake-mobile.png'))
    page.set_viewport_size({'width':390,'height':600})
    focus.get_by_role('button',name='Resume flight',exact=True).scroll_into_view_if_needed()
    for locator in [page.locator('.topbar'),page.locator('.sheet'),focus.get_by_role('button',name='Resume flight',exact=True)]:
        assert_within_viewport(locator)
    page.screenshot(path=str(out/'dry-lake-short-mobile.png'))
    page.get_by_role('button',name='Resume',exact=True).click()
    for _ in range(35):
        page.evaluate('window.__controlsTest.tick(200)')
        if page.evaluate('window.__controlsTest.phase()') == 'landed':
            break
    expect(page.get_by_role('heading',name='WHEEL STOP',exact=True)).to_be_visible()
    assert not failed_assets, failed_assets
    assert not errors, errors
    print('Dry-lake rendering, guides preference, slider Escape and checklist to wheel stop passed.',flush=True)
    browser.close()
