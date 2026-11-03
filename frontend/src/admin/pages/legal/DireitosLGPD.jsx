import { useState } from 'react'

const azul = '#2563eb'
const emailPrivacidade = 'marcosjosesouzadonascimento@gmail.com'
const direitos = [
  ['Confirmação e acesso', 'Solicitar confirmação da existência de tratamento e acesso aos seus dados pessoais.'],
  ['Correção', 'Solicitar a correção de dados incompletos, inexatos ou desatualizados.'],
  ['Anonimização, bloqueio ou eliminação', 'Quando cabível, solicitar medidas sobre dados desnecessários, excessivos ou tratados em desconformidade com a LGPD.'],
  ['Portabilidade', 'Solicitar a portabilidade dos dados, observadas a regulamentação da autoridade competente e a proteção de segredos comercial e industrial.'],
  ['Informações sobre compartilhamento', 'Obter informações sobre entidades públicas e privadas com as quais os dados foram compartilhados, nos termos da lei.'],
  ['Consentimento', 'Quando o tratamento depender de consentimento, obter informações sobre a possibilidade de não consentir, suas consequências e a revogação do consentimento.'],
  ['Eliminação de dados tratados com consentimento', 'Solicitar a eliminação dos dados tratados com base no consentimento, ressalvadas as hipóteses legais de conservação.'],
  ['Decisões automatizadas', 'Solicitar revisão de decisões tomadas unicamente com base em tratamento automatizado que afetem seus interesses, quando aplicável.'],
  ['Oposição e petição', 'Opor-se a tratamentos em desconformidade com a lei e peticionar à ANPD nos termos da legislação.'],
]

export default function DireitosLGPD({ onVoltar }) {
  const [aberto, setAberto] = useState(null)
  return (
    <section className="admin-placeholder" style={{ maxWidth: 980, color: '#1e293b' }}>
      <span className="admin-eyebrow">PRIVACIDADE E PROTEÇÃO DE DADOS</span>
      <h1>Direitos dos titulares de dados</h1>
      <p style={{ color: '#64748b', lineHeight: 1.7 }}>Informações sobre os direitos previstos na Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018) e sobre como exercê-los no contexto do QuitAÍ.</p>
      <div style={{ padding: 18, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, margin: '22px 0', lineHeight: 1.65 }}>
        <strong style={{ color: '#1d4ed8' }}>Informação importante</strong>
        <p style={{ margin: '8px 0 0' }}>Este conteúdo é informativo e deve ser validado conforme a operação real da plataforma. Alguns direitos dependem da base legal, da finalidade do tratamento e das exceções previstas em lei.</p>
      </div>
      <h2 style={{ fontSize: 20 }}>Quais são os seus direitos?</h2>
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {direitos.map(([titulo, descricao], indice) => (
          <div key={titulo} style={{ background: '#fff', border: '1px solid #dbe3ed', borderRadius: 12, overflow: 'hidden' }}>
            <button type="button" aria-expanded={aberto === indice} onClick={() => setAberto(aberto === indice ? null : indice)} style={{ width: '100%', border: 0, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: 'transparent', color: '#1e293b', fontWeight: 650, fontSize: 15, textAlign: 'left', cursor: 'pointer' }}>
              <span>{titulo}</span><span style={{ color: azul, fontSize: 20 }}>{aberto === indice ? '−' : '+'}</span>
            </button>
            {aberto === indice && <p style={{ margin: 0, padding: '0 18px 18px', color: '#64748b', lineHeight: 1.7 }}>{descricao}</p>}
          </div>
        ))}
      </div>
      <div style={{ background: '#fff', border: '1px solid #dbe3ed', borderRadius: 12, padding: 22, marginTop: 24 }}>
        <h2 style={{ fontSize: 19, marginTop: 0 }}>Como solicitar atendimento</h2>
        <p style={{ lineHeight: 1.7, color: '#475569' }}>O titular poderá solicitar esclarecimentos ou o exercício de seus direitos ao responsável pelo tratamento de seus dados. No QuitAÍ, é necessário distinguir os dados da conta da revendedora dos dados dos clientes registrados por ela, pois as responsabilidades podem variar conforme a finalidade do tratamento.</p>
        <p style={{ lineHeight: 1.7, color: '#475569' }}><strong>Canal de privacidade:</strong> <a href={`mailto:${emailPrivacidade}`} style={{ color: azul, overflowWrap: 'anywhere' }}>{emailPrivacidade}</a>. Informe no contato qual direito deseja exercer e os dados necessários para localizar seu cadastro, sem enviar senhas ou documentos sensíveis no primeiro e-mail.</p>
        <p style={{ lineHeight: 1.7, color: '#475569' }}>Para proteger os dados, poderá ser necessária a verificação proporcional da identidade do solicitante. Algumas solicitações poderão ser atendidas parcialmente ou recusadas quando houver fundamento legal, com a devida justificativa. O atendimento observará os prazos e procedimentos legais aplicáveis.</p>
      </div>
      <div style={{ background: '#fff', border: '1px solid #dbe3ed', borderRadius: 12, padding: 22, marginTop: 16 }}>
        <h2 style={{ fontSize: 19, marginTop: 0 }}>Legislação aplicável</h2>
        <p style={{ lineHeight: 1.7, color: '#475569' }}>No Brasil, os direitos estão previstos principalmente nos artigos 18 a 20 da LGPD. Para operações sujeitas a leis estrangeiras, como o Regulamento Geral sobre a Proteção de Dados (GDPR) da União Europeia, poderão existir direitos e procedimentos adicionais. A aplicação de normas estrangeiras depende do contexto concreto.</p>
        <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" target="_blank" rel="noopener noreferrer" style={{ color: azul, fontWeight: 600 }}>Consultar a LGPD no Portal do Planalto ↗</a>
      </div>
      {typeof onVoltar === 'function' && <button type="button" className="admin-primary-button" style={{ marginTop: 22 }} onClick={onVoltar}>Voltar às configurações</button>}
    </section>
  )
}
