import React from 'react'

// Documento informativo sujeito à validação jurídica e operacional antes da publicação pública.
const secoes = [
  {
    titulo: '1. Identificação e alcance',
    paragrafos: [
      'Esta Política descreve o tratamento de dados pessoais relacionado ao QuitAÍ, plataforma de gestão de revendedoras, clientes, produtos, vendas, parcelas e pagamentos. Aplica-se aos tratamentos realizados no contexto do serviço, observada a responsabilidade de cada agente.',
      'Contato de referência do QuitAÍ: Marcos José Souza do Nascimento. Para questões relacionadas à privacidade, utilize marcosjosesouzadonascimento@gmail.com. A identificação formal do agente de tratamento, inclusive eventual razão social e dados cadastrais aplicáveis, deverá corresponder à estrutura jurídica efetivamente adotada.',
      'Esta política apresenta informações gerais sobre a plataforma. A versão destinada à publicação deverá ser validada à luz dos fluxos reais de dados, contratos e infraestrutura utilizados.'
    ]
  },
  {
    titulo: '2. Legislação aplicável',
    paragrafos: [
      'O tratamento de dados no Brasil observa a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD), a Lei nº 12.965/2014 (Marco Civil da Internet) e sua regulamentação, além das normas aplicáveis da Autoridade Nacional de Proteção de Dados (ANPD). O Código de Defesa do Consumidor poderá incidir conforme a relação jurídica estabelecida.',
      'Quando o tratamento estiver sujeito a legislação estrangeira, como o Regulamento Geral de Proteção de Dados da União Europeia (GDPR/RGPD, Regulamento UE 2016/679), as exigências pertinentes serão avaliadas conforme seu âmbito territorial e material. O simples acesso ao serviço a partir do exterior não significa, por si só, aplicação automática de todas as leis estrangeiras.'
    ]
  },
  {
    titulo: '3. Categorias e fontes de dados',
    itens: [
      'Dados de contas: nome, e-mail, identificadores internos, perfil de acesso, situação da conta e foto de perfil, quando utilizada.',
      'Dados cadastrados pelas revendedoras: informações de identificação e contato de clientes, conforme os campos efetivamente disponíveis no sistema.',
      'Dados de operações comerciais: produtos, vendas, itens, parcelas, datas de vencimento, valores e registros de pagamentos.',
      'Dados necessários à autenticação e administração da segurança de acesso, incluindo credenciais armazenadas em formato protegido.',
      'Dados técnicos ou registros de utilização apenas na medida em que sejam efetivamente coletados; sua natureza e finalidade deverão ser confirmadas antes da publicação.'
    ],
    paragrafos: [
      'As informações podem ser fornecidas pelo próprio usuário ou inseridas por uma revendedora no exercício de sua atividade. A plataforma deve limitar a coleta ao necessário para finalidades determinadas e legítimas.'
    ]
  },
  {
    titulo: '4. Finalidades e bases legais',
    paragrafos: [
      'Os dados podem ser utilizados para administrar contas, autenticar usuários, viabilizar cadastros e operações comerciais, exibir relatórios, prestar suporte, manter a segurança do serviço e cumprir obrigações legais aplicáveis.',
      'Cada atividade de tratamento deve ter uma base legal adequada, nos termos dos artigos 7º e, quando pertinente, 11 da LGPD. Conforme a situação concreta, podem ser relevantes a execução de contrato ou procedimentos preliminares, o cumprimento de obrigação legal ou regulatória, o legítimo interesse após avaliação de seus requisitos e, quando exigido, o consentimento válido. Não se presume que uma mesma base legal sirva para todas as finalidades.',
      'Se houver tratamento sujeito ao GDPR, as bases jurídicas e os deveres de informação correspondentes também deverão ser avaliados. A matriz de finalidades, categorias de dados e bases legais deverá ser documentada antes da publicação definitiva.'
    ]
  },
  {
    titulo: '5. Responsabilidades do QuitAÍ e das revendedoras',
    paragrafos: [
      'O papel de controlador ou operador é definido por quem toma decisões sobre as finalidades e os meios essenciais de cada tratamento, e não apenas pelo nome atribuído em contrato.',
      'Em relação aos dados de clientes cadastrados pelas revendedoras, a definição das responsabilidades entre a revendedora e a operação do QuitAÍ deverá ser formalizada conforme a utilização real do serviço. Em relação aos dados das contas e à administração da plataforma, o papel do responsável pelo QuitAÍ também deverá ser documentado.',
      'Solicitações relativas a dados inseridos por uma revendedora poderão exigir atuação coordenada entre os responsáveis, sem afastar direitos dos titulares.'
    ]
  },
  {
    titulo: '6. Compartilhamento e fornecedores',
    paragrafos: [
      'Dados pessoais somente devem ser compartilhados quando houver finalidade legítima, necessidade e fundamento jurídico. Prestadores de hospedagem, armazenamento, infraestrutura, suporte ou serviços técnicos podem participar do tratamento, se efetivamente contratados.',
      'Antes da publicação, deverão ser identificadas as categorias reais de destinatários, suas funções e as medidas contratuais e técnicas aplicáveis. Esta minuta não afirma que existam integrações ou compartilhamentos que ainda não tenham sido confirmados.'
    ]
  },
  {
    titulo: '7. Transferências internacionais',
    paragrafos: [
      'Caso dados pessoais sejam transferidos para outros países, o responsável avaliará os requisitos dos artigos 33 a 36 da LGPD e da Resolução CD/ANPD nº 19/2024, inclusive a necessidade de mecanismo válido de transferência.',
      'A existência de transferências internacionais depende da localização e das condições dos serviços efetivamente utilizados. A operação deverá verificar fornecedores, países envolvidos e mecanismos jurídicos aplicáveis antes de informar uma situação definitiva.'
    ]
  },
  {
    titulo: '8. Conservação e eliminação',
    paragrafos: [
      'Os dados devem ser conservados apenas pelo tempo necessário às finalidades informadas, observadas obrigações legais, regulatórias, contratuais e hipóteses legais de conservação. Encerrada a finalidade e ausente fundamento para retenção, devem ser adotadas as providências de eliminação ou anonimização cabíveis.',
      'Os prazos específicos por categoria de dado, a política de backups e os procedimentos de exclusão ainda precisam ser definidos e documentados. A exclusão de uma conta não significa necessariamente a eliminação imediata de todos os registros quando houver obrigação legítima de conservação.'
    ]
  },
  {
    titulo: '9. Segurança da informação e incidentes',
    paragrafos: [
      'O QuitAÍ deve adotar medidas técnicas e administrativas proporcionais aos riscos, incluindo gestão de permissões, proteção de credenciais, controles de acesso e procedimentos de resposta a incidentes, conforme efetivamente implementados e testados.',
      'Incidentes confirmados que possam acarretar risco ou dano relevante aos titulares devem ser avaliados e, quando exigido, comunicados à ANPD e aos titulares nos termos da Resolução CD/ANPD nº 15/2024. O prazo geral previsto na regulamentação é de três dias úteis, ressalvadas regras e exceções aplicáveis, inclusive disposições específicas para agentes de pequeno porte.',
      'A descrição detalhada das medidas existentes, da gestão de backups e dos canais de resposta a incidentes depende de validação técnica. Nenhum sistema pode prometer segurança absoluta.'
    ]
  },
  {
    titulo: '10. Direitos dos titulares',
    paragrafos: [
      'Conforme o artigo 18 da LGPD e demais disposições aplicáveis, o titular pode exercer direitos como confirmação de tratamento, acesso, correção de dados incompletos ou desatualizados, anonimização, bloqueio ou eliminação quando cabíveis, portabilidade nos termos da regulamentação, informações sobre compartilhamento e revisão de decisões automatizadas nas hipóteses legais.',
      'Quando o tratamento depender de consentimento, o titular poderá revogá-lo nas condições legais. O exercício de direitos pode exigir confirmação de identidade e estará sujeito às exceções legais, inclusive conservação obrigatória de determinados registros.',
      'Solicitações de titulares podem ser encaminhadas para marcosjosesouzadonascimento@gmail.com, com descrição do pedido. Para proteger os dados pessoais, poderá ser necessária a verificação proporcional da identidade do solicitante. As respostas observarão os prazos e condições previstos na legislação aplicável. O titular também pode procurar a ANPD pelos canais oficiais.'
    ]
  },
  {
    titulo: '11. Cookies, tecnologias similares e menores de idade',
    paragrafos: [
      'A utilização de cookies, armazenamento local e outras tecnologias deverá ser descrita de acordo com o comportamento real do site e da aplicação. Identificadores necessários à autenticação não devem ser confundidos com ferramentas de publicidade ou análise que não estejam implementadas.',
      'A plataforma não é projetada especificamente para crianças. Caso haja tratamento de dados pessoais de crianças ou adolescentes, deverão ser observados os requisitos da LGPD e demais normas brasileiras aplicáveis, inclusive a avaliação do melhor interesse, quando pertinente.'
    ]
  },
  {
    titulo: '12. Alterações e contato',
    paragrafos: [
      'Esta política poderá ser atualizada em razão de mudanças nas operações de tratamento, nos fornecedores ou na legislação. Alterações relevantes deverão ser comunicadas de maneira apropriada, e a versão vigente deverá ser identificável.',
      'Contato para privacidade: marcosjosesouzadonascimento@gmail.com. Revisão do texto: 31 de outubro de 2026. A data de entrada em vigor da versão pública será definida quando o documento for aprovado e disponibilizado.',
      'Referências oficiais: LGPD (Lei nº 13.709/2018); Marco Civil da Internet (Lei nº 12.965/2014); regulamentações da ANPD, especialmente Resoluções CD/ANPD nº 2/2022, 15/2024, 18/2024 e 19/2024; e GDPR/RGPD (Regulamento UE 2016/679), quando aplicável.'
    ]
  }
]

export default function PoliticaPrivacidade({ onVoltar }) {
  return (
    <section className="admin-placeholder" style={{ maxWidth: 920, color: '#1e293b' }}>
      <span className="admin-eyebrow">PRIVACIDADE E PROTEÇÃO DE DADOS</span>
      <h1 style={{ marginBottom: 8 }}>Política de Privacidade</h1>
      <p style={{ color: '#64748b', lineHeight: 1.7 }}>QuitAÍ | Plataforma de gestão de vendas</p>
      <div role="status" style={{ padding: '14px 17px', borderRadius: 11, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', margin: '22px 0', lineHeight: 1.6 }}>
        <strong>Documento em revisão.</strong> O contato oficial foi informado. Antes da publicação pública, é necessário confirmar as práticas reais de armazenamento, compartilhamento, retenção e atendimento a solicitações.
      </div>
      <div style={{ background: '#fff', border: '1px solid #dbe3ed', borderRadius: 14, padding: 'clamp(20px, 4vw, 36px)', boxShadow: '0 3px 14px rgba(15,23,42,.035)' }}>
        {secoes.map((secao, indice) => (
          <section key={secao.titulo} style={{ paddingBottom: indice === secoes.length - 1 ? 0 : 23, marginBottom: indice === secoes.length - 1 ? 0 : 23, borderBottom: indice === secoes.length - 1 ? 'none' : '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: 18, margin: '0 0 13px' }}>{secao.titulo}</h2>
            {secao.paragrafos?.map((paragrafo, i) => <p key={i} style={{ color: '#475569', lineHeight: 1.8, margin: '0 0 12px' }}>{paragrafo}</p>)}
            {secao.itens && <ul style={{ paddingLeft: 22, margin: 0, color: '#475569', lineHeight: 1.85 }}>{secao.itens.map((item, i) => <li key={i} style={{ marginBottom: 8 }}>{item}</li>)}</ul>}
          </section>
        ))}
      </div>
      {onVoltar && <button type="button" className="admin-primary-button" onClick={onVoltar} style={{ marginTop: 22 }}>Voltar para Configurações</button>}
    </section>
  )
}
