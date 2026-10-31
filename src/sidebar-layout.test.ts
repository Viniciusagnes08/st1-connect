import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/OperationalApp.tsx', 'utf8');
const css = readFileSync('src/sidebar.css', 'utf8');
const activeStyle = readFileSync('src/operational.css', 'utf8');
const entry = readFileSync('src/main.tsx', 'utf8');
const auth = readFileSync('src/AuthGate.tsx', 'utf8');

test('navegacao ativa tem barra rolavel e perfil fora da rolagem', () => {
  const top = app.indexOf('className="sidebar-header"');
  const nav = app.indexOf('className="sidebar-nav-scroll"');
  const profile = app.indexOf('className="sidebar-bottom"');
  assert.ok(top >= 0 && top < nav && nav < profile);
  assert.ok(app.indexOf('</nav>', nav) < profile);
  assert.match(css, /\.sidebar-nav-scroll\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /\.sidebar-nav-scroll\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.sidebar-bottom\s*\{[^}]*flex:\s*0\s+0\s+auto/);
  assert.match(css, /height:\s*100dvh/);
});

test('ST1 Connect e multi-area; BI e o primeiro modulo, nao toda a plataforma', () => {
  const corporate = app.indexOf('>PLATAFORMA</div>');
  const areas = app.indexOf('>ÁREAS DE ATENDIMENTO</div>');
  const continuity = app.indexOf('>CONTINUIDADE DOS DADOS</div>');
  assert.ok(corporate >= 0 && areas > corporate && continuity > areas);
  assert.match(app, /navItem\('overview', 'Visão geral'/);
  assert.match(app, /navItem\('requests', 'Minhas solicitações'/);
  assert.match(app, /navItem\('bi', 'Central de BI'/);
  assert.match(app, /navItem\('services', 'Solicitações gerais'/);
  assert.match(app, /navItem\('ouvidoria', 'Ouvidoria'/);
  assert.match(app, /user\.isMaster && navItem\('management', 'Gestão Master'/);
  assert.match(app, /navItem\('areas', 'Outras áreas'/);
  assert.match(app, /navItem\('legacy', 'Dados locais anteriores'/);
  assert.match(app, /Em implantação/);
  assert.match(app, /Atendimento especializado ainda não habilitado/);
});

test('mobile mantem menu e perfil acessiveis com telas curtas', () => {
  assert.match(app, /className="sidebar-close" onClick=\{\(\) => setMobileOpen\(false\)\}/);
  assert.match(css, /@media\s*\(max-height:\s*470px\)/);
  assert.match(css, /@media\s*\(max-width:\s*880px\)/);
  assert.match(activeStyle, /@media\s*\(max-width:\s*620px\)/);
  assert.match(activeStyle, /prefers-reduced-motion:\s*reduce/);
  assert.ok(entry.includes("import './sidebar.css'"));
});

test('indicador de workspace e informativo e perfil continua operavel', () => {
  assert.ok(app.includes('<div className="workspace-switch"'));
  assert.ok(!app.includes('<button className="workspace-switch"'));
  assert.match(app, /className="sidebar-profile" onClick=\{\(\) => setProfileOpen\(true\)\}/);
  assert.ok(!app.includes('className="help-card"'));
  assert.match(app, /<ProfilePanel user=\{user\}/);
});

test('a entrada autenticada aponta somente para a interface operacional multi-area', () => {
  assert.match(auth, /import OperationalApp from '\.\/OperationalApp'/);
  assert.match(auth, /if \(user\) return <OperationalApp user=\{user\}/);
  assert.doesNotMatch(auth, /import App from '\.\/App'/);
});
