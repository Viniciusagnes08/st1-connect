import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui=readFileSync('src/AuthGate.tsx','utf8');
const css=readFileSync('src/auth-recovery.css','utf8');
const main=readFileSync('src/main.tsx','utf8');
const backend=readFileSync('api/auth.js','utf8');

test('recuperação só é apresentada quando o backend confirma a disponibilidade',()=>{
  assert.match(ui,/setRecoveryAvailable\(data\.adminRecoveryAvailable === true\)/);
  assert.match(ui,/forgot \? \(recoveryAvailable && !setup && !inviteToken/);
  assert.match(ui,/request\(isRecovery \? 'recover-admin'/);
  assert.match(backend,/process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(backend,/process\.env\.ST1_ADMIN_RECOVERY_ENABLED === 'true'/);
});

test('formulário do administrador funciona fora da sessão e solicita confirmação da nova senha',()=>{
  assert.match(ui,/name="setupToken" type="password" required/);
  assert.match(ui,/name="confirmPassword" type=\{visible/);
  assert.match(ui,/As senhas digitadas não são iguais/);
  assert.match(ui,/Redefinir senha e entrar/);
  assert.match(ui,/Voltar ao login/);
  assert.doesNotMatch(ui,/type="hidden" name="setupToken"/);
});

test('formulário está adaptado ao viewport e a senha não fica em URL nem no armazenamento local',()=>{
  assert.match(css,/\.auth-recovery-form/);
  assert.match(main,/import '\.\/login-viewport\.css';\s*import '\.\/auth-recovery\.css';/);
  assert.doesNotMatch(ui,/localStorage\.setItem\([^\n]*password/i);
  assert.match(backend,/admin\.version \+= 1/);
  assert.match(backend,/admin\.adminRecoveryUsedHash = secretHash/);
  assert.match(backend,/delete admin\.invitationHash/);
});
