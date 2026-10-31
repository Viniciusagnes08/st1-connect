// Catálogo de formulários reais. Trata definições de fluxo, não dados fictícios.
const serviceAreas = [
  {value:'comercial',label:'Comercial'},
  {value:'crm',label:'Sistemas e CRM'},
  {value:'ti',label:'Infraestrutura e TI'},
  {value:'marketing',label:'Marketing e Comunicação'},
  {value:'financeiro',label:'Financeiro'},
  {value:'administrativo',label:'Administrativo'},
  {value:'geral',label:'Outro assunto'},
];
const categories = [
  {value:'reclamacao',label:'Reclamação'},
  {value:'sugestao',label:'Sugestão'},
  {value:'elogio',label:'Elogio'},
  {value:'relato-sensivel',label:'Relato sensível'},
];
export const SERVICE_FORMS = Object.freeze([
  {
    key:'solicitacao-geral',title:'Solicitação geral',
    description:'Encaminhe uma demanda para triagem administrativa. A área responsável será designada após validação.',
    confidential:false,
    fields:[{name:'area',label:'Área de destino',type:'select',required:true,options:serviceAreas}],
  },
  {
    key:'ouvidoria',title:'Ouvidoria ST1',
    description:'Canal reservado de reclamações, sugestões, elogios e relatos sensíveis. Identidade visível apenas ao solicitante e ao Admin Master durante a implantação.',
    confidential:true,
    fields:[{name:'category',label:'Tipo de manifestação',type:'select',required:true,options:categories}],
  },
]);
export const SERVICE_STATES=Object.freeze(['Novo','Em triagem','Em atendimento','Pendente','Resolvido','Fechado']);
const TRANSITIONS=Object.freeze({
  Novo:['Em triagem','Em atendimento'],
  'Em triagem':['Em atendimento','Pendente','Resolvido'],
  'Em atendimento':['Pendente','Resolvido'],
  Pendente:['Em triagem','Em atendimento','Resolvido'],
  Resolvido:['Fechado','Em atendimento'],
  Fechado:[],
});
const failure=(msg,status=400)=>Object.assign(new Error(msg),{status});
export function parseServiceInput(input) {
  if(!input || typeof input!=='object'||Array.isArray(input))
    throw failure('Solicitação inválida.');
  if(Object.keys(input).some(key=>!['formKey','area','category','title','description'].includes(key)))
    throw failure('Existem campos não permitidos.');
  const form=SERVICE_FORMS.find(x=>x.key===input.formKey);
  if(!form)throw failure('Formulário não disponível.');
  const title=typeof input.title==='string'?input.title.trim():'';
  const description=typeof input.description==='string'?input.description.trim():'';
  if(title.length<6||title.length>160)throw failure('Informe um assunto de 6 a 160 caracteres.');
  if(description.length<12||description.length>5000)throw failure('Descreva a solicitação com 12 a 5000 caracteres.');
  if(form.key==='ouvidoria'){
    const category=String(input.category||'');
    if(!categories.some(x=>x.value===category)||input.area)
      throw failure('Escolha um tipo válido de manifestação.');
    return {area:'ouvidoria',category,title,description,confidential:true,formKey:form.key};
  }
  const area=String(input.area||'');
  if(!serviceAreas.some(x=>x.value===area)||input.category)
    throw failure('Escolha uma área de destino válida.');
  return {area,category:'solicitacao-geral',title,description,confidential:false,formKey:form.key};
}
export function validateServiceTransition(from,to,reason) {
  if(typeof to!=='string'||!TRANSITIONS[from]?.includes(to))
    throw failure('Transição de atendimento não permitida.',409);
  if(typeof reason!=='string'||reason.length>2000||
     (['Pendente','Resolvido'].includes(to)&&reason.trim().length<10))
    throw failure('Descreva a atualização com pelo menos 10 caracteres.');
  return {state:to,reason:reason.trim()};
}
