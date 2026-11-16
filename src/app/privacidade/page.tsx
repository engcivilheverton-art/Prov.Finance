import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de Privacidade · PROV',
  description: 'Como o PROV trata, protege e permite que você gerencie seus dados pessoais.',
};

const contatoPrivacidade = 'prov.suport@gmail.com';

export default function PrivacidadePage() {
  return (
    <main className="legal-pagina">
      <article className="card legal-conteudo">
        <div className="eyebrow">PROV · transparência e proteção de dados</div>
        <h1>Política de Privacidade</h1>
        <p className="suave">Atualizada em 16 de novembro de 2026</p>

        <section>
          <h2>1. Quem trata seus dados</h2>
          <p>O controlador dos dados pessoais tratados no PROV é Heverton Alves Cardoso, que opera o serviço como pessoa física. Para dúvidas, solicitações de privacidade ou exercício de direitos, escreva para <a href={`mailto:${contatoPrivacidade}?subject=Privacidade%20e%20dados%20pessoais`}>{contatoPrivacidade}</a>.</p>
        </section>

        <section>
          <h2>2. Dados tratados e finalidades</h2>
          <ul>
            <li><strong>Conta e autenticação:</strong> nome, e-mail e identificador da conta, para criar e proteger o acesso. O login por e-mail ou Google é processado pelo Firebase Authentication; o PROV não recebe sua senha em texto.</li>
            <li><strong>Perfil:</strong> nome e, se você optar por informar, idade e período dos gráficos, para personalizar o painel.</li>
            <li><strong>Planejamento financeiro:</strong> cartões identificados no app, faturas, descrições, datas, valores, categorias, rendas, dívidas, contas fixas e caixinhas, para calcular e exibir seu planejamento.</li>
            <li><strong>Importação CSV:</strong> o navegador lê o arquivo e envia ao PROV os lançamentos necessários à importação. O arquivo original não é mantido como arquivo de armazenamento pelo aplicativo.</li>
            <li><strong>Assinatura:</strong> plano, estado da assinatura e identificador da cobrança recorrente, para consultar e administrar o Premium. A contratação e os dados do meio de pagamento são tratados pelo Mercado Pago.</li>
            <li><strong>Suporte:</strong> se você usar o formulário, ele prepara uma mensagem no aplicativo de e-mail do seu dispositivo. O PROV não recebe nem envia essa mensagem; ela só chega ao suporte depois que você a envia por sua conta de e-mail.</li>
            <li><strong>Preferências do navegador:</strong> tema e escolha de gráfico do plano Free ficam no armazenamento local do navegador. O Firebase mantém a sessão de autenticação no dispositivo.</li>
          </ul>
        </section>

        <section>
          <h2>3. Base e uso dos dados</h2>
          <p>Os dados necessários para disponibilizar a conta e as funções solicitadas são tratados para executar o serviço. Dados de cobrança podem ser tratados para cumprir obrigações legais e registrar a assinatura. Dados técnicos mínimos podem ser usados para proteger o serviço, prevenir abuso e investigar falhas. O PROV não usa os registros financeiros do usuário para publicidade direcionada.</p>
        </section>

        <section>
          <h2>4. Relatórios para outras ferramentas de IA</h2>
          <p>O relatório preparado para análise por IA é montado no navegador. O PROV não o envia automaticamente a uma ferramenta de IA. Se você copiar o texto e colá-lo em outro serviço, esse serviço passará a tratar o conteúdo de acordo com suas próprias condições e políticas. Revise o texto e remova informações que não queira compartilhar.</p>
        </section>

        <section>
          <h2>5. Compartilhamento e fornecedores</h2>
          <p>Os dados são compartilhados apenas quando necessário para operar o PROV: Google/Firebase para autenticação e banco de dados, Netlify para hospedagem e execução do aplicativo, e Mercado Pago para pagamentos e assinaturas. Esses fornecedores podem tratar dados conforme seus serviços e contratos. O PROV não vende dados pessoais.</p>
        </section>

        <section>
          <h2>6. Armazenamento, localização e retenção</h2>
          <p>Os registros financeiros são associados à conta do usuário no Firestore. A localização de armazenamento depende da região configurada no projeto Firebase e dos fornecedores usados. Os dados ficam disponíveis enquanto a conta estiver ativa. Ao excluir a conta, o PROV remove os dados da base operacional e exclui a conta de autenticação; informações que precisem ser mantidas por obrigação legal ou para exercício regular de direitos podem ser retidas pelo prazo aplicável. O Mercado Pago e os provedores de infraestrutura podem manter registros próprios segundo suas obrigações, configurações e políticas.</p>
          <p>Quando houver transferência internacional de dados, o PROV deve adotar um mecanismo permitido pela LGPD e pelas regras da ANPD. Informações sobre regiões e salvaguardas podem ser solicitadas pelo canal de privacidade.</p>
        </section>

        <section>
          <h2>7. Segurança</h2>
          <p>O acesso aos dados financeiros é separado por conta autenticada. O PROV aplica controles técnicos e administrativos para reduzir acesso indevido e exposição. Não envie senhas, credenciais bancárias ou números completos de cartão ao suporte. Nenhum sistema conectado à internet pode prometer risco zero; se houver incidente que possa gerar risco ou dano relevante, serão adotadas as medidas e comunicações exigidas pela legislação.</p>
        </section>

        <section>
          <h2>8. Seus direitos e como solicitá-los</h2>
          <p>Você pode solicitar confirmação e acesso aos dados, correção, informação sobre compartilhamento, portabilidade quando aplicável, anonimização, bloqueio ou eliminação nos termos da LGPD. Para isso, escreva para <a href={`mailto:${contatoPrivacidade}?subject=Solicita%C3%A7%C3%A3o%20LGPD`}>{contatoPrivacidade}</a>, usando o assunto “Solicitação LGPD”. Podemos pedir confirmação proporcional de identidade para proteger a conta.</p>
          <p>Na área <Link href="/perfil">Perfil</Link>, usuários conectados podem baixar uma cópia dos dados armazenados no PROV ou solicitar a exclusão da conta. A exclusão cancela uma assinatura ativa antes de remover os dados operacionais do aplicativo.</p>
        </section>

        <section>
          <h2>9. Atualizações desta política</h2>
          <p>Esta política pode ser atualizada para refletir mudanças no aplicativo, nos fornecedores ou nas obrigações legais. A versão vigente ficará disponível nesta página.</p>
        </section>

        <p className="legal-voltar"><Link href="/login">Voltar para o acesso</Link></p>
      </article>
    </main>
  );
}
