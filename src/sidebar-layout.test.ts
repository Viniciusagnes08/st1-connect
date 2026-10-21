import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx', 'utf8');
const css = readFileSync('src/sidebar.css', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');

test('barra lateral tem cabeçalho, menu com rolagem e perfil fora da rolagem', () => {
  const header = app.indexOf('className="sidebar-header"');
  const scroll = app.indexOf('className="sidebar-nav-scroll"');
  const footer = app.indexOf('className="sidebar-bottom"');
  assert.ok(header > 0 && scroll > header && footer > scroll);
  assert.ok(app.indexOf('</nav>', scroll) < footer);
  assert.match(css, /\.sidebar-nav-scroll\s*\{[^}]*flex:\s*1\s+1\s+auto/);
  assert.match(css, /\.sidebar-nav-scroll\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /\.sidebar-nav-scroll\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.sidebar-bottom\s*\{[^}]*flex:\s*0\s+0\s+auto/);
});

test('altura respeita viewport dinâmico e espaços de segurança', () => {
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media\s*\(max-height:\s*470px\)/);
  assert.match(css, /@media\s*\(max-width:\s*880px\)/);
});

test('seções agrupadas e indicador de trabalho sem falso seletor', () => {
  for (const group of ['OPERAÇÃO', 'RECURSOS', 'GESTÃO']) assert.ok(app.includes('>'+group+'</div>'));
  assert.ok(app.includes("(['overview', 'tickets'] as Page[]).some(permitted)"));
  assert.ok(app.includes("(['assets', 'knowledge'] as Page[]).some(permitted)"));
  assert.ok(app.includes("(['teams', 'reports', 'settings'] as Page[]).some(permitted)"));
  assert.ok(app.includes('<div className="workspace-switch"'));
  assert.ok(!app.includes('<button className="workspace-switch"'));
});

test('acesso ao perfil, fechamento móvel e conhecimento permanecem disponíveis', () => {
  assert.match(app,/className="sidebar-close" onClick=\{\(\) => setMobileOpen\(false\)\}/);
  assert.match(app,/className="sidebar-profile" onClick=\{\(\) => setProfileOpen\(true\)\}/);
  assert.ok(app.includes("(['assets', 'knowledge'] as Page[]).filter(permitted)"));
  assert.ok(!app.includes('className="help-card"'));
  assert.ok(main.includes("import './sidebar.css'"));
});
