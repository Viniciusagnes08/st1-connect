import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const app=readFileSync('src/App.tsx','utf8');
const css=readFileSync('src/sidebar.css','utf8');
const entry=readFileSync('src/main.tsx','utf8');

test('sidebar is internally scrollable, with accessible account outside scroll region',()=>{
  const top=app.indexOf('className="sidebar-header"');
  const nav=app.indexOf('className="sidebar-nav-scroll"');
  const profile=app.indexOf('className="sidebar-bottom"');
  assert.ok(top>=0 && top<nav && nav<profile);
  assert.ok(app.indexOf('</nav>',nav)<profile);
  assert.match(css,/\.sidebar-nav-scroll\s*\{[^}]*min-height:\s*0/);
  assert.match(css,/\.sidebar-nav-scroll\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css,/\.sidebar-bottom\s*\{[^}]*flex:\s*0\s+0\s+auto/);
  assert.match(css,/height:\s*100dvh/);
});

test('Squad BI remains first and examples separated from actual queue',()=>{
  const bi=app.indexOf('>SQUAD DE BI</div>');
  const demo=app.indexOf('>DEMONSTRAÇÃO</div>');
  const mgmt=app.indexOf('>GESTÃO</div>');
  assert.ok(bi>0 && demo>bi && mgmt>demo);
  assert.match(app,/className="sidebar-nav-group sidebar-nav-highlight"/);
  assert.match(app,/href="#\/bi"/);
  assert.ok(app.includes("(['overview', 'tickets', 'assets', 'knowledge'] as Page[]).filter(permitted)"));
  assert.ok(app.includes("(['teams', 'reports', 'settings'] as Page[]).filter(permitted)"));
});

test('mobile navigation has a close control and short viewport layout',()=>{
  assert.match(app,/className="sidebar-close" onClick=\{\(\) => setMobileOpen\(false\)\}/);
  assert.match(css,/@media\s*\(max-height:\s*470px\)/);
  assert.match(css,/@media\s*\(max-width:\s*880px\)/);
  assert.ok(entry.includes("import './sidebar.css'"));
});

test('the workspace indicator is not a fake switch and profile remains operable',()=>{
  assert.ok(app.includes('<div className="workspace-switch"'));
  assert.ok(!app.includes('<button className="workspace-switch"'));
  assert.match(app,/className="sidebar-profile" onClick=\{\(\) => setProfileOpen\(true\)\}/);
  assert.ok(!app.includes('className="help-card"'));
});
