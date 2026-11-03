import React from 'react'

const secoes = [
  {
    titulo: '1. Apresentação e identificação do serviço',
    paragrafos: [
      'Estes Termos de Uso regulam a utilização do QuitAÍ, plataforma destinada à organização de clientes, produtos, vendas, parcelas e pagamentos por revendedoras, além das funções de gestão administrativa.',
      'O serviço é desenvolvido por Marcos José Souza do Nascimento. O contato oficial para dúvidas e suporte é marcosjosesouzadonascimento@gmail.com. Esta versão foi revisada em 31 de outubro de 2026 e permanece sujeita à validação jurídica e operacional antes da publicação definitiva.'
    ]
  },
  {
    titulo: '2. Aceitação e acesso',
    paragrafos: [
      'O uso do QuitAÍ pressupõe a ciência destes Termos. Quando a legislação ou a natureza do tratamento exigir consentimento específico, ele será solicitado separadamente e não será presumido pela simples aceitação destes Termos.',
      'O acesso às áreas restritas depende de credenciais válidas e de conta habilitada. O administrador poderá criar, bloquear e reativar contas de revendedoras conforme as regras aplicáveis e os recursos efetivamente disponibilizados.'
    ]
  },
  {
    titulo: '3. Responsabilidades das revendedoras',
    paragrafos: [
      'A revendedora deve fornecer informações corretas, proteger suas credenciais e utilizar a plataforma de forma lícita, respeitando direitos de terceiros e a legislação aplicável.',
      'Ao cadastrar dados de clientes, a revendedora deve observar as regras de proteção de dados pessoais e informar os titulares sobre o tratamento, conforme seu papel e suas responsabilidades na operação.'
    ]
  },
  {
    titulo: '4. Dados, registros e informações financeiras',
    paragrafos: [
      'O QuitAÍ oferece recursos de registro e acompanhamento de operações comerciais. A exatidão dos valores, vencimentos, pagamentos e demais informações lançadas depende dos dados inseridos e conferidos pelos usuários.',
      'O registro de um pagamento na plataforma não equivale, por si só, à confirmação de uma transferência bancária ou de liquidação financeira por instituição de pagamento.'
    ]
  },
  {
    titulo: '5. Privacidade e proteção de dados',
    paragrafos: [
      'O tratamento de dados pessoais deverá observar a Lei nº 13.709/2018 (LGPD), o Marco Civil da Internet (Lei nº 12.965/2014), suas regulamentações aplicáveis e, quando pertinente, normas estrangeiras como o Regulamento Geral de Proteção de Dados da União Europeia (GDPR/RGPD).',
      'As finalidades, bases legais, categorias de dados, eventuais compartilhamentos e formas de exercício de direitos deverão ser detalhados na Política de Privacidade do QuitAÍ. Os papéis de controlador e operador serão definidos conforme cada atividade efetivamente realizada.'
    ]
  },
  {
    titulo: '6. Segurança da conta',
    paragrafos: [
      'É proibido acessar contas de terceiros sem autorização, compartilhar credenciais de forma insegura, explorar vulnerabilidades ou tentar comprometer a disponibilidade, integridade ou confidencialidade do sistema.',
      'Suspeitas de acesso indevido podem ser comunicadas pelo e-mail marcosjosesouzadonascimento@gmail.com, com descrição do ocorrido e sem o envio de senhas ou códigos de autenticação.'
    ]
  },
  {
    titulo: '7. Disponibilidade, manutenção e atualizações',
    paragrafos: [
      'O serviço poderá passar por correções, melhorias e períodos de indisponibilidade. Sempre que viável, manutenções programadas serão comunicadas previamente.',
      'Recursos de bloqueio temporário de acesso durante manutenção somente serão utilizados quando estiverem efetivamente implementados e acompanhados de controles adequados. Estes Termos não significam que tal funcionalidade já esteja disponível.'
    ]
  },
  {
    titulo: '8. Suspensão e encerramento de contas',
    paragrafos: [
      'Contas poderão ser suspensas ou bloqueadas em situações justificadas, como descumprimento destes Termos, risco à segurança ou solicitação legítima, observada a legislação aplicável.',
      'Pedidos de encerramento, exportação ou eliminação de dados serão avaliados considerando direitos dos titulares, obrigações legais de conservação e as responsabilidades de cada agente de tratamento.'
    ]
  },
  {
    titulo: '9. Propriedade intelectual',
    paragrafos: [
      'O nome, a identidade visual, os códigos e demais elementos próprios do QuitAÍ são protegidos pela legislação aplicável, ressalvados componentes de terceiros e respectivas licenças.',
      'O usuário conserva os direitos que possuir sobre os dados e conteúdos que inserir no sistema e concede apenas as permissões necessárias à execução legítima do serviço, nos limites legais e contratuais.'
    ]
  },
  {
    titulo: '10. Limites legais de responsabilidade',
    paragrafos: [
      'O QuitAÍ não substitui orientação contábil, jurídica ou financeira profissional. Eventuais limitações de responsabilidade deverão respeitar os direitos irrenunciáveis previstos na legislação brasileira, inclusive o Código de Defesa do Consumidor quando aplicável.',
      'Nenhuma disposição destes Termos exclui responsabilidades que não possam ser afastadas por lei.'
    ]
  },
  {
    titulo: '11. Alterações destes Termos',
    paragrafos: [
      'Estes Termos poderão ser atualizados para refletir mudanças legais, operacionais ou de funcionalidades. Alterações relevantes deverão ser comunicadas de modo adequado, com identificação da versão e da data de vigência.',
      'Quando necessário, será solicitada nova manifestação do usuário antes da continuidade do uso.'
    ]
  },
  {
    titulo: '12. Legislação aplicável e contato',
    paragrafos: [
      'Estes Termos serão interpretados conforme a legislação brasileira, sem prejuízo de normas imperativas estrangeiras eventualmente aplicáveis e das regras legais de competência e proteção do consumidor.',
      'Canal oficial para dúvidas, suporte e solicitações: marcosjosesouzadonascimento@gmail.com. Desenvolvedor e contato do serviço: Marcos José Souza do Nascimento. A identificação jurídica do prestador e as condições comerciais aplicáveis devem ser confirmadas antes da disponibilização pública.'
    ]
  }
]

export default function TermosUso({ onVoltar }) {
  return (
    <section className="admin-placeholder" style={{ maxWidth: 980, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <span className="admin-eyebrow">QuitAÍ • DOCUMENTOS LEGAIS</span>
        {typeof onVoltar === 'function' && <button type="button" onClick={onVoltar} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#334155', borderRadius: 9, padding: '10px 15px', fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>}
      </div>
      <h1 style={{ color: '#1e293b', marginBottom: 8 }}>Termos de Uso</h1>
      <p style={{ color: '#64748b', lineHeight: 1.7 }}>Regras de utilização, responsabilidades e condições de acesso à plataforma QuitAÍ. Revisado em 31/10/2026.</p>
      <div role="note" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 18px', margin: '22px 0', lineHeight: 1.65 }}>
        <strong>Minuta em revisão — não publicar ainda.</strong> O contato oficial já está informado. Ainda é necessário validar a identificação jurídica do prestador, as práticas operacionais e o conteúdo com orientação jurídica antes da disponibilização pública.
      </div>
      <div style={{ background: '#fff', border: '1px solid #dbe3ed', borderRadius: 16, padding: 'clamp(20px, 4vw, 36px)', boxShadow: '0 4px 18px rgba(15,23,42,.04)' }}>
        {secoes.map((secao, index) => (
          <article key={secao.titulo} style={{ paddingBottom: index === secoes.length - 1 ? 0 : 22, marginBottom: index === secoes.length - 1 ? 0 : 22, borderBottom: index === secoes.length - 1 ? 'none' : '1px solid #e8eef5' }}>
            <h2 style={{ color: '#1e293b', fontSize: 18, margin: '0 0 12px' }}>{secao.titulo}</h2>
            {secao.paragrafos.map((paragrafo, i) => <p key={i} style={{ color: '#475569', fontSize: 14, lineHeight: 1.85, margin: '0 0 10px' }}>{paragrafo}</p>)}
          </article>
        ))}
      </div>
      <p style={{ color: '#64748b', fontSize: 12, marginTop: 18 }}>Referências normativas: Lei nº 13.709/2018 (LGPD), Lei nº 12.965/2014 (Marco Civil da Internet), Lei nº 8.078/1990 (CDC, quando aplicável) e GDPR/RGPD (quando aplicável). A referência a essas normas não substitui a avaliação jurídica do caso concreto.</p>
    </section>
  )
}
