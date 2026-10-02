"""Check checkpoint recovery using the real GUI, keyboard and saved packets.

Only the existing time-advance probe advances flight. Storage fixtures exercise
legacy/corrupt saves; no camera, dynamics, mechanism or checklist truth is set.
"""
import argparse
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:4173')
parser.add_argument('--browser-executable', default=None)
parser.add_argument('--output', default=str(Path(tempfile.gettempdir())/'shuttle-checkpoint'))
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser_executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width':1280,'height':800})
    errors, failed_assets = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('requestfailed', lambda r: failed_assets.append(r.url))
    page.on('response', lambda r: failed_assets.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    page.goto(args.base_url, wait_until='networkidle')
    save = page.get_by_role('button', name='Save checkpoint', exact=True)
    restore = page.get_by_role('button', name='Restore checkpoint', exact=True)
    focus = page.locator('.procedure-focus')

    def dismiss():
        button = page.get_by_role('button', name='Dismiss checkpoint message', exact=True)
        if button.count(): button.click()

    def packet():
        return page.evaluate('JSON.parse(localStorage.getItem("shuttle-deck-save"))')

    def verify_paused():
        expect(page.locator('.hud')).to_have_attribute('data-menu', 'false')
        expect(page.locator('.hud')).to_have_attribute('data-checklist-open', 'true')
        expect(page.locator('.hud')).to_have_attribute('data-controls-open', 'false')
        expect(focus).to_contain_text('PAUSED')
        expect(page.get_by_role('button', name='Resume', exact=True)).to_be_visible()

    expect(save).to_be_disabled()
    restore.click()
    expect(page.get_by_role('alert')).to_contain_text('No checkpoint saved')
    dismiss()
    page.get_by_role('button', name='Final approach', exact=True).click()
    page.get_by_role('button', name='Pause', exact=True).click()
    page.wait_for_function('window.__landingReadout?.visible && window.__landingReadout.windowClear')
    save.click()
    expect(page.locator('.checkpoint-feedback')).to_contain_text('Checkpoint saved')
    approach = packet()
    dismiss()

    # Restoring the same step must return from an expanded, scrolled overview
    # to the current instruction, even when the checklist was already open.
    page.locator('.procedure-overview > summary').click()
    page.locator('.sheet').hover()
    page.mouse.wheel(0,2000)
    page.wait_for_function('document.querySelector(".sheet").scrollTop > 10')
    restore.click()
    verify_paused()
    page.wait_for_function('document.querySelector(".sheet").scrollTop === 0 && !document.querySelector(".procedure-overview").open')
    dismiss()

    # Native range focus must not turn F5 into a browser reload or swallow F9.
    page.get_by_role('button', name='Flight instruments', exact=True).click()
    page.wait_for_function('window.__cockpitReadout?.target === "displays"')
    page.get_by_role('slider', name='Panel lighting').focus()
    page.keyboard.press('F5')
    expect(page.locator('.checkpoint-feedback')).to_contain_text('Checkpoint saved')
    assert packet()['root']['dynamics'] == approach['root']['dynamics']
    page.keyboard.press('F9')
    verify_paused()
    page.wait_for_function('window.__cockpitReadout === null')
    dismiss()

    # A different scenario used to reuse its origin and lose the runway anchor.
    page.reload(wait_until='networkidle')
    page.get_by_role('button', name='Start at entry', exact=True).click()
    page.get_by_role('button', name='Pause', exact=True).click()
    restore.click()
    verify_paused()
    page.wait_for_function('window.__landingReadout?.visible && window.__landingReadout.windowClear')
    save.click()
    recovered = packet()
    assert recovered['root']['dynamics'] == approach['root']['dynamics']
    assert recovered['deck']['frame'] == approach['deck']['frame']
    dismiss()

    # Fresh-page restore must leave the menu and show a coherent paused cabin.
    page.reload(wait_until='networkidle')
    restore.click()
    verify_paused()
    page.wait_for_function('window.__landingReadout?.visible && window.__landingReadout.windowClear')
    page.screenshot(path=str(out/'checkpoint-restored-desktop.png'))
    dismiss()
    save.click()
    assert packet()['deck']['frame'] == approach['deck']['frame']
    assert packet()['root']['dynamics'] == approach['root']['dynamics']
    for height in [844,600]:
        page.set_viewport_size({'width':390,'height':height})
        restore.click()
        verify_paused()
        for control in [save,restore,page.locator('.topbar'),page.locator('.checkpoint-feedback'),
                        page.get_by_role('button',name='Dismiss checkpoint message',exact=True)]:
            box = control.bounding_box()
            assert box and box['x'] >= 0 and box['x']+box['width'] <= 391, box
            assert box['y'] >= 0 and box['y']+box['height'] <= height+1, box
        feedback = page.locator('.checkpoint-feedback').bounding_box()
        sheet = page.locator('.sheet').bounding_box()
        assert feedback['y']+feedback['height'] < sheet['y'], 'Recovery feedback must not cover the checklist'
        page.screenshot(path=str(out/f'checkpoint-restored-mobile-{height}.png'))
        dismiss()
        focus.get_by_role('button',name='Resume flight',exact=True).scroll_into_view_if_needed()
        expect(focus.get_by_role('button',name='Resume flight',exact=True)).to_be_in_viewport()
    print('Desktop/phone, cross-scenario, cold restore and focused F5/F9 passed.', flush=True)

    # Save mid-door transit. Later verification must not leak when rewinding;
    # after Resume the doors must continue opening rather than reverse.
    page.set_viewport_size({'width':1280,'height':800})
    page.reload(wait_until='networkidle')
    page.get_by_role('button',name='Start in orbit',exact=True).click()
    page.get_by_role('button',name='1×',exact=True).click()
    focus.get_by_role('button',name='Open bay doors',exact=True).click()
    page.evaluate('window.__controlsTest.tick(100)')
    page.get_by_role('button',name='Pause',exact=True).click()
    expect(focus).to_contain_text('TRANSIT')
    save.click()
    early = packet()
    dismiss()
    page.get_by_role('button',name='Resume',exact=True).click()
    page.evaluate('window.__controlsTest.tick(1300)')
    expect(focus).to_contain_text('Doors for deorbit')
    focus.get_by_role('button',name='Close bay doors',exact=True).click()
    page.evaluate('window.__controlsTest.tick(1400)')
    expect(focus).to_contain_text('APUs 2+3 for entry')
    page.get_by_role('button',name='Pause',exact=True).click()
    save.click()
    closed = packet()
    assert 'plbd:open' in closed['deck']['procedureLatch']
    assert 'plbd:close' in closed['deck']['procedureLatch']
    dismiss()
    page.evaluate('(saved) => localStorage.setItem("shuttle-deck-save",JSON.stringify(saved))', early)
    restore.click()
    verify_paused()
    expect(focus.locator('h4')).to_have_text('Doors')
    expect(focus).to_contain_text('TRANSIT')
    dismiss()
    page.get_by_role('button',name='Resume',exact=True).click()
    page.evaluate('window.__controlsTest.tick(1300)')
    expect(focus).to_contain_text('Doors for deorbit')
    page.evaluate('(saved) => localStorage.setItem("shuttle-deck-save",JSON.stringify(saved))', closed)
    page.reload(wait_until='networkidle')
    restore.click()
    verify_paused()
    expect(focus).to_contain_text('APUs 2+3 for entry')
    dismiss()
    focus.get_by_role('button',name='Resume flight',exact=True).click()
    focus.get_by_role('button',name='Start APUs',exact=True).click()
    page.evaluate('window.__controlsTest.tick(300)')
    page.get_by_role('button',name='Pause',exact=True).click()
    expect(focus).to_contain_text('STARTING')
    save.click()
    page.reload(wait_until='networkidle')
    restore.click()
    verify_paused()
    expect(focus).to_contain_text('STARTING')
    dismiss()
    focus.get_by_role('button',name='Resume flight',exact=True).click()
    page.evaluate('window.__controlsTest.tick(1000)')
    expect(focus).to_contain_text('Lower orbital periapsis')

    # Keyboard-held OMS burn must not be replayed on restoring its checkpoint.
    burn = focus.get_by_role('button',name='Hold deorbit burn',exact=True)
    burn.focus()
    page.keyboard.down('Space')
    page.evaluate('window.__controlsTest.tick(10)')
    expect(focus).to_contain_text('BURNING')
    page.keyboard.press('F5')
    page.keyboard.press('F9')
    page.keyboard.up('Space')
    verify_paused()
    expect(focus).to_contain_text('IDLE')
    dismiss()
    focus.get_by_role('button',name='Resume flight',exact=True).click()
    page.evaluate('window.__controlsTest.tick(50)')
    expect(focus).to_contain_text('IDLE')
    page.get_by_role('button',name='Pause',exact=True).click()
    page.screenshot(path=str(out/'checkpoint-restored-checklist.png'))
    print('Checklist rewind/cold history, restored mechanism commands and held burn release passed.', flush=True)

    # Failure and legacy messages come from actual Restore clicks.
    page.evaluate('localStorage.setItem("shuttle-deck-save","{broken")')
    restore.click()
    expect(page.get_by_role('alert')).to_contain_text('incompatible or incomplete')
    expect(focus).to_contain_text('Lower orbital periapsis')
    page.screenshot(path=str(out/'checkpoint-unreadable.png'))
    dismiss()
    legacy = approach.copy()
    legacy['deck'] = {'callout':approach['deck']['callout']}
    legacy['root'] = dict(approach['root'])
    legacy['root']['controls'] = {'breakers':approach['root']['controls']['breakers']}
    page.evaluate('(saved) => localStorage.setItem("shuttle-deck-save",JSON.stringify(saved))',legacy)
    restore.click()
    verify_paused()
    expect(page.locator('.checkpoint-feedback')).to_contain_text('Older checkpoint restored')
    page.wait_for_function('window.__landingReadout?.visible && window.__landingReadout.windowClear')
    dismiss()
    page.evaluate('Object.defineProperty(window,"localStorage",{get(){throw new Error("storage denied")}})')
    save.click()
    expect(page.get_by_role('alert')).to_contain_text('Could not save checkpoint')
    dismiss()
    restore.click()
    expect(page.get_by_role('alert')).to_contain_text('Could not read checkpoint')
    assert not errors, errors
    assert not failed_assets, failed_assets
    print('Missing, corrupt, legacy and denied-storage feedback passed; no browser/resource errors.', flush=True)
    browser.close()
