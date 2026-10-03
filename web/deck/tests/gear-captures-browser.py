"""Capture a real saved gear transit after public exterior cameras settle.

The fixture was created by GUI commands. Restore checkpoint owns recovery;
this script never assigns a camera, mechanism, physics or checklist state.
"""
import argparse
import json
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright, expect, TimeoutError

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url',default='http://127.0.0.1:4173')
parser.add_argument('--browser-executable',default=None)
parser.add_argument('--fixture',type=Path,default=Path(__file__).resolve().parent.parent/'review/gear-fixture.json')
parser.add_argument('--output',type=Path,default=Path(tempfile.gettempdir())/'shuttle-gear-captures')
parser.add_argument('--prefix',default='gear')
args=parser.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
fixture=args.fixture.read_text()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.browser_executable,headless=True,
        args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1280,'height':800})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.goto(args.base_url,wait_until='networkidle')
    page.evaluate('(s)=>localStorage.setItem("shuttle-deck-save",s)',fixture)
    page.get_by_role('button',name='Restore checkpoint',exact=True).click()
    dismiss=page.get_by_role('button',name='Dismiss checkpoint message',exact=True)
    if dismiss.count():
        try:
            dismiss.focus(timeout=5000)
            page.keyboard.press('Space')
        except TimeoutError:
            expect(dismiss).not_to_be_visible(timeout=8000)
    expect(page.locator('.procedure-focus')).to_contain_text('TRANSIT')
    for view in ['tower','chase']:
        page.get_by_role('button',name='Change view',exact=True).click()
        page.wait_for_function('(v)=>window.__payloadReadout?.view===v',arg=view)
        previous=page.evaluate('window.__payloadReadout')
        for _ in range(150):
            page.wait_for_timeout(500)
            current=page.evaluate('window.__payloadReadout')
            delta=max(abs(a-b) for a,b in zip(previous['eye'],current['eye']))
            if current['sampleTime']>previous['sampleTime'] and delta<1e-8: break
            previous=current
        else: raise AssertionError('Public camera did not settle')
        assert current['paused']
        assert current['get']==json.loads(fixture)['root']['clock']['get_s']
        page.screenshot(path=str(args.output/f'{args.prefix}-{view}.png'))
        state=page.evaluate('({payload:window.__payloadReadout,gear:window.__gearReadout,eye:window.__cabinReadout})')
        (args.output/f'{args.prefix}-{view}.json').write_text(json.dumps(state,indent=2)+'\n')
        print(view,'settled saved-state capture passed.',flush=True)
    assert not errors,errors
    browser.close()
