import {readFileSync} from 'node:fs'
import {join} from 'node:path'

test('crew portal overrides the inherited white admin panels with the RideSafe charcoal palette',()=>{
  const css=readFileSync(join(process.cwd(),'src','app','transport.css'),'utf8')
  const finalPortal=css.lastIndexOf('.transport-shell .glass-panel,')
  expect(finalPortal).toBeGreaterThan(css.indexOf('background: #fff'))
  expect(css.slice(finalPortal,finalPortal+220)).toContain('background:#141417')
  expect(css.slice(css.lastIndexOf('.transport-shell {'),css.lastIndexOf('.transport-shell {')+160)).toContain('--text-main:#f0f0f5')
})
