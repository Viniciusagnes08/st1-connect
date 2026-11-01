import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GUIDED_MODELS,guidedDescription} from '../../src/features/services/guided-models.ts';
import {parseServiceInput} from './service-catalog.js';

test('respostas guiadas chegam ao chamado com destino valido e Ouvidoria permanece reservada',()=>{
 for(const model of GUIDED_MODELS){
  const answers=model.questions.map((_,i)=>'Resposta informada '+i);
  const description=guidedDescription(model,answers,'Complemento informado');
  const parsed=parseServiceInput({formKey:model.category?'ouvidoria':'solicitacao-geral',title:model.title,description,
   ...(model.category?{category:model.category}:{area:model.area})});
  for(const answer of answers)assert.ok(parsed.description.includes(answer));
  assert.equal(parsed.confidential,model.area==='ouvidoria');
  assert.equal(parsed.area,model.area);
 }
});
test('envio incompleto e respostas maiores que o limite nao sao descartados silenciosamente',()=>{
 const model=GUIDED_MODELS[0];
 assert.throws(()=>guidedDescription(model,['Resposta'],''));
 assert.throws(()=>guidedDescription(model,model.questions.map(()=>''),''));
 assert.throws(()=>guidedDescription(model,model.questions.map(()=>'x'.repeat(2000)),''));
});
