export type GuidedModel = {key:string;group:string;title:string;area:string;category?:string;questions:string[]};
const groups: Array<[string,string,Array<[string,string,string[]]>]> = [
 ['Comercial','comercial',[
  ['negociacao','Apoio em negociação',['Qual é a oportunidade ou protocolo?','Qual plano ou oferta está em negociação?','Qual é a dificuldade?','Qual apoio você precisa?']],
  ['condicao','Análise de condição comercial',['Qual é a oportunidade ou protocolo?','Qual condição está sendo solicitada?','Qual é a justificativa comercial?','Até quando precisa da análise?']],
  ['plano','Dúvida sobre plano ou campanha',['Qual plano ou campanha?','Qual é a sua dúvida?','Em qual canal será utilizado?']],
  ['cadastro','Correção de cadastro ou proposta',['Qual é o protocolo ou ID do cadastro?','Qual informação está incorreta?','Qual é a informação correta?','Qual o impacto da correção?']],
  ['pap','Apoio em condomínio ou ação PAP',['Qual condomínio, bairro ou região?','Qual é o objetivo da ação?','Qual a data prevista?','Quais materiais ou apoios são necessários?']],
 ]],
 ['Sistemas e CRM','crm',[
  ['kommo','Erro no Kommo',['Em qual tela ou funil ocorre?','Qual operação você tentou realizar?','O que deveria acontecer?','O que aconteceu ou qual mensagem apareceu?','Quantas pessoas foram afetadas?']],
  ['automacao','Ajuste de funil ou automação',['Qual funil ou automação?','Como funciona hoje?','Como precisa funcionar?','Quais situações precisam ser consideradas?']],
  ['integracao','Problema em integração',['Quais sistemas estão envolvidos?','Desde quando ocorre?','Qual informação não está sendo sincronizada?','Qual é o impacto na operação?']],
  ['acesso','Solicitação de acesso',['Qual sistema?','Quem precisa do acesso?','Quais atividades precisa realizar?','Quem é o responsável pela aprovação?']],
  ['melhoria','Melhoria de sistema',['Qual sistema e tela?','Qual problema precisa ser resolvido?','Como você imagina a melhoria?','Quem será beneficiado?']],
 ]],
 ['Marketing','marketing',[
  ['arte','Criação de arte',['Qual é o objetivo da peça?','Qual é o público?','Qual canal e formato serão usados?','Quais textos, ofertas e informações são obrigatórios?','Qual a data desejada?']],
  ['campanha','Divulgação de campanha',['Qual campanha?','Qual objetivo e público?','Quais canais devem ser utilizados?','Qual período de divulgação?','Onde estão as condições comerciais aprovadas?']],
  ['material','Material para ação comercial',['Qual é a ação?','Qual local e data?','Qual material, formato e quantidade?','Quais informações devem constar?']],
  ['site','Ajuste de site ou landing page',['Qual é o endereço da página?','O que precisa mudar?','Qual é o conteúdo correto ou resultado esperado?','Qual a data desejada?']],
  ['publicacao','Correção de informação publicada',['Onde a informação foi publicada?','Qual informação está errada?','Qual é a informação correta?','Qual é o impacto da publicação?']],
 ]],
 ['BI e relatórios','bi',[
  ['relatorio','Novo relatório',['Qual decisão o relatório deve apoiar?','Quais indicadores e filtros são necessários?','Qual período e frequência de atualização?','Quais são as fontes dos dados?']],
  ['painel','Ajuste de painel',['Qual painel ou página?','O que precisa mudar?','Qual resultado é esperado?','Qual é o impacto atual?']],
  ['indicador','Divergência de indicador',['Qual indicador e painel?','Qual período e filtros foram utilizados?','Qual valor aparece e qual valor era esperado?','Qual fonte permite conferir a divergência?']],
  ['extracao','Extração de dados',['Qual é a finalidade da extração?','Quais campos são necessários?','Qual período e filtros?','Qual formato e data desejados?']],
 ]],
 ['Infraestrutura e TI','ti',[
  ['computador','Problema no computador',['Qual equipamento e local?','Qual problema ocorre?','Desde quando acontece?','O que você já tentou?']],
  ['rede','Falha de internet ou rede',['Qual local?','A falha é no Wi-Fi, cabo ou ambos?','Quantas pessoas estão afetadas?','Desde quando ocorre?']],
  ['programa','Instalação de programa',['Qual programa e versão?','Qual equipamento?','Para qual atividade será utilizado?','Existe licença ou aprovação disponível?']],
  ['equipamento','Suporte a equipamento',['Qual equipamento e identificação?','Em qual local está?','Qual defeito ou apoio é necessário?','Qual é o impacto no trabalho?']],
 ]],
 ['Financeiro','financeiro',[
  ['comissao','Dúvida sobre comissão',['Qual competência ou período?','Qual é a sua dúvida ou divergência?','Quais protocolos permitem conferir?','Qual retorno você precisa?']],
  ['reembolso','Solicitação de reembolso',['Qual foi a despesa e sua finalidade?','Qual a data e o valor?','Quem aprovou a despesa?','Onde o comprovante pode ser consultado?']],
  ['financeiro','Correção financeira',['Qual lançamento ou protocolo?','O que está incorreto?','Qual informação ou valor é correto?','Qual documento permite conferir?']],
 ]],
 ['Administrativo','administrativo',[
  ['compra','Compra de material',['Qual material e quantidade?','Para qual atividade e local?','Qual é a justificativa?','Qual data desejada e aprovação disponível?']],
  ['administrativo','Apoio administrativo',['Qual atividade precisa de apoio?','Qual local ou equipe?','Qual resultado você espera?','Existe uma data necessária?']],
 ]],
 ['Ouvidoria','ouvidoria',[
  ['reclamacao','Reclamação',['O que aconteceu?','Quando e em qual contexto ocorreu?','Qual foi o impacto?','Qual solução ou retorno você espera?']],
  ['sugestao','Sugestão de melhoria',['Qual situação pode melhorar?','Qual é a sua sugestão?','Qual benefício você espera?']],
  ['elogio','Elogio',['Qual atitude ou atendimento deseja reconhecer?','Quando e em qual contexto aconteceu?','Quem ou qual equipe deseja reconhecer?']],
  ['relato-sensivel','Relato sensível',['O que você deseja relatar?','Quando e em qual contexto ocorreu?','Existe algum risco ou necessidade de atenção imediata?']],
 ]],
];
export const GUIDED_MODELS:GuidedModel[] = groups.flatMap(([group,area,items])=>items.map(([key,title,questions])=>({
 key:area+'-'+key,group,area,title,questions,...(area==='ouvidoria'?{category:key}:{}),
})));
export function guidedDescription(model:GuidedModel,answers:string[],extra:string) {
 if(answers.length!==model.questions.length || answers.some(a=>!a.trim()))throw new Error('Responda às perguntas obrigatórias do modelo.');
 const result=['Modelo: '+model.title,...model.questions.map((q,i)=>q+'\n'+answers[i].trim()),...(extra.trim()?['Informações adicionais\n'+extra.trim()]:[])].join('\n\n');
 if(result.length>5000)throw new Error('As respostas ultrapassam 5.000 caracteres. Resuma as informações para enviar.');
 return result;
}
