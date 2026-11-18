export const AVISO_CONVERSAO_EXTRATO = 'Se o seu banco só oferece o extrato em PDF, você pode pedir a uma IA de sua preferência (como ChatGPT, Claude ou Gemini) para converter o PDF em CSV e depois importar aqui. Copie o texto abaixo, envie junto com o PDF e salve a resposta como arquivo .csv.';

export const PROMPT_CONVERSAO_EXTRATO = [
  'Converta o extrato bancário em PDF anexado para um arquivo CSV com exatamente estas colunas, nesta ordem, separadas por ponto e vírgula (;):',
  '',
  'Data;Descrição;Valor',
  '',
  'Regras:',
  '- Data no formato dd/mm/aaaa.',
  '- Descrição exatamente como aparece no extrato, sem resumir.',
  '- Valor com vírgula como separador decimal e sem símbolo de moeda (exemplo: 1234,56). Use sinal negativo para saídas/débitos (exemplo: -89,90) e positivo para entradas/créditos.',
  '- Uma linha por movimentação, em ordem cronológica.',
  '- Não inclua saldo, totais, cabeçalhos do banco, rodapés nem linhas repetidas.',
  '- Ignore dados pessoais (CPF, número da conta) e não os inclua.',
  '- Responda apenas com o conteúdo do CSV, sem explicações, para que eu possa salvar como arquivo .csv.',
].join('\n');

export const PRIVACIDADE_IA_EXTRATO = 'Ao enviar seu extrato para uma IA externa, seus dados serão processados por esse serviço. Antes de enviar, apague ou oculte CPF, número completo da conta e outros dados que não forem necessários. Confira os valores gerados pela IA antes de importar.';
export const MODELO_EXTRATO_CSV = 'Data;Descrição;Valor\n05/11/2026;Mercado Exemplo;-125,90\n06/11/2026;Salário Exemplo;3200,00\n07/11/2026;Transferência entre contas;-250,00\n';
