import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/login-viewport.css', 'utf8');
const base = readFileSync('src/auth.css', 'utf8');
const entry = readFileSync('src/main.tsx', 'utf8');
const login = readFileSync('src/AuthGate.tsx', 'utf8');

test('tela de login acompanha a altura dinâmica da janela', () => {
  assert.match(css, /\.auth-layout\s*\{[^}]*height:\s*100dvh/);
  assert.match(css, /\.auth-layout\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /\.auth-layout\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*52fr\)\s+minmax\(0,\s*48fr\)/);
});

test('painéis têm rolagem vertical independente quando o conteúdo excede', () => {
  assert.match(css, /\.auth-hero,\s*\.auth-main\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /\.auth-hero,\s*\.auth-main\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.auth-form-shell\s*\{[^}]*flex:\s*0\s+0\s+auto/);
  assert.match(css, /\.auth-bottom-link\s*\{[^}]*flex:\s*0\s+0\s+auto/);
});

test('versão móvel ocupa a tela sem painel lateral e permite rolagem', () => {
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /\.auth-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.auth-hero\s*\{\s*display:\s*none/);
  assert.match(css, /\.auth-main\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)\s*and\s*\(max-height:\s*620px\)/);
});

test('alturas reduzidas mantêm acesso ao formulário por rolagem, sem ocultar ações', () => {
  assert.match(css, /@media\s*\(min-width:\s*901px\)\s*and\s*\(max-height:\s*760px\)/);
  assert.match(css, /@media\s*\(max-height:\s*410px\)/);
  assert.doesNotMatch(css, /\.auth-submit\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('CSS de dimensionamento é carregado depois dos estilos de base', () => {
  const basePos = entry.indexOf("import './styles.css'");
  const sidebarPos = entry.indexOf("import './sidebar.css'");
  const loginPos = entry.indexOf("import './login-viewport.css'");
  assert.ok(basePos >= 0 && sidebarPos > basePos && loginPos > sidebarPos);
  assert.match(base, /\.auth-layout\{min-height:100vh/);
});

test('login, ativação e recuperação permanecem com formulário e botões', () => {
  assert.match(login, /className="auth-layout"/);
  assert.match(login, /className="auth-form" onSubmit=\{submit\}/);
  assert.match(login, /className="auth-submit"/);
  assert.match(login, /className="auth-forgot"/);
  assert.match(login, /className="auth-invite-email"/);
  assert.match(login, /'activate' : setup \? 'setup' : 'login'/);
});

test('efeito decorativo não força barra de rolagem em altura normal', () => {
  assert.match(css, /\.auth-orbit\s*\{[^}]*width:\s*min\(620px,\s*70dvh\)/);
  assert.match(css, /\.auth-orbit\s*\{[^}]*height:\s*min\(620px,\s*70dvh\)/);
  assert.match(css, /\.auth-orbit\s*\{[^}]*top:\s*29%/);
});
