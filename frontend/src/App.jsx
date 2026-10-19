import { useEffect, useState } from 'react'
import './App.css'
import Login from './Login'

// Centraliza o envio do token JWT nas requisições à API.
// Preserva os demais cabeçalhos, como Content-Type, definidos em cada chamada.
async function fetchAutenticado(url, options = {}) {
  const token =
    localStorage.getItem('quitai_token') ||
    sessionStorage.getItem('quitai_token')

  const headers = new Headers(options.headers || {})

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

function App() {
  const [autenticado, setAutenticado] = useState(() => {
    return Boolean(
      localStorage.getItem('quitai_token') ||
      sessionStorage.getItem('quitai_token')
    )
  })
  const [validandoSessao, setValidandoSessao] = useState(() => {
    return Boolean(
      localStorage.getItem('quitai_token') ||
      sessionStorage.getItem('quitai_token')
    )
  })
  const [tela, setTela] = useState('inicio')
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false)
  const [notificacoesLidas, setNotificacoesLidas] = useState(() => {
    try { return JSON.parse(localStorage.getItem('quitai_notificacoes_lidas') || '[]') } catch { return [] }
  })
  const [subTelaMais, setSubTelaMais] = useState('menu')
  const [confirmarSaida, setConfirmarSaida] = useState(() => {
    return localStorage.getItem('quitai_confirmar_saida') !== 'false'
  })
  const [mostrarModalSaida, setMostrarModalSaida] = useState(false)
  const [temaAtual, setTemaAtual] = useState(() => {
    const salvo = localStorage.getItem('quitai_tema') || 'rosa'
    return ['claro', 'rosa', 'escuro', 'automatico'].includes(salvo) ? salvo : 'rosa'
  })
  const [preferenciaEscuraSistema, setPreferenciaEscuraSistema] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const atualizar = (evento) => setPreferenciaEscuraSistema(evento.matches)
    setPreferenciaEscuraSistema(consulta.matches)
    consulta.addEventListener?.('change', atualizar)
    return () => consulta.removeEventListener?.('change', atualizar)
  }, [])
  const temaEfetivo = temaAtual === 'automatico'
    ? (preferenciaEscuraSistema ? 'escuro' : 'claro')
    : temaAtual

  const usuarioSalvo = (() => {
    try {
      const salvo = localStorage.getItem('quitai_usuario') || sessionStorage.getItem('quitai_usuario')
      return salvo ? JSON.parse(salvo) : {}
    } catch {
      return {}
    }
  })()

  // =========================================================
  // PRODUTOS
  // =========================================================

  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [produtoEditandoId, setProdutoEditandoId] = useState(null)
  const [produtoParaExcluir, setProdutoParaExcluir] = useState(null)
  const [excluindoProduto, setExcluindoProduto] = useState(false)
  const [erroExclusaoProduto, setErroExclusaoProduto] = useState('')

  const [produtos, setProdutos] = useState([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(false)
  const [erroProdutos, setErroProdutos] = useState('')

  const [formularioProduto, setFormularioProduto] = useState({
    nome: '',
    codigo: '',
    categoria: '',
    preco_custo: '',
    preco_venda: '',
    estoque: '',
  })

  const [salvandoProduto, setSalvandoProduto] = useState(false)
  const [erroFormularioProduto, setErroFormularioProduto] = useState('')

  // =========================================================
  // CLIENTES
  // =========================================================

  const [clientes, setClientes] = useState([])
  const [carregandoClientes, setCarregandoClientes] = useState(false)
  const [erroClientes, setErroClientes] = useState('')

  const [mostrarFormularioCliente, setMostrarFormularioCliente] =
    useState(false)

  const [clienteEditandoId, setClienteEditandoId] = useState(null)
  const [clienteExcluindo, setClienteExcluindo] = useState(null)
  const [excluindoCliente, setExcluindoCliente] = useState(false)
  const [erroExclusaoCliente, setErroExclusaoCliente] = useState('')

  const [formularioCliente, setFormularioCliente] = useState({
    nome: '',
    telefone: '',
    observacoes: '',
  })

  const [salvandoCliente, setSalvandoCliente] = useState(false)
  const [erroFormularioCliente, setErroFormularioCliente] = useState('')

  // =========================================================
  // VENDAS
  // =========================================================

  const [vendas, setVendas] = useState([])
  const [carregandoVendas, setCarregandoVendas] = useState(false)
  const [erroVendas, setErroVendas] = useState('')

  const [abaVendas, setAbaVendas] = useState('abertas')

  // =========================================================
  // NOVA VENDA
  // =========================================================

  const [mostrarFormularioVenda, setMostrarFormularioVenda] =
    useState(false)

  const [formularioVenda, setFormularioVenda] = useState({
    cliente_id: '',
    data_compra: new Date().toISOString().substring(0, 10),
    data_vencimento: '',
    total_parcelas: '3',
  })

  const [itemVenda, setItemVenda] = useState({
    produto_id: '',
    quantidade: '1',
  })

  const [itensNovaVenda, setItensNovaVenda] = useState([])

  const [salvandoVenda, setSalvandoVenda] = useState(false)
  const [erroFormularioVenda, setErroFormularioVenda] = useState('')

  // =========================================================
  // DETALHES DA VENDA
  // =========================================================

  const [vendaSelecionada, setVendaSelecionada] = useState(null)
  const [carregandoDetalhesVenda, setCarregandoDetalhesVenda] =
    useState(false)
  const [erroDetalhesVenda, setErroDetalhesVenda] = useState('')
  const [vendaParaExcluir, setVendaParaExcluir] = useState(null)
  const [excluindoVenda, setExcluindoVenda] = useState(false)
  const [erroExclusaoVenda, setErroExclusaoVenda] = useState('')

  // =========================================================
  // PAGAMENTOS
  // =========================================================

  const [mostrarFormularioPagamento, setMostrarFormularioPagamento] =
    useState(false)

  const [formularioPagamento, setFormularioPagamento] = useState({
    parcela_id: '',
    valor: '',
    data_pagamento: new Date().toISOString().substring(0, 10),
    forma_pagamento: 'PIX',
  })

  const [pagamentosVenda, setPagamentosVenda] = useState([])

  // Total real dos saldos das parcelas ainda abertas.
  const [totalBoletosEmAberto, setTotalBoletosEmAberto] = useState(0)

  const [salvandoPagamento, setSalvandoPagamento] = useState(false)
  const [erroPagamento, setErroPagamento] = useState('')

  // =========================================================
  // VALIDAR SESSÃO COM O BACKEND
  // =========================================================

  useEffect(() => {
    const token =
      localStorage.getItem('quitai_token') ||
      sessionStorage.getItem('quitai_token')

    if (!token) {
      setAutenticado(false)
      setValidandoSessao(false)
      return
    }

    let ativo = true

    async function validarSessao() {
      try {
        const resposta = await fetchAutenticado(
          'http://localhost:8082/auth/me',
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )

        if (resposta.status === 401 || resposta.status === 403) {
          localStorage.removeItem('quitai_token')
          localStorage.removeItem('quitai_usuario')
          sessionStorage.removeItem('quitai_token')
          sessionStorage.removeItem('quitai_usuario')

          if (ativo) {
            setAutenticado(false)
          }

          return
        }

        if (!resposta.ok) {
          throw new Error('Não foi possível validar a sessão no momento.')
        }

        if (ativo) {
          setAutenticado(true)
        }
      } catch (error) {
        // Uma falha de conexão não apaga o token salvo.
        console.error('Erro ao validar sessão:', error)
      } finally {
        if (ativo) {
          setValidandoSessao(false)
        }
      }
    }

    validarSessao()

    return () => {
      ativo = false
    }
  }, [])

  function sairDaConta() {
    if (confirmarSaida) {
      setMostrarModalSaida(true)
      return
    }

    confirmarSaidaDaConta()
  }

  function confirmarSaidaDaConta() {
    localStorage.removeItem('quitai_token')
    localStorage.removeItem('quitai_usuario')
    sessionStorage.removeItem('quitai_token')
    sessionStorage.removeItem('quitai_usuario')
    setMostrarModalSaida(false)
    setAutenticado(false)
    setTela('inicio')
  }

  // =========================================================
  // CARREGAR DADOS CONFORME A TELA
  // =========================================================

  useEffect(() => {
    if (!autenticado || validandoSessao) {
      return
    }

    if (tela === 'inicio' || tela === 'vendas') {
      buscarVendas()
    }

    if (tela === 'produtos') {
      buscarProdutos()
    }

    if (tela === 'clientes') {
      buscarClientes()
    }
  }, [tela, autenticado, validandoSessao])

  // =========================================================
  // PRODUTOS - BUSCAR
  // =========================================================

  async function buscarProdutos() {
    try {
      setCarregandoProdutos(true)
      setErroProdutos('')

      const resposta = await fetchAutenticado(
        'http://localhost:8082/produtos/listar'
      )

      if (!resposta.ok) {
        throw new Error('Erro ao buscar produtos')
      }

      const dados = await resposta.json()

      console.log('Produtos recebidos:', dados)

      setProdutos(dados || [])
    } catch (error) {
      console.error('Erro ao buscar produtos:', error)

      setErroProdutos(
        'Não foi possível carregar os produtos.'
      )
    } finally {
      setCarregandoProdutos(false)
    }
  }

  // =========================================================
  // VENDAS - BUSCAR
  // =========================================================

  async function buscarVendas() {
    try {
      setCarregandoVendas(true)
      setErroVendas('')

      const resposta = await fetchAutenticado(
        'http://localhost:8082/vendas/listar'
      )

      if (!resposta.ok) {
        throw new Error('Erro ao buscar vendas')
      }

      const dados = await resposta.json()

      console.log('Vendas recebidas:', dados)

      const vendasRecebidas = dados || []
      setVendas(vendasRecebidas)

      // O cartão "Boletos em aberto" usa as parcelas reais do banco.
      // Não usa o saldo total da venda, evitando duplicar "A receber".
      try {
        const detalhes = await Promise.all(
          vendasRecebidas.map(async (venda) => {
            try {
              const respostaDetalhes = await fetchAutenticado(
                `http://localhost:8082/vendas/${venda.id}`
              )

              if (!respostaDetalhes.ok) {
                return null
              }

              return await respostaDetalhes.json()
            } catch {
              return null
            }
          })
        )

        const totalParcelasAbertas = detalhes.reduce(
          (total, vendaDetalhada) => {
            if (!vendaDetalhada) {
              return total
            }

            const parcelas = vendaDetalhada.parcelas || []

            return (
              total +
              parcelas.reduce(
                (subtotal, parcela) => {
                  const valor = Number(parcela.valor || 0)
                  const valorPago = Number(parcela.valor_pago || 0)

                  return (
                    subtotal +
                    Math.max(valor - valorPago, 0)
                  )
                },
                0
              )
            )
          },
          0
        )

        setTotalBoletosEmAberto(totalParcelasAbertas)
      } catch (error) {
        console.error(
          'Erro ao calcular boletos em aberto:',
          error
        )

        setTotalBoletosEmAberto(0)
      }
    } catch (error) {
      console.error(
        'Erro ao buscar vendas:',
        error
      )

      setErroVendas(
        'Não foi possível carregar as vendas.'
      )
    } finally {
      setCarregandoVendas(false)
    }
  }

  // =========================================================
  // NOVA VENDA - ABRIR
  // =========================================================

  async function abrirNovaVenda() {
    setErroFormularioVenda('')

    setFormularioVenda({
      cliente_id: '',
      data_compra: new Date()
        .toISOString()
        .substring(0, 10),
      data_vencimento: '',
      total_parcelas: '3',
    })

    setItemVenda({
      produto_id: '',
      quantidade: '1',
    })

    setItensNovaVenda([])

    // Carrega clientes e produtos antes de abrir
    await Promise.all([
      buscarClientes(),
      buscarProdutos(),
    ])

    setMostrarFormularioVenda(true)
  }

  // =========================================================
  // NOVA VENDA - FECHAR
  // =========================================================

  function fecharFormularioVenda() {
    if (salvandoVenda) {
      return
    }

    setMostrarFormularioVenda(false)
    setErroFormularioVenda('')

    setFormularioVenda({
      cliente_id: '',
      data_compra: new Date()
        .toISOString()
        .substring(0, 10),
      data_vencimento: '',
      total_parcelas: '3',
    })

    setItemVenda({
      produto_id: '',
      quantidade: '1',
    })

    setItensNovaVenda([])
  }

  // =========================================================
  // NOVA VENDA - FORMULÁRIO
  // =========================================================

  function alterarFormularioVenda(event) {
    const { name, value } = event.target

    setFormularioVenda((anterior) => ({
      ...anterior,
      [name]: value,
    }))
  }

  function alterarItemVenda(event) {
    const { name, value } = event.target

    setItemVenda((anterior) => ({
      ...anterior,
      [name]: value,
    }))
  }

  // =========================================================
  // NOVA VENDA - ADICIONAR ITEM
  // =========================================================

  function adicionarItemNovaVenda() {
    setErroFormularioVenda('')

    const produtoId = Number(itemVenda.produto_id)
    const quantidade = Number(itemVenda.quantidade)

    if (!produtoId) {
      setErroFormularioVenda(
        'Selecione um produto.'
      )
      return
    }

    if (!quantidade || quantidade <= 0) {
      setErroFormularioVenda(
        'Informe uma quantidade válida.'
      )
      return
    }

    const produto = produtos.find(
      (item) => Number(item.id) === produtoId
    )

    if (!produto) {
      setErroFormularioVenda(
        'Produto não encontrado.'
      )
      return
    }

    if (quantidade > Number(produto.estoque)) {
      setErroFormularioVenda(
        `Estoque insuficiente. Disponível: ${produto.estoque}.`
      )
      return
    }

    const itemExistente = itensNovaVenda.find(
      (item) =>
        Number(item.produto_id) === produtoId
    )

    if (itemExistente) {
      const novaQuantidade =
        Number(itemExistente.quantidade) +
        quantidade

      if (novaQuantidade > Number(produto.estoque)) {
        setErroFormularioVenda(
          `Estoque insuficiente. Disponível: ${produto.estoque}.`
        )
        return
      }

      setItensNovaVenda((anterior) =>
        anterior.map((item) =>
          Number(item.produto_id) === produtoId
            ? {
                ...item,
                quantidade: novaQuantidade,
                subtotal:
                  Number(produto.preco_venda) *
                  novaQuantidade,
              }
            : item
        )
      )
    } else {
      setItensNovaVenda((anterior) => [
        ...anterior,
        {
          produto_id: produtoId,
          produto_nome: produto.nome,
          quantidade,
          preco_unitario: Number(
            produto.preco_venda
          ),
          subtotal:
            Number(produto.preco_venda) *
            quantidade,
        },
      ])
    }

    setItemVenda({
      produto_id: '',
      quantidade: '1',
    })
  }

  // =========================================================
  // NOVA VENDA - REMOVER ITEM
  // =========================================================

  function removerItemNovaVenda(produtoId) {
    setItensNovaVenda((anterior) =>
      anterior.filter(
        (item) =>
          Number(item.produto_id) !==
          Number(produtoId)
      )
    )
  }

  // =========================================================
  // NOVA VENDA - TOTAL
  // =========================================================

  function calcularTotalNovaVenda() {
    return itensNovaVenda.reduce(
      (total, item) =>
        total + Number(item.subtotal || 0),
      0
    )
  }

  // =========================================================
  // NOVA VENDA - SALVAR
  // =========================================================

  async function salvarVenda(event) {
    event.preventDefault()

    setErroFormularioVenda('')

    if (!formularioVenda.cliente_id) {
      setErroFormularioVenda(
        'Selecione um cliente.'
      )
      return
    }

    if (!formularioVenda.data_compra) {
      setErroFormularioVenda(
        'Informe a data da compra.'
      )
      return
    }

    if (!formularioVenda.data_vencimento) {
      setErroFormularioVenda(
        'Informe a data do primeiro vencimento.'
      )
      return
    }

    if (
      formularioVenda.data_vencimento <
      formularioVenda.data_compra
    ) {
      setErroFormularioVenda(
        'A data de vencimento não pode ser anterior à data da compra.'
      )
      return
    }

    const totalParcelas = Number(
      formularioVenda.total_parcelas
    )

    if (![1, 2, 3].includes(totalParcelas)) {
      setErroFormularioVenda(
        'Escolha 1, 2 ou 3 parcelas.'
      )
      return
    }

    if (itensNovaVenda.length === 0) {
      setErroFormularioVenda(
        'Adicione pelo menos um produto à venda.'
      )
      return
    }

    try {
      setSalvandoVenda(true)

      // -------------------------------------------------------
      // 1. CRIAR A VENDA
      // -------------------------------------------------------

      const respostaVenda = await fetchAutenticado(
        'http://localhost:8082/vendas',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cliente_id: Number(
              formularioVenda.cliente_id
            ),
            data_compra:
              formularioVenda.data_compra,
            data_vencimento:
              formularioVenda.data_vencimento,
            total_parcelas: totalParcelas,
          }),
        }
      )

      const textoVenda =
        await respostaVenda.text()

      if (!respostaVenda.ok) {
        throw new Error(
          textoVenda ||
            'Não foi possível criar a venda.'
        )
      }

      const vendaCriada =
        JSON.parse(textoVenda)

      console.log(
        'Venda criada:',
        vendaCriada
      )

      const vendaId = Number(
        vendaCriada.id
      )

      if (!vendaId) {
        throw new Error(
          'A venda foi criada, mas o ID não foi retornado pela API.'
        )
      }

      // -------------------------------------------------------
      // 2. ADICIONAR OS PRODUTOS
      // -------------------------------------------------------

      for (const item of itensNovaVenda) {
        const respostaItem = await fetchAutenticado(
          'http://localhost:8082/vendas/itens',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              venda_id: vendaId,
              produto_id: Number(
                item.produto_id
              ),
              quantidade: Number(
                item.quantidade
              ),
            }),
          }
        )

        const textoItem =
          await respostaItem.text()

        if (!respostaItem.ok) {
          throw new Error(
            textoItem ||
              `Não foi possível adicionar o produto "${item.produto_nome}".`
          )
        }
      }

      // -------------------------------------------------------
      // 3. LIMPAR FORMULÁRIO
      // -------------------------------------------------------

      setMostrarFormularioVenda(false)

      setFormularioVenda({
        cliente_id: '',
        data_compra: new Date()
          .toISOString()
          .substring(0, 10),
        data_vencimento: '',
        total_parcelas: '3',
      })

      setItemVenda({
        produto_id: '',
        quantidade: '1',
      })

      setItensNovaVenda([])

      // -------------------------------------------------------
      // 4. ATUALIZAR LISTAS
      // -------------------------------------------------------

      await buscarVendas()
      await buscarProdutos()

      // -------------------------------------------------------
      // 5. ABRIR A VENDA CRIADA
      // -------------------------------------------------------

      const respostaDetalhes =
        await fetchAutenticado(
          `http://localhost:8082/vendas/${vendaId}`
        )

      if (respostaDetalhes.ok) {
        const detalhes =
          await respostaDetalhes.json()

        setVendaSelecionada(detalhes)
        setTela('detalhes-venda')
      } else {
        setTela('vendas')
      }
    } catch (error) {
      console.error(
        'Erro ao salvar venda:',
        error
      )

      let mensagem =
        'Não foi possível cadastrar a venda.'

      try {
        const dadosErro = JSON.parse(
          error.message
        )

        mensagem =
          dadosErro.mensagem ||
          mensagem
      } catch {
        if (error.message) {
          mensagem = error.message
        }
      }

      setErroFormularioVenda(mensagem)
    } finally {
      setSalvandoVenda(false)
    }
  }

  // =========================================================
  // VENDAS - DETALHES
  // =========================================================

  async function abrirDetalhesVenda(venda) {
    try {
      setCarregandoDetalhesVenda(true)
      setErroDetalhesVenda('')
      setVendaSelecionada(null)

      const resposta = await fetchAutenticado(
        `http://localhost:8082/vendas/${venda.id}`
      )

      if (!resposta.ok) {
        const mensagem =
          await resposta.text()

        throw new Error(
          mensagem ||
            'Erro ao buscar detalhes da venda'
        )
      }

      const dados = await resposta.json()

      console.log(
        'Detalhes da venda recebidos:',
        dados
      )

      setVendaSelecionada(dados)

      const respostaPagamentos = await fetchAutenticado(
        `http://localhost:8082/pagamentos?venda_id=${venda.id}`
      )

      if (respostaPagamentos.ok) {
        const dadosPagamentos = await respostaPagamentos.json()
        setPagamentosVenda(dadosPagamentos)
      } else {
        setPagamentosVenda([])
      }

      setTela('detalhes-venda')
    } catch (error) {
      console.error(
        'Erro ao buscar detalhes da venda:',
        error
      )

      setErroDetalhesVenda(
        'Não foi possível carregar os detalhes da venda.'
      )
    } finally {
      setCarregandoDetalhesVenda(false)
    }
  }

  // =========================================================
  // VENDAS - EXCLUIR COM CONFIRMAÇÃO
  // =========================================================

  function abrirConfirmacaoExcluirVenda() {
    if (!vendaSelecionada?.venda) return
    setErroExclusaoVenda('')
    setVendaParaExcluir(vendaSelecionada.venda)
  }

  function fecharConfirmacaoExcluirVenda() {
    if (excluindoVenda) return
    setVendaParaExcluir(null)
    setErroExclusaoVenda('')
  }

  async function confirmarExclusaoVenda() {
    if (!vendaParaExcluir) return

    try {
      setExcluindoVenda(true)
      setErroExclusaoVenda('')
      const resposta = await fetchAutenticado(`http://localhost:8082/vendas/${vendaParaExcluir.id}`, { method: 'DELETE' })
      if (!resposta.ok) {
        const mensagem = await resposta.text()
        throw new Error(mensagem || 'Não foi possível excluir esta venda.')
      }

      setVendaParaExcluir(null)
      setVendaSelecionada(null)
      setPagamentosVenda([])
      setErroDetalhesVenda('')
      setTela('vendas')
      await buscarVendas()
    } catch (error) {
      console.error('Erro ao excluir venda:', error)
      setErroExclusaoVenda(error?.message || 'Não foi possível excluir esta venda. Nenhuma alteração foi confirmada.')
    } finally {
      setExcluindoVenda(false)
    }
  }

  // =========================================================
  // PAGAMENTOS - FORMULÁRIO
  // =========================================================

  function abrirFormularioPagamento() {
    if (!vendaSelecionada?.venda) {
      return
    }

    const parcelas = vendaSelecionada.parcelas || []

    const primeiraParcelaAberta = parcelas.find(
      (parcela) =>
        Number(parcela.valor) - Number(parcela.valor_pago) > 0
    )

    setFormularioPagamento({
      parcela_id: primeiraParcelaAberta
        ? String(primeiraParcelaAberta.id)
        : '',
      valor: '',
      data_pagamento: new Date()
        .toISOString()
        .substring(0, 10),
      forma_pagamento: 'PIX',
    })

    setErroPagamento('')
    setMostrarFormularioPagamento(true)
  }

  function fecharFormularioPagamento() {
    if (salvandoPagamento) {
      return
    }

    setMostrarFormularioPagamento(false)
    setErroPagamento('')
  }

  function alterarFormularioPagamento(event) {
    const { name, value } = event.target

    setFormularioPagamento((anterior) => ({
      ...anterior,
      [name]: value,
    }))
  }

  // =========================================================
  // PAGAMENTOS - REGISTRAR
  // =========================================================

  async function registrarPagamento(event) {
    event.preventDefault()

    if (!vendaSelecionada?.venda) {
      return
    }

    if (!formularioPagamento.parcela_id) {
      setErroPagamento(
        'Selecione a parcela que receberá o pagamento.'
      )
      return
    }

    const parcelaPagamento = (
      vendaSelecionada.parcelas || []
    ).find(
      (parcela) =>
        String(parcela.id) ===
        String(formularioPagamento.parcela_id)
    )

    const saldoParcela = parcelaPagamento
      ? Math.max(
          Number(parcelaPagamento.valor || 0) -
            Number(parcelaPagamento.valor_pago || 0),
          0
        )
      : 0

    if (!parcelaPagamento || saldoParcela <= 0) {
      setErroPagamento(
        'A parcela selecionada não possui saldo em aberto.'
      )
      return
    }

    const valorPagamento = Number(
      formularioPagamento.valor
    )

    if (!valorPagamento || valorPagamento <= 0) {
      setErroPagamento(
        'Informe quanto a cliente pagou.'
      )
      return
    }

    // O pagamento é livre: pode ser maior que a parcela selecionada.
    // O único limite é o saldo TOTAL da venda.
    const saldoTotalVenda = Number(
      vendaSelecionada.venda.saldo || 0
    )

    if (saldoTotalVenda <= 0) {
      setErroPagamento(
        'Esta venda já está quitada.'
      )
      return
    }

    if (valorPagamento > saldoTotalVenda) {
      setErroPagamento(
        `O pagamento não pode ser maior que o saldo total da venda de R$ ${formatarMoeda(
          saldoTotalVenda
        )}.`
      )
      return
    }

    if (!formularioPagamento.data_pagamento) {
      setErroPagamento(
        'Informe a data do pagamento.'
      )
      return
    }

    if (!['PIX', 'ESPECIE'].includes(formularioPagamento.forma_pagamento)) {
      setErroPagamento(
        'Selecione a forma de pagamento.'
      )
      return
    }

    try {
      setSalvandoPagamento(true)
      setErroPagamento('')

      const resposta = await fetchAutenticado(
        'http://localhost:8082/pagamentos',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            venda_id:
              vendaSelecionada.venda.id,
            parcela_id: Number(formularioPagamento.parcela_id),
            valor: valorPagamento,
            data_pagamento:
              formularioPagamento.data_pagamento,
            forma_pagamento:
              formularioPagamento.forma_pagamento,
          }),
        }
      )

      const mensagem =
        await resposta.text()

      if (!resposta.ok) {
        throw new Error(
          mensagem ||
            'Não foi possível registrar o pagamento.'
        )
      }

      const resultado =
        JSON.parse(mensagem)

      console.log(
        'Pagamento registrado:',
        resultado
      )

      setMostrarFormularioPagamento(false)

      setFormularioPagamento({
        parcela_id: '',
        valor: '',
        data_pagamento: new Date()
          .toISOString()
          .substring(0, 10),
        forma_pagamento: 'PIX',
      })

      const respostaDetalhes =
        await fetchAutenticado(
          `http://localhost:8082/vendas/${vendaSelecionada.venda.id}`
        )

      if (!respostaDetalhes.ok) {
        throw new Error(
          'Pagamento registrado, mas não foi possível atualizar os detalhes.'
        )
      }

      const dadosAtualizados =
        await respostaDetalhes.json()

      setVendaSelecionada(
        dadosAtualizados
      )

      const respostaPagamentos = await fetchAutenticado(
        `http://localhost:8082/pagamentos?venda_id=${vendaSelecionada.venda.id}`
      )

      if (respostaPagamentos.ok) {
        const dadosPagamentos = await respostaPagamentos.json()
        setPagamentosVenda(dadosPagamentos)
      }

      await buscarVendas()
    } catch (error) {
      console.error(
        'Erro ao registrar pagamento:',
        error
      )

      let mensagemErro =
        'Não foi possível registrar o pagamento.'

      try {
        const dadosErro =
          JSON.parse(error.message)

        mensagemErro =
          dadosErro.mensagem ||
          mensagemErro
      } catch {
        if (error.message) {
          mensagemErro = error.message
        }
      }

      setErroPagamento(mensagemErro)
    } finally {
      setSalvandoPagamento(false)
    }
  }

  // =========================================================
  // PRODUTOS - FORMULÁRIO
  // =========================================================

  function alterarFormularioProduto(event) {
    const { name, value } = event.target

    setFormularioProduto((anterior) => ({
      ...anterior,
      [name]: value,
    }))
  }

  function limparFormularioProduto() {
    setFormularioProduto({
      nome: '',
      codigo: '',
      categoria: '',
      preco_custo: '',
      preco_venda: '',
      estoque: '',
    })

    setErroFormularioProduto('')
  }

  function abrirNovoProduto() {
    setProdutoEditandoId(null)

    limparFormularioProduto()

    setMostrarFormulario(true)
  }

  function abrirEditarProduto(produto) {
    const id = Number(produto.id)

    if (!id || id <= 0) {
      setErroProdutos(
        'Não foi possível identificar o produto.'
      )

      return
    }

    setProdutoEditandoId(id)

    setFormularioProduto({
      nome: produto.nome || '',
      codigo: produto.codigo || '',
      categoria: produto.categoria || '',
      preco_custo:
        produto.preco_custo ?? '',
      preco_venda:
        produto.preco_venda ?? '',
      estoque:
        produto.estoque ?? '',
    })

    setErroFormularioProduto('')
    setMostrarFormulario(true)
  }

  function fecharFormularioProduto() {
    setMostrarFormulario(false)
    setProdutoEditandoId(null)

    limparFormularioProduto()
  }

  // =========================================================
  // PRODUTOS - CADASTRAR / EDITAR
  // =========================================================

  async function salvarProduto(event) {
    event.preventDefault()

    try {
      setSalvandoProduto(true)
      setErroFormularioProduto('')

      const dados = {
        nome: formularioProduto.nome,
        codigo: formularioProduto.codigo,
        categoria:
          formularioProduto.categoria,
        preco_custo: Number(
          formularioProduto.preco_custo
        ),
        preco_venda: Number(
          formularioProduto.preco_venda
        ),
        estoque: Number(
          formularioProduto.estoque
        ),
      }

      const editando =
        produtoEditandoId !== null

      const url = editando
        ? `http://localhost:8082/produtos/${produtoEditandoId}`
        : 'http://localhost:8082/produtos'

      const metodo = editando
        ? 'PUT'
        : 'POST'

      const resposta = await fetchAutenticado(
        url,
        {
          method: metodo,
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify(dados),
        }
      )

      if (!resposta.ok) {
        const mensagem =
          await resposta.text()

        throw new Error(
          mensagem ||
            (editando
              ? 'Erro ao editar produto'
              : 'Erro ao cadastrar produto')
        )
      }

      const produtoSalvo =
        await resposta.json()

      console.log(
        'Produto salvo:',
        produtoSalvo
      )

      fecharFormularioProduto()

      await buscarProdutos()
    } catch (error) {
      console.error(
        'Erro ao salvar produto:',
        error
      )

      setErroFormularioProduto(
        produtoEditandoId !== null
          ? 'Não foi possível editar o produto.'
          : 'Não foi possível cadastrar o produto.'
      )
    } finally {
      setSalvandoProduto(false)
    }
  }

  // =========================================================
  // PRODUTOS - ABRIR EXCLUSÃO
  // =========================================================

  function abrirExclusaoProduto(produto) {
    setErroExclusaoProduto('')
    setProdutoParaExcluir(produto)
  }

  function fecharExclusaoProduto() {
    if (excluindoProduto) {
      return
    }

    setProdutoParaExcluir(null)
    setErroExclusaoProduto('')
  }

  // =========================================================
  // PRODUTOS - CONFIRMAR EXCLUSÃO
  // =========================================================

  async function confirmarExclusaoProduto() {
    if (!produtoParaExcluir) {
      return
    }

    try {
      setExcluindoProduto(true)
      setErroProdutos('')

      const resposta = await fetchAutenticado(
        `http://localhost:8082/produtos/${produtoParaExcluir.id}`,
        {
          method: 'DELETE',
        }
      )

      if (!resposta.ok) {
        const mensagem =
          await resposta.text()

        throw new Error(
          mensagem ||
            'Erro ao excluir produto'
        )
      }

      console.log(
        'Produto excluído:',
        produtoParaExcluir
      )

      setProdutoParaExcluir(null)

      await buscarProdutos()
    } catch (error) {
      console.error(
        'Erro ao excluir produto:',
        error
      )

      const mensagem = error?.message || ''
      const detalhe = mensagem.toLowerCase()
      const possuiVinculo = detalhe.includes('vinculad') ||
        detalhe.includes('venda cadastrada') ||
        detalhe.includes('preservar o histórico') ||
        detalhe.includes('foreign key') ||
        detalhe.includes('constraint') ||
        detalhe.includes('23503') ||
        detalhe.includes('violates')

      const mensagemAmigavel = possuiVinculo
        ? 'Este produto está vinculado a uma ou mais vendas cadastradas. Para preservar o histórico dos produtos vendidos e dos pagamentos, a exclusão foi bloqueada. Você pode manter o cadastro e continuar consultando essas vendas.'
        : 'Não foi possível excluir este produto neste momento. Tente novamente. Se o problema continuar, entre em contato com o suporte.'

      setErroProdutos('')
      setErroExclusaoProduto(mensagemAmigavel)
    } finally {
      setExcluindoProduto(false)
    }
  }

  // =========================================================
  // CLIENTES - BUSCAR
  // =========================================================

  async function buscarClientes() {
    try {
      setCarregandoClientes(true)
      setErroClientes('')

      const resposta = await fetchAutenticado(
        'http://localhost:8082/clientes/listar'
      )

      if (!resposta.ok) {
        throw new Error(
          'Erro ao buscar clientes'
        )
      }

      const dados =
        await resposta.json()

      console.log(
        'Clientes recebidos:',
        dados
      )

      setClientes(dados || [])
    } catch (error) {
      console.error(
        'Erro ao buscar clientes:',
        error
      )

      setErroClientes(
        'Não foi possível carregar os clientes.'
      )
    } finally {
      setCarregandoClientes(false)
    }
  }

  // =========================================================
  // CLIENTES - FORMULÁRIO
  // =========================================================

  function alterarFormularioCliente(event) {
    const { name, value } = event.target

    setFormularioCliente((anterior) => ({
      ...anterior,
      [name]: value,
    }))
  }

  function limparFormularioCliente() {
    setFormularioCliente({
      nome: '',
      telefone: '',
      observacoes: '',
    })

    setErroFormularioCliente('')
  }

  function abrirNovoCliente() {
    setClienteEditandoId(null)

    limparFormularioCliente()

    setMostrarFormularioCliente(true)
  }

  function abrirEditarCliente(cliente) {
    const id = Number(cliente.id)

    if (!id || id <= 0) {
      setErroClientes(
        'Não foi possível identificar o cliente.'
      )

      return
    }

    setClienteEditandoId(id)

    setFormularioCliente({
      nome: cliente.nome || '',
      telefone:
        cliente.telefone || '',
      observacoes:
        cliente.observacoes || '',
    })

    setErroFormularioCliente('')
    setMostrarFormularioCliente(true)
  }

  function fecharFormularioCliente() {
    setMostrarFormularioCliente(false)

    setClienteEditandoId(null)

    limparFormularioCliente()
  }

  // =========================================================
  // CLIENTES - CADASTRAR / EDITAR
  // =========================================================

  async function salvarCliente(event) {
    event.preventDefault()

    try {
      setSalvandoCliente(true)
      setErroFormularioCliente('')

      const dados = {
        nome: formularioCliente.nome,
        telefone:
          formularioCliente.telefone,
        observacoes:
          formularioCliente.observacoes,
      }

      const editando =
        clienteEditandoId !== null

      const url = editando
        ? `http://localhost:8082/clientes/${clienteEditandoId}`
        : 'http://localhost:8082/clientes'

      const metodo = editando
        ? 'PUT'
        : 'POST'

      const resposta = await fetchAutenticado(
        url,
        {
          method: metodo,
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify(dados),
        }
      )

      if (!resposta.ok) {
        const mensagem =
          await resposta.text()

        throw new Error(
          mensagem ||
            (editando
              ? 'Erro ao editar cliente'
              : 'Erro ao cadastrar cliente')
        )
      }

      const clienteSalvo =
        await resposta.json()

      console.log(
        'Cliente salvo:',
        clienteSalvo
      )

      fecharFormularioCliente()

      await buscarClientes()
    } catch (error) {
      console.error(
        'Erro ao salvar cliente:',
        error
      )

      setErroFormularioCliente(
        clienteEditandoId !== null
          ? 'Não foi possível editar o cliente.'
          : 'Não foi possível cadastrar o cliente.'
      )
    } finally {
      setSalvandoCliente(false)
    }
  }

  // =========================================================
  // CLIENTES - ABRIR EXCLUSÃO
  // =========================================================

  function abrirConfirmacaoExcluirCliente(
    cliente
  ) {
    setErroExclusaoCliente('')
    setClienteExcluindo(cliente)
  }

  function fecharConfirmacaoExcluirCliente() {
    if (excluindoCliente) {
      return
    }

    setClienteExcluindo(null)
    setErroExclusaoCliente('')
  }

  // =========================================================
  // CLIENTES - EXCLUIR
  // =========================================================

  async function excluirCliente() {
    if (!clienteExcluindo) {
      return
    }

    try {
      setExcluindoCliente(true)
      setErroClientes('')

      const resposta = await fetchAutenticado(
        `http://localhost:8082/clientes/${clienteExcluindo.id}`,
        {
          method: 'DELETE',
        }
      )

      if (!resposta.ok) {
        const mensagem = await resposta.text()
        const erro = new Error(mensagem || 'Erro ao excluir cliente')
        erro.status = resposta.status
        throw erro
      }

      console.log(
        'Cliente excluído:',
        clienteExcluindo
      )

      setClienteExcluindo(null)

      await buscarClientes()
    } catch (error) {
      console.error(
        'Erro ao excluir cliente:',
        error
      )

      const mensagem = error?.message || ''
      const detalhe = mensagem.toLowerCase()
      const possuiVinculo = detalhe.includes('vinculad') ||
        detalhe.includes('venda cadastrada') ||
        detalhe.includes('preservar o histórico') ||
        detalhe.includes('foreign key') ||
        detalhe.includes('constraint') ||
        detalhe.includes('23503') ||
        detalhe.includes('violates') ||
        error?.status === 409 ||
        error?.status === 500

      const mensagemAmigavel = possuiVinculo
        ? 'Este cliente possui uma ou mais vendas cadastradas. Para preservar o histórico de compras e pagamentos, a exclusão foi bloqueada. Mantenha o cadastro para continuar consultando as vendas e os pagamentos relacionados.'
        : 'Não foi possível excluir este cliente neste momento. Tente novamente. Se o problema continuar, entre em contato com o suporte.'

      setErroClientes('')
      setErroExclusaoCliente(mensagemAmigavel)
    } finally {
      setExcluindoCliente(false)
    }
  }

  // =========================================================
  // FORMATAÇÃO
  // =========================================================

  function formatarMoeda(valor) {
    return Number(
      valor || 0
    ).toLocaleString(
      'pt-BR',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )
  }

  function formatarData(data) {
    if (!data) {
      return '-'
    }

    const valor = String(data)
      .substring(0, 10)

    const partes = valor.split('-')

    if (partes.length !== 3) {
      return data
    }

    const [ano, mes, dia] = partes

    return `${dia}/${mes}/${ano}`
  }

  function obterNotificacoes() {
    return vendas
      .filter((venda) => ['VENCIDO', 'VENCE_EM_BREVE'].includes(String(venda.status || '').toUpperCase()))
      .map((venda) => {
        const vencido = String(venda.status || '').toUpperCase() === 'VENCIDO'
        const id = `${venda.id || venda.venda_id || 'venda'}-${venda.status}-${venda.vencimento || ''}`
        return {
          id,
          titulo: vencido ? 'Pagamento em atraso' : 'Vencimento próximo',
          mensagem: `${venda.cliente_nome || venda.nome_cliente || venda.cliente || 'Cliente'} · vencimento ${formatarData(venda.vencimento)}`,
          valor: venda.saldo ?? venda.total ?? venda.valor_total,
          vencido,
        }
      })
  }

  function abrirNotificacoes() {
    setNotificacoesAbertas(true)
    const ids = obterNotificacoes().map((item) => item.id)
    setNotificacoesLidas(ids)
    localStorage.setItem('quitai_notificacoes_lidas', JSON.stringify(ids))
  }

  function obterStatusVenda(status) {
    switch (status) {
      case 'EM_ABERTO':
        return {
          texto: 'EM ABERTO',
          background: '#eaf8f0',
          color: '#29945c',
        }

      case 'VENCE_EM_BREVE':
        return {
          texto: 'VENCE EM BREVE',
          background: '#fff7e6',
          color: '#c98200',
        }

      case 'VENCIDO':
        return {
          texto: 'VENCIDO',
          background: '#fff0f0',
          color: '#d94b4b',
        }

      case 'QUITADO':
        return {
          texto: 'QUITADO',
          background: '#eaf8f0',
          color: '#29945c',
        }

      default:
        return {
          texto: 'EM ABERTO',
          background: '#eaf8f0',
          color: '#29945c',
        }
    }
  }

  // =========================================================
  // RENDER
  // =========================================================

  const vendasAbertas = vendas.filter(
    (venda) => venda.status !== 'QUITADO'
  )

  const vendasQuitadas = vendas.filter(
    (venda) => venda.status === 'QUITADO'
  )

  const vendasExibidas =
    abaVendas === 'quitadas'
      ? vendasQuitadas
      : vendasAbertas

  // =========================================================
  // RESUMO FINANCEIRO DO INÍCIO
  // =========================================================

  const totalVendido = vendas.reduce(
    (total, venda) => total + Number(venda.total || 0),
    0
  )

  const totalRecebido = vendas.reduce(
    (total, venda) => total + Number(venda.valor_pago || 0),
    0
  )

  const totalAReceber = vendas.reduce(
    (total, venda) => total + Number(venda.saldo || 0),
    0
  )

  const vendasRecentes = [...vendas]
    .sort((a, b) =>
      String(b.data_compra || '').localeCompare(
        String(a.data_compra || '')
      )
    )
    .slice(0, 3)

  const parcelaPagamentoSelecionada =
    (vendaSelecionada?.parcelas || []).find(
      (parcela) =>
        String(parcela.id) ===
        String(formularioPagamento.parcela_id)
    )

  const saldoParcelaPagamento = parcelaPagamentoSelecionada
    ? Math.max(
        Number(parcelaPagamentoSelecionada.valor || 0) -
          Number(parcelaPagamentoSelecionada.valor_pago || 0),
        0
      )
    : 0

  if (validandoSessao) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#fff7fa',
          color: '#df5f8d',
          fontFamily: 'inherit',
          fontWeight: 600,
        }}
      >
        Verificando sua sessão...
      </div>
    )
  }

  if (!autenticado) {
    return (
      <Login
        onLogin={() => setAutenticado(true)}
      />
    )
  }

  return (
    <div className={`app tema-${temaEfetivo}`} data-tema={temaAtual}>
      <style>{`
        .app.tema-rosa { background: #fff0f6; min-height: 100vh; color: #382530; }
        .app.tema-rosa .conteudo { background-color: #fff0f6 !important; }
        .app.tema-rosa .secao { border-color: #efc7d9 !important; }
        .app.tema-rosa .navegacao, .app.tema-rosa .topo { background: #fff7fb !important; }
        .app.tema-escuro { background: #17171d !important; color: #f5edf2 !important; min-height: 100vh; color-scheme: dark; }
        .app.tema-escuro .conteudo, .app.tema-escuro main { background: #17171d !important; color: #f5edf2 !important; }
        .app.tema-escuro .topo, .app.tema-escuro .navegacao { background: #202027 !important; border-color: #39333d !important; }
        .app.tema-escuro .secao, .app.tema-escuro section, .app.tema-escuro .card, .app.tema-escuro [class*='cartao'], .app.tema-escuro [class*='card'] { background-color: #24242c !important; border-color: #403641 !important; color: #f5edf2 !important; }
        .app.tema-escuro h1, .app.tema-escuro h2, .app.tema-escuro h3, .app.tema-escuro h4, .app.tema-escuro p, .app.tema-escuro label, .app.tema-escuro strong, .app.tema-escuro span, .app.tema-escuro small, .app.tema-escuro th, .app.tema-escuro td { color: #f0e8ee; }
        .app.tema-escuro input:not([type='checkbox']):not([type='radio']), .app.tema-escuro select, .app.tema-escuro textarea { background: #292831 !important; color: #fff !important; border-color: #514451 !important; }
        .app.tema-escuro input::placeholder, .app.tema-escuro textarea::placeholder { color: #b9aab7 !important; }
        .app.tema-escuro button:not(.nav-item) { border-color: #68445a; }
        .app.tema-escuro .nav-item { color: #c8bdc7 !important; }
        .app.tema-escuro .nav-item.ativo { color: #ff8db7 !important; }
        .app.tema-escuro .config-divisor { border-color: #403641 !important; }
        .app.tema-escuro .config-descricao { color: #c9bbc6 !important; }
        .app.tema-escuro .quitai-configuracoes { background: #17171d !important; }
        .app.tema-escuro table { color: #f5edf2 !important; }
        .app.tema-escuro [role='dialog'] { background: #24242c !important; color: #f5edf2 !important; border-color: #403641 !important; }
        .app.tema-escuro .config-tema-opcao[aria-pressed='true'] { background: #51283f !important; border-color: #e76da2 !important; color: #fff !important; }
        /* Ajustes globais para cartões e estados vazios que usam estilos inline claros. */
        .app.tema-escuro .vazio,
        .app.tema-escuro .vazio-icone,
        .app.tema-escuro [style*='background: rgb(255, 255, 255)'],
        .app.tema-escuro [style*='background: rgb(255,255,255)'],
        .app.tema-escuro [style*='background-color: rgb(255, 255, 255)'],
        .app.tema-escuro [style*='background: #ffffff'],
        .app.tema-escuro [style*='background: #fff'],
        .app.tema-escuro [style*='backgroundColor: #ffffff'] {
          background: #24242c !important;
          color: #f5edf2 !important;
          border-color: #403641 !important;
        }
        .app.tema-escuro .vazio h3,
        .app.tema-escuro .vazio p,
        .app.tema-escuro .vazio strong,
        .app.tema-escuro .vazio span {
          color: #f0e8ee !important;
        }
        .app.tema-escuro .vazio p,
        .app.tema-escuro .vazio .descricao,
        .app.tema-escuro [style*='color: rgb(238, 224, 233)'],
        .app.tema-escuro [style*='color: #f0e4eb'],
        .app.tema-escuro [style*='color: #eee0e9'] {
          color: #c9bbc6 !important;
        }
        .app.tema-escuro .vazio-icone {
          background: #3a2835 !important;
        }
        .app.tema-escuro button,
        .app.tema-escuro [role='button'] {
          color: #f5edf2;
        }
        .app.tema-escuro .vazio button {
          background: #e94b91 !important;
          color: #fff !important;
          border-color: #e94b91 !important;
        }
        /* Vendas: abas e cartões precisam respeitar o tema escuro mesmo quando usam estilos inline. */
        .app.tema-escuro .secao > div[style*="grid-template-columns: 1fr 1fr"] {
          background: #302a34 !important;
          border: 1px solid #443744 !important;
        }
        .app.tema-escuro .secao > div[style*="grid-template-columns: 1fr 1fr"] button {
          background: transparent !important;
          color: #d8cbd5 !important;
          box-shadow: none !important;
          border-color: transparent !important;
        }
        .app.tema-escuro .secao > div[style*="grid-template-columns: 1fr 1fr"] button[style*="background: #ffffff"] {
          background: #513047 !important;
          color: #ffffff !important;
          border: 1px solid #d85b98 !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, .22) !important;
        }
        .app.tema-escuro .secao > div[style*="grid-template-columns: 1fr 1fr"] button[style*="background: #ffffff"]:last-child {
          color: #ffffff !important;
        }
        .app.tema-escuro .secao .titulo-secao button {
          background: #302a34 !important;
          color: #ff8db7 !important;
          border: 1px solid #594052 !important;
        }
        .app.tema-escuro .botao-notificacao {
          background: #302a34 !important;
          border-color: #594052 !important;
        }
      `}</style>
      {mostrarModalSaida && (
        <div
          onClick={() => setMostrarModalSaida(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 20000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            background: 'rgba(48, 30, 41, 0.48)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-modal-saida"
            onClick={(evento) => evento.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '390px',
              boxSizing: 'border-box',
              padding: '28px 24px 22px',
              borderRadius: '24px',
              background: '#ffffff',
              border: '1px solid #f5dce7',
              boxShadow: '0 24px 80px rgba(70, 28, 50, 0.24)',
              textAlign: 'center',
              fontFamily: 'inherit',
              animation: 'quitaiModalEntrada 180ms ease-out',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 16px',
                display: 'grid',
                placeItems: 'center',
                borderRadius: '20px',
                background: '#fff0f6',
                color: '#c43f6d',
                fontSize: '29px',
              }}
            >
              ↪
            </div>
            <h2
              id="titulo-modal-saida"
              style={{
                margin: '0 0 10px',
                color: '#30242c',
                fontSize: '22px',
                lineHeight: 1.3,
                fontWeight: 750,
              }}
            >
              Sair da sua conta?
            </h2>
            <p
              style={{
                margin: '0 auto 24px',
                maxWidth: '300px',
                color: '#81717b',
                fontSize: '14px',
                lineHeight: 1.65,
              }}
            >
              Tem certeza de que deseja sair do QuitaAí? Você precisará entrar novamente para acessar sua conta.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setMostrarModalSaida(false)}
                style={{
                  flex: 1,
                  minHeight: '46px',
                  padding: '12px 14px',
                  borderRadius: '13px',
                  border: '1px solid #eadde4',
                  background: '#ffffff',
                  color: '#6d5c66',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarSaidaDaConta}
                style={{
                  flex: 1,
                  minHeight: '46px',
                  padding: '12px 14px',
                  borderRadius: '13px',
                  border: '1px solid #c43f6d',
                  background: 'linear-gradient(135deg, #e94b91, #c43f6d)',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 700,
                  boxShadow: '0 7px 16px rgba(196, 63, 109, 0.2)',
                  cursor: 'pointer',
                }}
              >
                Sim, sair
              </button>
            </div>
          </section>
          <style>{`
            @keyframes quitaiModalEntrada {
              from { opacity: 0; transform: translateY(8px) scale(0.98); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      )}
      {notificacoesAbertas && (
        <div onClick={() => setNotificacoesAbertas(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(54, 24, 41, .38)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 'clamp(18px, 6vh, 58px) 16px 20px', overflowY: 'auto' }}>
          <section onClick={(evento) => evento.stopPropagation()} role="dialog" aria-modal="true" aria-label="Central de notificações" style={{ width: '100%', maxWidth: '470px', background: '#fff', borderRadius: '24px', boxShadow: '0 22px 70px rgba(79, 30, 56, .24)', overflow: 'hidden', border: '1px solid #f6d8e6' }}>
            <div style={{ padding: '22px 22px 18px', background: 'linear-gradient(135deg, #fff1f7, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid #f7e2ec' }}>
              <div><span style={{ fontSize: '12px', fontWeight: 700, color: '#d72d86', letterSpacing: '1.1px', textTransform: 'uppercase' }}>Quita! · Central de avisos</span><h2 style={{ margin: '6px 0 0', color: '#33252e', fontSize: '23px' }}>Notificações</h2></div>
              <button type="button" onClick={() => setNotificacoesAbertas(false)} aria-label="Fechar notificações" style={{ border: 0, background: '#ffe3f0', color: '#bb2b70', width: '38px', height: '38px', borderRadius: '50%', fontSize: '22px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '18px', display: 'grid', gap: '10px' }}>
              {obterNotificacoes().length === 0 ? (
                <div style={{ textAlign: 'center', padding: '26px 12px 30px' }}><div style={{ margin: '0 auto 12px', width: '58px', height: '58px', display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#fff0f7', fontSize: '27px' }}>💗</div><strong style={{ display: 'block', color: '#43313b', fontSize: '16px' }}>Tudo em dia por aqui!</strong><p style={{ margin: '7px 0 0', color: '#847580', fontSize: '14px', lineHeight: 1.5 }}>Quando houver pagamentos atrasados ou vencimentos próximos, os avisos aparecerão aqui.</p></div>
              ) : obterNotificacoes().map((item) => (
                <button key={item.id} type="button" onClick={() => { setNotificacoesAbertas(false); setTela('vendas'); setAbaVendas('abertas') }} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px', borderRadius: '16px', border: `1px solid ${item.vencido ? '#f5c9cd' : '#f5dfad'}`, background: item.vencido ? '#fff5f5' : '#fffbef', cursor: 'pointer', color: '#3d3038' }}>
                  <span style={{ width: '38px', height: '38px', borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0, background: item.vencido ? '#ffe2e4' : '#fff0c7', fontSize: '19px' }}>{item.vencido ? '⚠️' : '🗓️'}</span>
                  <span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>{item.titulo}</strong><span style={{ display: 'block', color: '#766670', fontSize: '13px', lineHeight: 1.45 }}>{item.mensagem}</span>{item.valor != null && <span style={{ display: 'block', color: item.vencido ? '#c13d4b' : '#a36b00', fontWeight: 700, fontSize: '13px', marginTop: '6px' }}>Saldo: R$ {formatarMoeda(item.valor)}</span>}</span>
                </button>
              ))}
            </div>
            <div style={{ padding: '0 18px 18px' }}><button type="button" onClick={() => setNotificacoesAbertas(false)} style={{ width: '100%', border: 0, borderRadius: '13px', padding: '13px', background: '#e92e8b', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Entendi</button></div>
          </section>
        </div>
      )}

      {/* =====================================================
          INÍCIO
      ===================================================== */}

      {tela === 'inicio' && (
        <>
          <header className="topo">

<div
  className="topo-marca"
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    minWidth: 0,
  }}
>
  <img
    src="/quitai-logo-horizontal.svg"
    alt="Quitaí"
    style={{
      display: 'block',
      width: '132px',
      height: 'auto',
      maxHeight: '58px',
      objectFit: 'contain',
      flexShrink: 0,
    }}
  />

  <div
    aria-hidden="true"
    style={{
      width: '1px',
      height: '42px',
      background: '#F3DCE7',
      flexShrink: 0,
    }}
  />

  <div style={{ minWidth: 0 }}>
    <span
      className="saudacao"
      style={{
        display: 'block',
        marginBottom: '3px',
        color: '#927C87',
        fontSize: '12px',
        fontWeight: 500,
      }}
    >
      Olá! 👋
    </span>

    <h1
      style={{
        margin: 0,
        color: '#30242C',
        fontSize: '26px',
        fontWeight: 700,
        letterSpacing: '-0.7px',
        lineHeight: 1.25,
      }}
    >
      Minhas Vendas
    </h1>

    <p
      style={{
        margin: '4px 0 0',
        color: '#C43F82',
        fontSize: '12px',
        fontWeight: 500,
        lineHeight: 1.4,
      }}
    >
      Seus recebimentos em ordem
    </p>
  </div>
</div>


            <button
              className="botao-notificacao"
              type="button"
              onClick={abrirNotificacoes}
              aria-label="Abrir notificações"
              title="Notificações"
              style={{ position: 'relative' }}
            >
              🔔
              {obterNotificacoes().filter((item) => !notificacoesLidas.includes(item.id)).length > 0 && <span style={{ position: 'absolute', top: '-3px', right: '-3px', minWidth: '18px', height: '18px', padding: '0 4px', borderRadius: '20px', background: '#e92e8b', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid #fff' }}>{obterNotificacoes().filter((item) => !notificacoesLidas.includes(item.id)).length}</span>} 
            </button>

          </header>

          <main className="conteudo">

            <section className="resumo">

              <button
                className="resumo-card principal"
                type="button"
                onClick={() => setTela('vendas')}
                title="Ver todas as vendas"
              >
                <span>
                  🛍️ Total vendido
                </span>

                <strong>
                  R$ {formatarMoeda(totalVendido)}
                </strong>
              </button>

              <button
                className="resumo-card"
                type="button"
                onClick={() => setTela('vendas')}
                title="Ver vendas e pagamentos"
              >
                <span>
                  💵 Total recebido
                </span>

                <strong>
                  R$ {formatarMoeda(totalRecebido)}
                </strong>
              </button>

              <button
                className="resumo-card"
                type="button"
                onClick={() => setTela('vendas')}
                title="Ver vendas em aberto"
              >
                <span>
                  🕐 A receber
                </span>

                <strong>
                  R$ {formatarMoeda(totalAReceber)}
                </strong>
              </button>

              <button
                className="resumo-card"
                type="button"
                onClick={() => setTela('vendas')}
                title="Ver vendas com parcelas em aberto"
              >
                <span>
                  🧾 Boletos em aberto
                </span>

                <strong>
                  R$ {formatarMoeda(totalBoletosEmAberto)}
                </strong>
              </button>

            </section>

            <section className="acoes">

              <button
                className="acao-principal"
                type="button"
                onClick={abrirNovaVenda}
              >
                <span>
                  ＋
                </span>

                Nova venda
              </button>

            </section>

            <section className="secao">

              <div className="titulo-secao">

                <h2>
                  Vendas recentes
                </h2>

                <button
                  type="button"
                  onClick={() =>
                    setTela('vendas')
                  }
                >
                  Ver todas
                </button>

              </div>

              {carregandoVendas && (
                <div className="vazio">
                  <h3>Carregando vendas...</h3>
                </div>
              )}

              {!carregandoVendas &&
                !erroVendas &&
                vendasRecentes.length === 0 && (
                  <div className="vazio">

                    <div className="vazio-icone">
                      🛍️
                    </div>

                    <h3>
                      Nenhuma venda ainda
                    </h3>

                    <p>
                      Suas vendas aparecerão aqui
                      quando você cadastrar a primeira.
                    </p>

                  </div>
                )}

              {!carregandoVendas &&
                !erroVendas &&
                vendasRecentes.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {vendasRecentes.map((venda) => (
                      <button
                        key={venda.id}
                        type="button"
                        onClick={() => abrirDetalhesVenda(venda)}
                        style={{
                          width: '100%',
                          border: 'none',
                          borderRadius: '18px',
                          background: '#ffffff',
                          padding: '16px',
                          textAlign: 'left',
                          boxShadow:
                            '0 4px 18px rgba(0, 0, 0, 0.05)',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                          }}
                        >
                          <div
                            style={{
                              minWidth: 0,
                              flex: 1,
                            }}
                          >
                            <strong
                              style={{
                                display: 'block',
                                color: '#292329',
                                fontSize: '16px',
                                marginBottom: '5px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {venda.cliente_nome || 'Cliente'}
                            </strong>

                            <span
                              style={{
                                display: 'block',
                                color: '#999',
                                fontSize: '13px',
                              }}
                            >
                              Compra em {formatarData(venda.data_compra)}
                            </span>
                          </div>

                          <div
                            style={{
                              textAlign: 'right',
                              flexShrink: 0,
                            }}
                          >
                            <strong
                              style={{
                                display: 'block',
                                color: '#df5f8d',
                                fontSize: '16px',
                                marginBottom: '4px',
                              }}
                            >
                              R$ {formatarMoeda(venda.total)}
                            </strong>

                            <span
                              style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                borderRadius: '999px',
                                background:
                                  venda.status === 'QUITADO'
                                    ? '#eaf8f0'
                                    : '#fff0f5',
                                color:
                                  venda.status === 'QUITADO'
                                    ? '#29945c'
                                    : '#df5f8d',
                                fontSize: '10px',
                                fontWeight: '700',
                              }}
                            >
                              {venda.status === 'QUITADO'
                                ? 'QUITADO'
                                : 'EM ABERTO'}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '10px',
                            marginTop: '13px',
                            paddingTop: '12px',
                            borderTop: '1px solid #f3e8ed',
                            color: '#777',
                            fontSize: '12px',
                          }}
                        >
                          <span>
                            Recebido: R$ {formatarMoeda(venda.valor_pago)}
                          </span>

                          <span>
                            Saldo: R$ {formatarMoeda(venda.saldo)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

              {erroVendas && (
                <div className="vazio">
                  <div className="vazio-icone">⚠️</div>
                  <h3>Erro ao carregar vendas</h3>
                  <p>{erroVendas}</p>
                </div>
              )}

            </section>

          </main>
        </>
      )}

      {/* =====================================================
          PRODUTOS
      ===================================================== */}

      {tela === 'produtos' && (
        <>

          <header className="topo">

            <div>
              <span className="saudacao">
                QuitaAí
              </span>

              <h1>
                Produtos
              </h1>
            </div>

          </header>

          <main className="conteudo">

            <section className="secao">

              <div className="titulo-secao">

                <h2>
                  Meus produtos
                </h2>

                <button
                  type="button"
                  onClick={abrirNovoProduto}
                >
                  + Novo
                </button>

              </div>

              {carregandoProdutos && (
                <div className="vazio">
                  <h3>
                    Carregando produtos...
                  </h3>
                </div>
              )}

              {erroProdutos && (
                <div className="vazio">

                  <div className="vazio-icone">
                    ⚠️
                  </div>

                  <h3>
                    Erro
                  </h3>

                  <p>
                    {erroProdutos}
                  </p>

                </div>
              )}

              {!carregandoProdutos &&
                !erroProdutos &&
                produtos.length === 0 && (
                  <div className="vazio">

                    <div className="vazio-icone">
                      📦
                    </div>

                    <h3>
                      Nenhum produto cadastrado
                    </h3>

                    <p>
                      Seus produtos aparecerão aqui
                      quando forem cadastrados.
                    </p>

                  </div>
                )}

              {!carregandoProdutos &&
                !erroProdutos &&
                produtos.length > 0 && (

                  <div>

                    {produtos.map(
                      (produto) => (

                        <div
                          key={produto.id}
                          style={{
                            background:
                              '#ffffff',
                            borderRadius:
                              '18px',
                            padding: '18px',
                            marginBottom:
                              '12px',
                            boxShadow:
                              '0 4px 18px rgba(0, 0, 0, 0.05)',
                          }}
                        >

                          <strong
                            style={{
                              display:
                                'block',
                              fontSize:
                                '17px',
                              marginBottom:
                                '6px',
                            }}
                          >
                            {produto.nome}
                          </strong>

                          <span
                            style={{
                              display:
                                'block',
                              color: '#999',
                              fontSize:
                                '13px',
                              marginBottom:
                                '10px',
                            }}
                          >
                            {produto.categoria ||
                              'Sem categoria'}

                            {' · '}

                            Código:{' '}
                            {produto.codigo}
                          </span>

                          <strong
                            style={{
                              color:
                                '#df5f8d',
                              fontSize:
                                '18px',
                            }}
                          >
                            R${' '}
                            {formatarMoeda(
                              produto.preco_venda
                            )}
                          </strong>

                          <div
                            style={{
                              display:
                                'flex',
                              alignItems:
                                'center',
                              justifyContent:
                                'space-between',
                              marginTop:
                                '14px',
                              paddingTop:
                                '12px',
                              borderTop:
                                '1px solid #f3e8ed',
                              gap: '8px',
                            }}
                          >

                            <span
                              style={{
                                color:
                                  '#666',
                                fontSize:
                                  '13px',
                              }}
                            >
                              Estoque:{' '}
                              {produto.estoque}
                            </span>

                            <div
                              style={{
                                display:
                                  'flex',
                                gap: '8px',
                              }}
                            >

                              <button
                                type="button"
                                onClick={() =>
                                  abrirEditarProduto(
                                    produto
                                  )
                                }
                                style={{
                                  border:
                                    'none',
                                  borderRadius:
                                    '10px',
                                  padding:
                                    '8px 13px',
                                  background:
                                    '#fff0f5',
                                  color:
                                    '#df5f8d',
                                  fontSize:
                                    '13px',
                                  fontWeight:
                                    '600',
                                  cursor:
                                    'pointer',
                                }}
                              >
                                ✏️ Editar
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  abrirExclusaoProduto(
                                    produto
                                  )
                                }
                                style={{
                                  border:
                                    'none',
                                  borderRadius:
                                    '10px',
                                  padding:
                                    '8px 13px',
                                  background:
                                    '#fff1f1',
                                  color:
                                    '#d9534f',
                                  fontSize:
                                    '13px',
                                  fontWeight:
                                    '600',
                                  cursor:
                                    'pointer',
                                }}
                              >
                                🗑️ Excluir
                              </button>

                            </div>

                          </div>

                        </div>

                      )
                    )}

                  </div>
                )}

            </section>

          </main>

          {/* MODAL PRODUTO */}

          {mostrarFormulario && (
            <div className="modal-overlay">

              <div className="modal">

                <div className="modal-cabecalho">

                  <div>

                    <span className="saudacao">
                      Produtos
                    </span>

                    <h2>
                      {produtoEditandoId !== null
                        ? 'Editar produto'
                        : 'Novo produto'}
                    </h2>

                  </div>

                  <button
                    className="modal-fechar"
                    type="button"
                    onClick={
                      fecharFormularioProduto
                    }
                  >
                    ×
                  </button>

                </div>

                <form
                  className="formulario-produto"
                  onSubmit={salvarProduto}
                >

                  <label>
                    Nome do produto

                    <input
                      type="text"
                      name="nome"
                      value={
                        formularioProduto.nome
                      }
                      onChange={
                        alterarFormularioProduto
                      }
                      placeholder="Ex.: Egeo Dolce"
                      required
                    />
                  </label>

                  <label>
                    Código

                    <input
                      type="text"
                      name="codigo"
                      value={
                        formularioProduto.codigo
                      }
                      onChange={
                        alterarFormularioProduto
                      }
                      placeholder="Ex.: BOT001"
                      required
                    />
                  </label>

                  <label>
                    Categoria

                    <input
                      type="text"
                      name="categoria"
                      value={
                        formularioProduto.categoria
                      }
                      onChange={
                        alterarFormularioProduto
                      }
                      placeholder="Ex.: Perfume"
                    />
                  </label>

                  <div className="formulario-duplo">

                    <label>
                      Preço de custo

                      <input
                        type="number"
                        name="preco_custo"
                        value={
                          formularioProduto.preco_custo
                        }
                        onChange={
                          alterarFormularioProduto
                        }
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        required
                      />
                    </label>

                    <label>
                      Preço de venda

                      <input
                        type="number"
                        name="preco_venda"
                        value={
                          formularioProduto.preco_venda
                        }
                        onChange={
                          alterarFormularioProduto
                        }
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        required
                      />
                    </label>

                  </div>

                  <label>
                    Estoque inicial

                    <input
                      type="number"
                      name="estoque"
                      value={
                        formularioProduto.estoque
                      }
                      onChange={
                        alterarFormularioProduto
                      }
                      min="0"
                      placeholder="0"
                      required
                    />
                  </label>

                  {erroFormularioProduto && (
                    <p
                      style={{
                        margin: 0,
                        color: '#d9534f',
                        fontSize: '13px',
                        textAlign:
                          'center',
                      }}
                    >
                      {
                        erroFormularioProduto
                      }
                    </p>
                  )}

                  <button
                    className="botao-salvar"
                    type="submit"
                    disabled={
                      salvandoProduto
                    }
                  >
                    {salvandoProduto
                      ? 'Salvando...'
                      : produtoEditandoId !== null
                        ? 'Salvar alterações'
                        : 'Cadastrar produto'}
                  </button>

                </form>

              </div>

            </div>
          )}

          {/* EXCLUSÃO PRODUTO */}

          {produtoParaExcluir && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background:
                  'rgba(35, 25, 30, 0.48)',
                backdropFilter:
                  'blur(4px)',
                display: 'flex',
                alignItems:
                  'center',
                justifyContent:
                  'center',
                padding: '20px',
              }}
            >

              <div
                style={{
                  width: '100%',
                  maxWidth: '390px',
                  background:
                    '#ffffff',
                  borderRadius:
                    '24px',
                  padding:
                    '28px 24px 24px',
                  textAlign:
                    'center',
                  boxShadow:
                    '0 20px 60px rgba(80, 40, 55, 0.22)',
                }}
              >

                <div
                  style={{
                    width: '62px',
                    height: '62px',
                    margin:
                      '0 auto 16px',
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    borderRadius:
                      '50%',
                    background:
                      '#fff0f4',
                    fontSize:
                      '27px',
                  }}
                >
                  🗑️
                </div>

                <h2
                  style={{
                    margin:
                      '0 0 10px',
                    color:
                      '#292329',
                    fontSize:
                      '21px',
                  }}
                >
                  Excluir produto?
                </h2>

                <p
                  style={{
                    margin:
                      '0 auto',
                    color:
                      '#777',
                    fontSize:
                      '14px',
                    lineHeight:
                      '1.5',
                  }}
                >
                  Tem certeza que deseja
                  excluir{' '}
                  <strong>
                    "{produtoParaExcluir.nome}"
                  </strong>
                  ?
                </p>

                {erroExclusaoProduto && (
                  <div role="alert" style={{ marginTop: '16px', padding: '13px', borderRadius: '14px', background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', textAlign: 'left', fontSize: '13px', lineHeight: 1.5 }}>
                    <strong style={{ display: 'block', marginBottom: '5px' }}>Exclusão bloqueada</strong>
                    {erroExclusaoProduto}
                    <button type="button" onClick={fecharExclusaoProduto} style={{ display: 'block', marginTop: '10px', padding: '8px 12px', border: 'none', borderRadius: '9px', background: '#fce7f3', color: '#9d174d', fontWeight: 700, cursor: 'pointer' }}>Entendi</button>
                  </div>
                )}

                <span
                  style={{
                    display:
                      'block',
                    marginTop:
                      '12px',
                    color:
                      '#a09a9d',
                    fontSize:
                      '12px',
                  }}
                >
                  Essa ação não poderá
                  ser desfeita.
                </span>

                <div
                  style={{
                    display:
                      'flex',
                    gap: '10px',
                    marginTop:
                      '24px',
                  }}
                >

                  <button
                    type="button"
                    onClick={
                      fecharExclusaoProduto
                    }
                    disabled={
                      excluindoProduto
                    }
                    style={{
                      flex: 1,
                      minHeight:
                        '46px',
                      border:
                        'none',
                      borderRadius:
                        '13px',
                      background:
                        '#f7f3f5',
                      color:
                        '#666',
                      fontWeight:
                        '600',
                      cursor:
                        'pointer',
                    }}
                  >
                    Cancelar
                  </button>

                  {!erroExclusaoProduto && (
                  <button
                    type="button"
                    onClick={
                      confirmarExclusaoProduto
                    }
                    disabled={
                      excluindoProduto
                    }
                    style={{
                      flex: 1,
                      minHeight:
                        '46px',
                      border:
                        'none',
                      borderRadius:
                        '13px',
                      background:
                        '#df5f8d',
                      color:
                        '#ffffff',
                      fontWeight:
                        '600',
                      cursor:
                        'pointer',
                    }}
                  >
                    {excluindoProduto
                      ? 'Excluindo...'
                      : 'Excluir produto'}
                  </button>
                  )}

                </div>

              </div>

            </div>
          )}

        </>
      )}

      {/* =====================================================
          CLIENTES
      ===================================================== */}

      {tela === 'clientes' && (
        <>

          <header className="topo">

            <div>
              <span className="saudacao">
                QuitaAí
              </span>

              <h1>
                Clientes
              </h1>
            </div>

          </header>

          <main className="conteudo">

            <section className="secao">

              <div className="titulo-secao">

                <h2>
                  Meus clientes
                </h2>

                <button
                  type="button"
                  onClick={
                    abrirNovoCliente
                  }
                >
                  + Novo
                </button>

              </div>

              {carregandoClientes && (
                <div className="vazio">
                  <h3>
                    Carregando clientes...
                  </h3>
                </div>
              )}

              {erroClientes && (
                <div className="vazio">

                  <div className="vazio-icone">
                    ⚠️
                  </div>

                  <h3>
                    Erro
                  </h3>

                  <p>
                    {erroClientes}
                  </p>

                </div>
              )}

              {!carregandoClientes &&
                !erroClientes &&
                clientes.length === 0 && (
                  <div className="vazio">

                    <div className="vazio-icone">
                      👥
                    </div>

                    <h3>
                      Nenhum cliente
                      cadastrado
                    </h3>

                    <p>
                      Seus clientes
                      aparecerão aqui
                      quando forem
                      cadastrados.
                    </p>

                  </div>
                )}

              {!carregandoClientes &&
                !erroClientes &&
                clientes.length > 0 && (

                  <div>

                    {clientes.map(
                      (cliente) => (

                        <div
                          key={
                            cliente.id
                          }
                          style={{
                            background:
                              '#ffffff',
                            borderRadius:
                              '18px',
                            padding:
                              '18px',
                            marginBottom:
                              '12px',
                            boxShadow:
                              '0 4px 18px rgba(0,0,0,0.05)',
                          }}
                        >

                          <strong
                            style={{
                              display:
                                'block',
                              fontSize:
                                '17px',
                              marginBottom:
                                '6px',
                            }}
                          >
                            {
                              cliente.nome
                            }
                          </strong>

                          <span
                            style={{
                              display:
                                'block',
                              color:
                                '#777',
                              fontSize:
                                '14px',
                              marginBottom:
                                '6px',
                            }}
                          >
                            📱{' '}
                            {
                              cliente.telefone ||
                              'Telefone não informado'
                            }
                          </span>

                          {
                            cliente.observacoes && (
                              <span
                                style={{
                                  display:
                                    'block',
                                  color:
                                    '#999',
                                  fontSize:
                                    '13px',
                                  marginBottom:
                                    '12px',
                                }}
                              >
                                {
                                  cliente.observacoes
                                }
                              </span>
                            )
                          }

                          <div
                            style={{
                              display:
                                'flex',
                              justifyContent:
                                'flex-end',
                              gap: '8px',
                              marginTop:
                                '12px',
                              paddingTop:
                                '12px',
                              borderTop:
                                '1px solid #f3e8ed',
                            }}
                          >

                            <button
                              type="button"
                              onClick={() =>
                                abrirEditarCliente(
                                  cliente
                                )
                              }
                              style={{
                                border:
                                  'none',
                                borderRadius:
                                  '10px',
                                padding:
                                  '8px 13px',
                                background:
                                  '#fff0f5',
                                color:
                                  '#df5f8d',
                                fontSize:
                                  '13px',
                                fontWeight:
                                  '600',
                                cursor:
                                  'pointer',
                              }}
                            >
                              ✏️ Editar
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                abrirConfirmacaoExcluirCliente(
                                  cliente
                                )
                              }
                              style={{
                                border:
                                  'none',
                                borderRadius:
                                  '10px',
                                padding:
                                  '8px 13px',
                                background:
                                  '#fff1f1',
                                color:
                                  '#d9534f',
                                fontSize:
                                  '13px',
                                fontWeight:
                                  '600',
                                cursor:
                                  'pointer',
                              }}
                            >
                              🗑️ Excluir
                            </button>

                          </div>

                        </div>

                      )
                    )}

                  </div>
                )}

            </section>

          </main>

          {/* MODAL CLIENTE */}

          {mostrarFormularioCliente && (
            <div className="modal-overlay">

              <div className="modal">

                <div className="modal-cabecalho">

                  <div>

                    <span className="saudacao">
                      Clientes
                    </span>

                    <h2>
                      {clienteEditandoId !== null
                        ? 'Editar cliente'
                        : 'Novo cliente'}
                    </h2>

                  </div>

                  <button
                    className="modal-fechar"
                    type="button"
                    onClick={
                      fecharFormularioCliente
                    }
                  >
                    ×
                  </button>

                </div>

                <form
                  className="formulario-produto"
                  onSubmit={
                    salvarCliente
                  }
                >

                  <label>
                    Nome do cliente

                    <input
                      type="text"
                      name="nome"
                      value={
                        formularioCliente.nome
                      }
                      onChange={
                        alterarFormularioCliente
                      }
                      placeholder="Ex.: Maria Silva"
                      required
                    />
                  </label>

                  <label>
                    Telefone

                    <input
                      type="text"
                      name="telefone"
                      value={
                        formularioCliente.telefone
                      }
                      onChange={
                        alterarFormularioCliente
                      }
                      placeholder="Ex.: (86) 99999-9999"
                    />
                  </label>

                  <label>
                    Observações

                    <textarea
                      name="observacoes"
                      value={
                        formularioCliente.observacoes
                      }
                      onChange={
                        alterarFormularioCliente
                      }
                      placeholder="Observações sobre o cliente"
                      rows="4"
                    />
                  </label>

                  {erroFormularioCliente && (
                    <p
                      style={{
                        margin: 0,
                        color:
                          '#d9534f',
                        fontSize:
                          '13px',
                        textAlign:
                          'center',
                      }}
                    >
                      {
                        erroFormularioCliente
                      }
                    </p>
                  )}

                  <button
                    className="botao-salvar"
                    type="submit"
                    disabled={
                      salvandoCliente
                    }
                  >
                    {salvandoCliente
                      ? 'Salvando...'
                      : clienteEditandoId !== null
                        ? 'Salvar alterações'
                        : 'Cadastrar cliente'}
                  </button>

                </form>

              </div>

            </div>
          )}

          {/* EXCLUSÃO CLIENTE */}

          {clienteExcluindo && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background:
                  'rgba(35, 25, 30, 0.48)',
                backdropFilter:
                  'blur(4px)',
                display: 'flex',
                alignItems:
                  'center',
                justifyContent:
                  'center',
                padding: '20px',
              }}
              onClick={(event) => {
                if (
                  event.target ===
                    event.currentTarget &&
                  !excluindoCliente
                ) {
                  fecharConfirmacaoExcluirCliente()
                }
              }}
            >

              <div
                style={{
                  width: '100%',
                  maxWidth: '390px',
                  background:
                    '#ffffff',
                  borderRadius:
                    '24px',
                  padding:
                    '28px 24px 24px',
                  textAlign:
                    'center',
                  boxShadow:
                    '0 20px 60px rgba(80,40,55,0.22)',
                }}
              >

                <div
                  style={{
                    width: '62px',
                    height: '62px',
                    margin:
                      '0 auto 16px',
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    borderRadius:
                      '50%',
                    background:
                      '#fff0f4',
                    fontSize:
                      '27px',
                  }}
                >
                  🗑️
                </div>

                <h2
                  style={{
                    margin:
                      '0 0 10px',
                    color:
                      '#292329',
                    fontSize:
                      '21px',
                  }}
                >
                  Excluir cliente?
                </h2>

                <p
                  style={{
                    margin:
                      '0 auto',
                    maxWidth:
                      '320px',
                    color:
                      '#777',
                    fontSize:
                      '14px',
                    lineHeight:
                      '1.5',
                  }}
                >
                  Tem certeza que deseja
                  excluir{' '}
                  <strong
                    style={{
                      color:
                        '#df5f8d',
                    }}
                  >
                    "{clienteExcluindo.nome}"
                  </strong>
                  ?
                </p>

                {erroExclusaoCliente && (
                  <div role="alert" style={{ marginTop: '16px', padding: '13px', borderRadius: '14px', background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', textAlign: 'left', fontSize: '13px', lineHeight: 1.5 }}>
                    <strong style={{ display: 'block', marginBottom: '5px' }}>Exclusão bloqueada</strong>
                    {erroExclusaoCliente}
                    <button type="button" onClick={fecharConfirmacaoExcluirCliente} style={{ display: 'block', marginTop: '10px', padding: '8px 12px', border: 'none', borderRadius: '9px', background: '#fce7f3', color: '#9d174d', fontWeight: 700, cursor: 'pointer' }}>Entendi</button>
                  </div>
                )}

                <span
                  style={{
                    display:
                      'block',
                    marginTop:
                      '12px',
                    color:
                      '#a09a9d',
                    fontSize:
                      '12px',
                  }}
                >
                  Essa ação não poderá
                  ser desfeita.
                </span>

                <div
                  style={{
                    display:
                      'flex',
                    gap: '10px',
                    marginTop:
                      '24px',
                  }}
                >

                  <button
                    type="button"
                    onClick={
                      fecharConfirmacaoExcluirCliente
                    }
                    disabled={
                      excluindoCliente
                    }
                    style={{
                      flex: 1,
                      minHeight:
                        '46px',
                      border:
                        'none',
                      borderRadius:
                        '13px',
                      background:
                        '#f7f3f5',
                      color:
                        '#666',
                      fontWeight:
                        '600',
                      cursor:
                        'pointer',
                    }}
                  >
                    Cancelar
                  </button>

                  {!erroExclusaoCliente && (
                  <button
                    type="button"
                    onClick={
                      excluirCliente
                    }
                    disabled={
                      excluindoCliente
                    }
                    style={{
                      flex: 1,
                      minHeight:
                        '46px',
                      border:
                        'none',
                      borderRadius:
                        '13px',
                      background:
                        '#df5f8d',
                      color:
                        '#ffffff',
                      fontWeight:
                        '600',
                      cursor:
                        'pointer',
                    }}
                  >
                    {excluindoCliente
                      ? 'Excluindo...'
                      : 'Excluir cliente'}
                  </button>
                  )}

                </div>

              </div>

            </div>
          )}

        </>
      )}

      {/* =====================================================
          VENDAS
      ===================================================== */}

      {tela === 'vendas' && (
        <>

          <header className="topo">

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <span className="saudacao">Olá! 👋</span>
                <h1>Minhas Vendas</h1>
              </div>
            </div>

            <button className="botao-notificacao" type="button" onClick={abrirNotificacoes} aria-label="Abrir notificações" title="Notificações" style={{ position: 'relative' }}>
              🔔
              {obterNotificacoes().filter((item) => !notificacoesLidas.includes(item.id)).length > 0 && <span style={{ position: 'absolute', top: '-3px', right: '-3px', minWidth: '18px', height: '18px', padding: '0 4px', borderRadius: '20px', background: '#e92e8b', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid #fff' }}>{obterNotificacoes().filter((item) => !notificacoesLidas.includes(item.id)).length}</span>}
            </button>

          </header>

          <main className="conteudo">

            <section className="secao">

              <div className="titulo-secao">

                <h2>
                  {abaVendas === 'quitadas'
                    ? 'Histórico de quitadas'
                    : 'Minhas vendas'}
                </h2>

                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                  }}
                >

                  <button
                    type="button"
                    onClick={
                      abrirNovaVenda
                    }
                  >
                    + Nova
                  </button>

                  <button
                    type="button"
                    onClick={
                      buscarVendas
                    }
                  >
                    ↻ Atualizar
                  </button>

                </div>

              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  marginBottom: '18px',
                  padding: '4px',
                  borderRadius: '14px',
                  background: '#f8eef2',
                }}
              >

                <button
                  type="button"
                  onClick={() => setAbaVendas('abertas')}
                  style={{
                    border: 'none',
                    borderRadius: '11px',
                    padding: '11px 10px',
                    background:
                      abaVendas === 'abertas'
                        ? '#ffffff'
                        : 'transparent',
                    color:
                      abaVendas === 'abertas'
                        ? '#df5f8d'
                        : '#8f8187',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow:
                      abaVendas === 'abertas'
                        ? '0 3px 10px rgba(0, 0, 0, 0.06)'
                        : 'none',
                  }}
                >
                  Em andamento ({vendasAbertas.length})
                </button>

                <button
                  type="button"
                  onClick={() => setAbaVendas('quitadas')}
                  style={{
                    border: 'none',
                    borderRadius: '11px',
                    padding: '11px 10px',
                    background:
                      abaVendas === 'quitadas'
                        ? '#ffffff'
                        : 'transparent',
                    color:
                      abaVendas === 'quitadas'
                        ? '#29945c'
                        : '#8f8187',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow:
                      abaVendas === 'quitadas'
                        ? '0 3px 10px rgba(0, 0, 0, 0.06)'
                        : 'none',
                  }}
                >
                  Quitadas ({vendasQuitadas.length})
                </button>

              </div>

              {carregandoVendas && (
                <div className="vazio">

                  <div className="vazio-icone">
                    🛒
                  </div>

                  <h3>
                    Carregando vendas...
                  </h3>

                  <p>
                    Buscando suas vendas.
                  </p>

                </div>
              )}

              {erroVendas && (
                <div className="vazio">

                  <div className="vazio-icone">
                    ⚠️
                  </div>

                  <h3>
                    Erro
                  </h3>

                  <p>
                    {erroVendas}
                  </p>

                  <button
                    type="button"
                    onClick={
                      buscarVendas
                    }
                  >
                    Tentar novamente
                  </button>

                </div>
              )}

              {!carregandoVendas &&
                !erroVendas &&
                vendasExibidas.length === 0 && (
                  <div className="vazio">

                    <div className="vazio-icone">
                      🛍️
                    </div>

                    <h3>
                      {abaVendas === 'quitadas'
                        ? 'Nenhuma venda quitada'
                        : 'Nenhuma venda em andamento'}
                    </h3>

                    <p>
                      {abaVendas === 'quitadas'
                        ? 'As vendas totalmente pagas aparecerão aqui.'
                        : 'Suas vendas que ainda possuem saldo aparecerão aqui.'}
                    </p>

                    {abaVendas === 'abertas' && (
                      <button
                        type="button"
                        onClick={
                          abrirNovaVenda
                        }
                      >
                        ＋ Cadastrar primeira venda
                      </button>
                    )}

                  </div>
                )}

              {!carregandoVendas &&
                !erroVendas &&
                vendasExibidas.length > 0 && (

                  <div>

                    {vendasExibidas.map(
                      (venda) => (

                        <button
                          key={
                            venda.id
                          }
                          type="button"
                          onClick={() =>
                            abrirDetalhesVenda(
                              venda
                            )
                          }
                          style={{
                            width: '100%',
                            textAlign:
                              'left',
                            border:
                              'none',
                            cursor:
                              'pointer',
                            background:
                              '#ffffff',
                            borderRadius:
                              '18px',
                            padding:
                              '18px',
                            marginBottom:
                              '12px',
                            boxShadow:
                              '0 4px 18px rgba(0, 0, 0, 0.05)',
                          }}
                        >

                          <div
                            style={{
                              display:
                                'flex',
                              justifyContent:
                                'space-between',
                              alignItems:
                                'flex-start',
                              gap: '12px',
                            }}
                          >

                            <div>

                              <span
                                style={{
                                  display:
                                    'block',
                                  color:
                                    '#999',
                                  fontSize:
                                    '11px',
                                  fontWeight:
                                    '600',
                                  marginBottom:
                                    '4px',
                                  textTransform:
                                    'uppercase',
                                  letterSpacing:
                                    '0.4px',
                                }}
                              >
                                Cliente
                              </span>

                              <strong
                                style={{
                                  display:
                                    'block',
                                  color:
                                    '#292329',
                                  fontSize:
                                    '17px',
                                  lineHeight:
                                    '1.25',
                                  marginBottom:
                                    '6px',
                                }}
                              >
                                {
                                  venda.cliente_nome ||
                                  'Cliente não informado'
                                }
                              </strong>

                              <span
                                style={{
                                  color:
                                    '#999',
                                  fontSize:
                                    '13px',
                                }}
                              >
                                Compra em{' '}
                                {formatarData(
                                  venda.data_compra
                                )}
                              </span>

                            </div>

                            <span
                              style={{
                                padding:
                                  '6px 10px',
                                borderRadius:
                                  '20px',
                                background:
                                  obterStatusVenda(
                                    venda.status
                                  ).background,
                                color:
                                  obterStatusVenda(
                                    venda.status
                                  ).color,
                                fontSize:
                                  '11px',
                                fontWeight:
                                  '700',
                                whiteSpace:
                                  'nowrap',
                              }}
                            >
                              {obterStatusVenda(
                                venda.status
                              ).texto}
                            </span>

                          </div>

                          <div
                            style={{
                              display:
                                'grid',
                              gridTemplateColumns:
                                '1fr 1fr',
                              gap: '10px',
                              marginTop:
                                '16px',
                              paddingTop:
                                '14px',
                              borderTop:
                                '1px solid #f3e8ed',
                            }}
                          >

                            <div>

                              <span
                                style={{
                                  display:
                                    'block',
                                  color:
                                    '#999',
                                  fontSize:
                                    '12px',
                                  marginBottom:
                                    '4px',
                                }}
                              >
                                Valor
                              </span>

                              <strong
                                style={{
                                  color:
                                    '#292329',
                                  fontSize:
                                    '16px',
                                }}
                              >
                                R${' '}
                                {formatarMoeda(
                                  venda.total
                                )}
                              </strong>

                            </div>

                            <div>

                              <span
                                style={{
                                  display:
                                    'block',
                                  color:
                                    '#999',
                                  fontSize:
                                    '12px',
                                  marginBottom:
                                    '4px',
                                }}
                              >
                                Saldo
                              </span>

                              <strong
                                style={{
                                  color:
                                    Number(
                                      venda.saldo
                                    ) > 0
                                      ? '#df5f8d'
                                      : '#29945c',
                                  fontSize:
                                    '16px',
                                }}
                              >
                                R${' '}
                                {formatarMoeda(
                                  venda.saldo
                                )}
                              </strong>

                            </div>

                          </div>

                          <div
                            style={{
                              marginTop:
                                '12px',
                              color:
                                '#777',
                              fontSize:
                                '13px',
                            }}
                          >
                            Vencimento:{' '}
                            {formatarData(
                              venda.vencimento
                            )}

                            {venda.status === 'VENCIDO' && (
                              <span
                                style={{
                                  display: 'block',
                                  marginTop: '4px',
                                  color: '#d94b4b',
                                  fontWeight: '600',
                                  fontSize: '12px',
                                }}
                              >
                                Pagamento atrasado
                              </span>
                            )}

                            {venda.status === 'VENCE_EM_BREVE' && (
                              <span
                                style={{
                                  display: 'block',
                                  marginTop: '4px',
                                  color: '#c98200',
                                  fontWeight: '600',
                                  fontSize: '12px',
                                }}
                              >
                                Vencimento próximo
                              </span>
                            )}

                            {venda.status === 'EM_ABERTO' && (
                              <span
                                style={{
                                  display: 'block',
                                  marginTop: '4px',
                                  color: '#29945c',
                                  fontWeight: '600',
                                  fontSize: '12px',
                                }}
                              >
                                Venda em aberto
                              </span>
                            )}
                          </div>

                        </button>

                      )
                    )}

                  </div>
                )}

            </section>

          </main>

        </>
      )}

      {/* =====================================================
          DETALHES DA VENDA
      ===================================================== */}

      {tela === 'detalhes-venda' && (
        <>

          <header className="topo">

            <div
              style={{
                display:
                  'flex',
                alignItems:
                  'center',
                gap: '12px',
              }}
            >

              <button
                type="button"
                onClick={() => {
                  setVendaSelecionada(
                    null
                  )
                  setErroDetalhesVenda(
                    ''
                  )
                  setTela('vendas')
                }}
                style={{
                  border:
                    'none',
                  background:
                    '#fff0f5',
                  color:
                    '#df5f8d',
                  width:
                    '40px',
                  height:
                    '40px',
                  borderRadius:
                    '12px',
                  fontSize:
                    '20px',
                  cursor:
                    'pointer',
                }}
              >
                ←
              </button>

              <div>

                <span className="saudacao">
                  QuitaAí
                </span>

                <h1>
                  Detalhes da Venda
                </h1>

              </div>

            </div>

          </header>

          <main className="conteudo">

            {carregandoDetalhesVenda && (
              <div className="vazio">

                <div className="vazio-icone">
                  🛒
                </div>

                <h3>
                  Carregando venda...
                </h3>

                <p>
                  Buscando os detalhes da venda.
                </p>

              </div>
            )}

            {erroDetalhesVenda && (
              <div className="vazio">

                <div className="vazio-icone">
                  ⚠️
                </div>

                <h3>
                  Erro
                </h3>

                <p>
                  {erroDetalhesVenda}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setErroDetalhesVenda(
                      ''
                    )
                    setTela('vendas')
                  }}
                >
                  Voltar para vendas
                </button>

              </div>
            )}

            {!carregandoDetalhesVenda &&
              !erroDetalhesVenda &&
              vendaSelecionada && (
                <>

                  <section
                    style={{
                      background:
                        '#ffffff',
                      borderRadius:
                        '20px',
                      padding:
                        '20px',
                      marginBottom:
                        '14px',
                      boxShadow:
                        '0 4px 18px rgba(0,0,0,0.05)',
                    }}
                  >

                    <span
                      style={{
                        display:
                          'block',
                        color:
                          '#999',
                        fontSize:
                          '12px',
                        marginBottom:
                          '6px',
                      }}
                    >
                      Cliente
                    </span>

                    <strong
                      style={{
                        display:
                          'block',
                        color:
                          '#292329',
                        fontSize:
                          '19px',
                        marginBottom:
                          '8px',
                      }}
                    >
                      {
                        vendaSelecionada
                          .venda
                          .cliente_nome
                      }
                    </strong>

                    <span
                      style={{
                        color:
                          '#777',
                        fontSize:
                          '13px',
                      }}
                    >
                      Compra em{' '}
                      {formatarData(
                        vendaSelecionada
                          .venda
                          .data_compra
                      )}
                    </span>

                  </section>

                  <section className="secao">

                    <div className="titulo-secao">

                      <h2>
                        Produtos
                      </h2>

                    </div>

                    {vendaSelecionada.itens
                      .length === 0 && (
                      <div className="vazio">

                        <div className="vazio-icone">
                          📦
                        </div>

                        <h3>
                          Nenhum produto
                        </h3>

                        <p>
                          Esta venda ainda não
                          possui produtos
                          cadastrados.
                        </p>

                      </div>
                    )}

                    {vendaSelecionada.itens.map(
                      (item) => (

                        <div
                          key={
                            item.id
                          }
                          style={{
                            background:
                              '#ffffff',
                            borderRadius:
                              '18px',
                            padding:
                              '18px',
                            marginBottom:
                              '12px',
                            boxShadow:
                              '0 4px 18px rgba(0,0,0,0.05)',
                          }}
                        >

                          <strong
                            style={{
                              display:
                                'block',
                              color:
                                '#292329',
                              fontSize:
                                '16px',
                              marginBottom:
                                '6px',
                            }}
                          >
                            {
                              item.produto_nome
                            }
                          </strong>

                          <span
                            style={{
                              display:
                                'block',
                              color:
                                '#777',
                              fontSize:
                                '13px',
                              marginBottom:
                                '12px',
                            }}
                          >
                            {
                              item.quantidade
                            }{' '}
                            unidade
                            {
                              item.quantidade !==
                              1
                                ? 's'
                                : ''
                            }
                          </span>

                          <div
                            style={{
                              display:
                                'grid',
                              gridTemplateColumns:
                                '1fr 1fr',
                              gap:
                                '12px',
                              paddingTop:
                                '12px',
                              borderTop:
                                '1px solid #f3e8ed',
                            }}
                          >

                            <div>

                              <span
                                style={{
                                  display:
                                    'block',
                                  color:
                                    '#999',
                                  fontSize:
                                    '12px',
                                  marginBottom:
                                    '4px',
                                }}
                              >
                                Valor unitário
                              </span>

                              <strong
                                style={{
                                  color:
                                    '#292329',
                                  fontSize:
                                    '15px',
                                }}
                              >
                                R${' '}
                                {formatarMoeda(
                                  item.preco_unitario
                                )}
                              </strong>

                            </div>

                            <div>

                              <span
                                style={{
                                  display:
                                    'block',
                                  color:
                                    '#999',
                                  fontSize:
                                    '12px',
                                  marginBottom:
                                    '4px',
                                }}
                              >
                                Subtotal
                              </span>

                              <strong
                                style={{
                                  color:
                                    '#df5f8d',
                                  fontSize:
                                    '15px',
                                }}
                              >
                                R${' '}
                                {formatarMoeda(
                                  item.subtotal
                                )}
                              </strong>

                            </div>

                          </div>

                        </div>

                      )
                    )}

                  </section>

                  <section
                    style={{
                      background:
                        '#ffffff',
                      borderRadius:
                        '20px',
                      padding:
                        '20px',
                      marginTop:
                        '4px',
                      marginBottom:
                        '14px',
                      boxShadow:
                        '0 4px 18px rgba(0,0,0,0.05)',
                    }}
                  >

                    <h2
                      style={{
                        margin:
                          '0 0 18px',
                        fontSize:
                          '18px',
                        color:
                          '#292329',
                      }}
                    >
                      Pagamento
                    </h2>

                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        marginBottom:
                          '14px',
                      }}
                    >

                      <span
                        style={{
                          color:
                            '#777',
                          fontSize:
                            '14px',
                        }}
                      >
                        Total da venda
                      </span>

                      <strong>
                        R${' '}
                        {formatarMoeda(
                          vendaSelecionada
                            .venda
                            .total
                        )}
                      </strong>

                    </div>

                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        marginBottom:
                          '14px',
                      }}
                    >

                      <span
                        style={{
                          color:
                            '#777',
                          fontSize:
                            '14px',
                        }}
                      >
                        Valor pago
                      </span>

                      <strong
                        style={{
                          color:
                            '#29945c',
                        }}
                      >
                        R${' '}
                        {formatarMoeda(
                          vendaSelecionada
                            .venda
                            .valor_pago
                        )}
                      </strong>

                    </div>

                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        paddingTop:
                          '14px',
                        borderTop:
                          '1px solid #f3e8ed',
                      }}
                    >

                      <span
                        style={{
                          color:
                            '#777',
                          fontSize:
                            '14px',
                        }}
                      >
                        Saldo restante
                      </span>

                      <strong
                        style={{
                          color:
                            Number(
                              vendaSelecionada
                                .venda
                                .saldo
                            ) > 0
                              ? '#df5f8d'
                              : '#29945c',
                          fontSize:
                            '18px',
                        }}
                      >
                        R${' '}
                        {formatarMoeda(
                          vendaSelecionada
                            .venda
                            .saldo
                        )}
                      </strong>

                    </div>

                  </section>

                  <section
                    style={{
                      background:
                        '#fff8fb',
                      borderRadius:
                        '18px',
                      padding:
                        '18px',
                      marginBottom:
                        '14px',
                      border:
                        '1px solid #f7dce7',
                    }}
                  >

                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'center',
                        gap:
                          '12px',
                      }}
                    >

                      <div>

                        <span
                          style={{
                            display:
                              'block',
                            color:
                              '#999',
                            fontSize:
                              '12px',
                            marginBottom:
                              '5px',
                          }}
                        >
                          Vencimento
                        </span>

                        <strong
                          style={{
                            color:
                              '#292329',
                            fontSize:
                              '16px',
                          }}
                        >
                          {formatarData(
                            vendaSelecionada
                              .venda
                              .vencimento
                          )}
                        </strong>

                      </div>

                      <span
                        style={{
                          padding:
                            '7px 11px',
                          borderRadius:
                            '20px',
                          background:
                            Number(
                              vendaSelecionada
                                .venda
                                .saldo
                            ) <= 0
                              ? '#eaf8f0'
                              : '#fff0f5',
                          color:
                            Number(
                              vendaSelecionada
                                .venda
                                .saldo
                            ) <= 0
                              ? '#29945c'
                              : '#df5f8d',
                          fontSize:
                            '11px',
                          fontWeight:
                            '700',
                        }}
                      >
                        {Number(
                          vendaSelecionada
                            .venda
                            .saldo
                        ) <= 0
                          ? 'QUITADO'
                          : 'EM ABERTO'}
                      </span>

                    </div>

                  </section>

                  {(vendaSelecionada.parcelas || []).length > 0 && (

                    <section
                      style={{
                        background: '#ffffff',
                        borderRadius: '18px',
                        padding: '18px',
                        marginBottom: '14px',
                        border: '1px solid #f0e0e7',
                      }}
                    >

                      <div
                        style={{
                          marginBottom: '14px',
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            color: '#999',
                            fontSize: '12px',
                            marginBottom: '4px',
                          }}
                        >
                          Parcelamento
                        </span>
                        <strong
                          style={{
                            color: '#292329',
                            fontSize: '16px',
                          }}
                        >
                          {vendaSelecionada.parcelas.length} parcela{vendaSelecionada.parcelas.length > 1 ? 's' : ''}
                        </strong>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        {vendaSelecionada.parcelas.map((parcela) => {
                          const valorParcela = Number(parcela.valor || 0)
                          const valorPagoParcela = Number(parcela.valor_pago || 0)
                          const saldoParcela = Math.max(valorParcela - valorPagoParcela, 0)
                          const quitada = saldoParcela <= 0

                          return (
                            <div
                              key={parcela.id}
                              style={{
                                padding: '13px',
                                borderRadius: '14px',
                                background: quitada ? '#f4fbf7' : '#fff8fb',
                                border: quitada ? '1px solid #d9efdf' : '1px solid #f7dce7',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '10px',
                                  marginBottom: '8px',
                                }}
                              >
                                <strong
                                  style={{
                                    color: '#292329',
                                    fontSize: '14px',
                                  }}
                                >
                                  Parcela {parcela.numero_parcela} de {parcela.total_parcelas}
                                </strong>

                                <span
                                  style={{
                                    padding: '5px 9px',
                                    borderRadius: '20px',
                                    background: quitada ? '#eaf8f0' : '#fff0f5',
                                    color: quitada ? '#29945c' : '#df5f8d',
                                    fontSize: '10px',
                                    fontWeight: '700',
                                  }}
                                >
                                  {quitada ? 'QUITADA' : 'EM ABERTO'}
                                </span>
                              </div>

                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr',
                                  gap: '8px',
                                }}
                              >
                                <div>
                                  <span
                                    style={{
                                      display: 'block',
                                      color: '#999',
                                      fontSize: '11px',
                                      marginBottom: '3px',
                                    }}
                                  >
                                    Valor
                                  </span>
                                  <strong
                                    style={{
                                      color: '#292329',
                                      fontSize: '13px',
                                    }}
                                  >
                                    R$ {formatarMoeda(valorParcela)}
                                  </strong>
                                </div>

                                <div>
                                  <span
                                    style={{
                                      display: 'block',
                                      color: '#999',
                                      fontSize: '11px',
                                      marginBottom: '3px',
                                    }}
                                  >
                                    Vencimento
                                  </span>
                                  <strong
                                    style={{
                                      color: '#292329',
                                      fontSize: '13px',
                                    }}
                                  >
                                    {formatarData(parcela.vencimento)}
                                  </strong>
                                </div>
                              </div>

                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginTop: '10px',
                                  paddingTop: '9px',
                                  borderTop: '1px solid rgba(0,0,0,0.06)',
                                }}
                              >
                                <span
                                  style={{
                                    color: '#777',
                                    fontSize: '11px',
                                  }}
                                >
                                  Saldo da parcela
                                </span>
                                <strong
                                  style={{
                                    color: quitada ? '#29945c' : '#df5f8d',
                                    fontSize: '13px',
                                  }}
                                >
                                  R$ {formatarMoeda(saldoParcela)}
                                </strong>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                    </section>

                  )}

                  {pagamentosVenda.length > 0 && (

                    <section
                      style={{
                        background: '#ffffff',
                        borderRadius: '18px',
                        padding: '18px',
                        marginBottom: '14px',
                        border: '1px solid #f0e0e7',
                      }}
                    >

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '14px',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              display: 'block',
                              color: '#999',
                              fontSize: '12px',
                              marginBottom: '4px',
                            }}
                          >
                            Histórico de pagamentos
                          </span>
                          <strong
                            style={{
                              color: '#292329',
                              fontSize: '16px',
                            }}
                          >
                            {pagamentosVenda.length} pagamento{pagamentosVenda.length > 1 ? 's' : ''}
                          </strong>
                        </div>
                      </div>

                      {pagamentosVenda.map((pagamento) => (
                        <div
                          key={pagamento.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px 0',
                            borderTop: '1px solid #f3e8ed',
                          }}
                        >
                          <div>
                            <strong
                              style={{
                                display: 'block',
                                color: '#292329',
                                fontSize: '14px',
                                marginBottom: '4px',
                              }}
                            >
                              R$ {formatarMoeda(pagamento.valor)}
                            </strong>
                            <span
                              style={{
                                color: '#999',
                                fontSize: '12px',
                              }}
                            >
                              {formatarData(pagamento.data_pagamento)}
                            </span>
                          </div>

                          <span
                            style={{
                              padding: '6px 10px',
                              borderRadius: '20px',
                              background: pagamento.forma_pagamento === 'PIX' ? '#eefaf5' : '#fff7e6',
                              color: pagamento.forma_pagamento === 'PIX' ? '#29945c' : '#b87900',
                              fontSize: '11px',
                              fontWeight: '700',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {pagamento.forma_pagamento === 'PIX' ? 'PIX' : 'ESPÉCIE'}
                          </span>
                        </div>
                      ))}

                    </section>

                  )}

                  {Number(
                    vendaSelecionada
                      .venda
                      .saldo
                  ) > 0 && (

                    <button
                      type="button"
                      onClick={
                        abrirFormularioPagamento
                      }
                      style={{
                        width:
                          '100%',
                        minHeight:
                          '52px',
                        border:
                          'none',
                        borderRadius:
                          '16px',
                        background:
                          '#df5f8d',
                        color:
                          '#ffffff',
                        fontSize:
                          '15px',
                        fontWeight:
                          '700',
                        cursor:
                          'pointer',
                        boxShadow:
                          '0 8px 20px rgba(223,95,141,0.22)',
                        marginBottom:
                          '20px',
                      }}
                    >
                      ＋ Registrar pagamento
                    </button>

                  )}

                  <button type="button" onClick={abrirConfirmacaoExcluirVenda} style={{ width: '100%', minHeight: '48px', marginTop: '4px', marginBottom: '24px', border: '1px solid #fecdd3', borderRadius: '15px', background: '#fff1f2', color: '#be123c', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                    🗑️ Excluir venda
                  </button>

                </>
              )}

          </main>

          {/* CONFIRMAÇÃO DE EXCLUSÃO DA VENDA */}
          {vendaParaExcluir && (
            <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget && !excluindoVenda) fecharConfirmacaoExcluirVenda() }}>
              <div className="modal" style={{ maxWidth: '440px' }}>
                <div style={{ width: '58px', height: '58px', margin: '0 auto 14px', borderRadius: '50%', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' }}>⚠️</div>
                <h2 style={{ margin: '0 0 10px', color: '#292329', textAlign: 'center' }}>Excluir esta venda?</h2>
                <p style={{ color: '#666', fontSize: '14px', lineHeight: 1.55, textAlign: 'center', margin: '0 0 16px' }}>Confirme apenas se tiver certeza. Esta ação é permanente e não poderá ser desfeita.</p>
                <div style={{ background: '#fff8fb', border: '1px solid #f7dce7', borderRadius: '14px', padding: '14px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}><span style={{ color: '#777', fontSize: '13px' }}>Cliente</span><strong style={{ color: '#292329', textAlign: 'right' }}>{vendaParaExcluir.cliente_nome || 'Cliente não informado'}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}><span style={{ color: '#777', fontSize: '13px' }}>Valor da venda</span><strong>R$ {formatarMoeda(vendaParaExcluir.total || 0)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}><span style={{ color: '#777', fontSize: '13px' }}>Pagamentos registrados</span><strong>R$ {formatarMoeda(vendaParaExcluir.valor_pago || 0)}</strong></div>
                </div>
                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', borderRadius: '13px', padding: '13px', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
                  <strong style={{ display: 'block', marginBottom: '5px' }}>O que acontecerá se excluir?</strong>
                  Os itens e as parcelas desta venda, assim como os pagamentos registrados no QuitaAí, serão removidos. As quantidades dos produtos serão devolvidas ao estoque. O histórico financeiro desta venda deixará de aparecer no sistema. <strong>Isso não desfaz pagamentos reais já feitos pela cliente.</strong> Confira os valores antes de continuar.
                </div>
                {erroExclusaoVenda && <div role="alert" style={{ color: '#9f1239', background: '#fff1f2', borderRadius: '12px', padding: '12px', fontSize: '13px', marginBottom: '14px' }}>{erroExclusaoVenda}</div>}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={fecharConfirmacaoExcluirVenda} disabled={excluindoVenda} style={{ flex: 1, minHeight: '46px', border: 'none', borderRadius: '12px', background: '#f7f3f5', color: '#666', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                  <button type="button" onClick={confirmarExclusaoVenda} disabled={excluindoVenda} style={{ flex: 1, minHeight: '46px', border: 'none', borderRadius: '12px', background: '#be123c', color: '#fff', fontWeight: 700, cursor: excluindoVenda ? 'wait' : 'pointer' }}>{excluindoVenda ? 'Excluindo...' : 'Sim, excluir venda'}</button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL PAGAMENTO */}

          {mostrarFormularioPagamento &&
            vendaSelecionada?.venda && (

            <div
              className="modal-overlay"
              onClick={(event) => {
                if (
                  event.target ===
                    event.currentTarget &&
                  !salvandoPagamento
                ) {
                  fecharFormularioPagamento()
                }
              }}
            >

              <div className="modal">

                <div className="modal-cabecalho">

                  <div>

                    <span className="saudacao">
                      Pagamento
                    </span>

                    <h2>
                      Registrar pagamento
                    </h2>

                  </div>

                  <button
                    className="modal-fechar"
                    type="button"
                    onClick={
                      fecharFormularioPagamento
                    }
                    disabled={
                      salvandoPagamento
                    }
                  >
                    ×
                  </button>

                </div>

                <form
                  className="formulario-produto"
                  onSubmit={
                    registrarPagamento
                  }
                >

                  <div
                    style={{
                      background:
                        '#fff8fb',
                      border:
                        '1px solid #f7dce7',
                      borderRadius:
                        '15px',
                      padding:
                        '15px',
                    }}
                  >

                    <span
                      style={{
                        display:
                          'block',
                        color:
                          '#999',
                        fontSize:
                          '12px',
                        marginBottom:
                          '5px',
                      }}
                    >
                      Cliente
                    </span>

                    <strong
                      style={{
                        display:
                          'block',
                        color:
                          '#292329',
                        fontSize:
                          '15px',
                        marginBottom:
                          '12px',
                      }}
                    >
                      {
                        vendaSelecionada
                          .venda
                          .cliente_nome
                      }
                    </strong>

                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'center',
                      }}
                    >

                      <span
                        style={{
                          color:
                            '#777',
                          fontSize:
                            '13px',
                        }}
                      >
                        Saldo atual
                      </span>

                      <strong
                        style={{
                          color:
                            '#df5f8d',
                          fontSize:
                            '17px',
                        }}
                      >
                        R${' '}
                        {formatarMoeda(
                          vendaSelecionada
                            .venda
                            .saldo
                        )}
                      </strong>

                    </div>

                  </div>

                  <div>
                    <span
                      style={{
                        display: 'block',
                        color: '#555',
                        fontSize: '13px',
                        fontWeight: '600',
                        marginBottom: '10px',
                      }}
                    >
                      Selecione a parcela
                    </span>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '9px',
                      }}
                    >
                      {(vendaSelecionada.parcelas || []).map((parcela) => {
                        const saldoParcela = Math.max(
                          Number(parcela.valor || 0) - Number(parcela.valor_pago || 0),
                          0
                        )
                        const quitada = saldoParcela <= 0
                        const selecionada =
                          String(formularioPagamento.parcela_id) ===
                          String(parcela.id)

                        return (
                          <button
                            key={parcela.id}
                            type="button"
                            disabled={quitada || salvandoPagamento}
                            onClick={() => {
                              if (quitada) return

                              setFormularioPagamento((anterior) => ({
                                ...anterior,
                                parcela_id: String(parcela.id),
                                valor: '',
                              }))
                              setErroPagamento('')
                            }}
                            style={{
                              width: '100%',
                              border: selecionada
                                ? '2px solid #df5f8d'
                                : quitada
                                  ? '1px solid #e4eee8'
                                  : '1px solid #eadfe4',
                              borderRadius: '15px',
                              padding: '13px 14px',
                              background: selecionada
                                ? '#fff5f8'
                                : quitada
                                  ? '#f6faf8'
                                  : '#ffffff',
                              cursor: quitada ? 'default' : 'pointer',
                              opacity: quitada ? 0.72 : 1,
                              textAlign: 'left',
                              boxShadow: selecionada
                                ? '0 6px 16px rgba(223,95,141,0.12)'
                                : 'none',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '10px',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '11px',
                                  minWidth: 0,
                                }}
                              >
                                <span
                                  style={{
                                    width: '34px',
                                    height: '34px',
                                    minWidth: '34px',
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: selecionada
                                      ? '#df5f8d'
                                      : quitada
                                        ? '#e7f2ec'
                                        : '#f8eef2',
                                    color: selecionada
                                      ? '#ffffff'
                                      : quitada
                                        ? '#29945c'
                                        : '#df5f8d',
                                    fontSize: '13px',
                                    fontWeight: '800',
                                  }}
                                >
                                  {quitada ? '✓' : parcela.numero_parcela}
                                </span>

                                <div>
                                  <strong
                                    style={{
                                      display: 'block',
                                      color: '#292329',
                                      fontSize: '13px',
                                      marginBottom: '3px',
                                    }}
                                  >
                                    Parcela {parcela.numero_parcela} de {parcela.total_parcelas}
                                  </strong>

                                  <span
                                    style={{
                                      display: 'block',
                                      color: '#999',
                                      fontSize: '11px',
                                    }}
                                  >
                                    Vence {formatarData(parcela.vencimento)}
                                  </span>
                                </div>
                              </div>

                              <div
                                style={{
                                  textAlign: 'right',
                                  flexShrink: 0,
                                }}
                              >
                                <span
                                  style={{
                                    display: 'block',
                                    color: '#999',
                                    fontSize: '10px',
                                    marginBottom: '2px',
                                  }}
                                >
                                  {quitada ? 'Status' : 'Saldo'}
                                </span>

                                <strong
                                  style={{
                                    color: quitada
                                      ? '#29945c'
                                      : selecionada
                                        ? '#df5f8d'
                                        : '#292329',
                                    fontSize: '13px',
                                  }}
                                >
                                  {quitada
                                    ? 'QUITADA'
                                    : `R$ ${formatarMoeda(saldoParcela)}`}
                                </strong>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <label>
                    Valor do pagamento

                    <input
                      type="number"
                      name="valor"
                      value={
                        formularioPagamento.valor
                      }
                      onChange={
                        alterarFormularioPagamento
                      }
                      step="0.01"
                      min="0.01"
                      max={
                        Number(vendaSelecionada?.venda?.saldo || 0) > 0
                          ? Number(vendaSelecionada.venda.saldo)
                          : undefined
                      }
                      placeholder="Digite o valor recebido"
                      required
                      autoFocus
                      autoComplete="off"
                      inputMode="decimal"
                    />
                  </label>

                  <label>
                    Data do pagamento

                    <input
                      type="date"
                      name="data_pagamento"
                      value={
                        formularioPagamento.data_pagamento
                      }
                      onChange={
                        alterarFormularioPagamento
                      }
                      required
                    />
                  </label>

                  <div>
                    <span
                      style={{
                        display: 'block',
                        color: '#555',
                        fontSize: '13px',
                        fontWeight: '600',
                        marginBottom: '9px',
                      }}
                    >
                      Forma de pagamento
                    </span>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                      }}
                    >
                      {[
                        {
                          valor: 'PIX',
                          texto: 'PIX',
                          descricao: 'Pagamento instantâneo',
                          icone: (
                            <svg
                              width="25"
                              height="25"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M7.05 3.5 12 8.45l4.95-4.95a3.05 3.05 0 0 1 4.31 4.31L16.31 12l4.95 4.19a3.05 3.05 0 0 1-4.31 4.31L12 15.55l-4.95 4.95a3.05 3.05 0 0 1-4.31-4.31L7.69 12 2.74 7.81A3.05 3.05 0 0 1 7.05 3.5Z"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ),
                        },
                        {
                          valor: 'ESPECIE',
                          texto: 'Espécie',
                          descricao: 'Dinheiro em mãos',
                          icone: (
                            <svg
                              width="25"
                              height="25"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <rect
                                x="2.5"
                                y="5.5"
                                width="19"
                                height="13"
                                rx="2.5"
                                stroke="currentColor"
                                strokeWidth="1.7"
                              />
                              <circle
                                cx="12"
                                cy="12"
                                r="2.8"
                                stroke="currentColor"
                                strokeWidth="1.7"
                              />
                              <path
                                d="M6 9h.01M18 15h.01"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                              />
                            </svg>
                          ),
                        },
                      ].map((opcao) => {
                        const selecionado =
                          formularioPagamento.forma_pagamento === opcao.valor

                        return (
                          <label
                            key={opcao.valor}
                            style={{
                              position: 'relative',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              minHeight: '112px',
                              padding: '15px',
                              borderRadius: '17px',
                              border: selecionado
                                ? '2px solid #df5f8d'
                                : '1px solid #eadce2',
                              background: selecionado
                                ? 'linear-gradient(145deg, #fff5f8 0%, #fffafd 100%)'
                                : '#ffffff',
                              boxShadow: selecionado
                                ? '0 8px 20px rgba(223, 95, 141, 0.12)'
                                : '0 4px 12px rgba(41, 35, 41, 0.04)',
                              cursor: 'pointer',
                              boxSizing: 'border-box',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <input
                              type="radio"
                              name="forma_pagamento"
                              value={opcao.valor}
                              checked={selecionado}
                              onChange={alterarFormularioPagamento}
                              style={{
                                position: 'absolute',
                                opacity: 0,
                                pointerEvents: 'none',
                              }}
                            />

                            <span
                              style={{
                                width: '43px',
                                height: '43px',
                                borderRadius: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: selecionado
                                  ? '#df5f8d'
                                  : '#f8f1f4',
                                color: selecionado
                                  ? '#ffffff'
                                  : '#8e7b84',
                                marginBottom: '11px',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              {opcao.icone}
                            </span>

                            <strong
                              style={{
                                color: '#292329',
                                fontSize: '14px',
                                fontWeight: '700',
                                lineHeight: '1.2',
                              }}
                            >
                              {opcao.texto}
                            </strong>

                            <span
                              style={{
                                color: '#9a8e94',
                                fontSize: '11px',
                                marginTop: '4px',
                              }}
                            >
                              {opcao.descricao}
                            </span>

                            {selecionado && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: '11px',
                                  right: '11px',
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: '#df5f8d',
                                  color: '#ffffff',
                                  fontSize: '13px',
                                  fontWeight: '800',
                                }}
                              >
                                ✓
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {erroPagamento && (
                    <div
                      style={{
                        background:
                          '#fff1f1',
                        border:
                          '1px solid #f3cccc',
                        borderRadius:
                          '12px',
                        padding:
                          '12px',
                        color:
                          '#d9534f',
                        fontSize:
                          '13px',
                        lineHeight:
                          '1.4',
                      }}
                    >
                      {
                        erroPagamento
                      }
                    </div>
                  )}

                  <button
                    className="botao-salvar"
                    type="submit"
                    disabled={
                      salvandoPagamento
                    }
                  >
                    {salvandoPagamento
                      ? 'Registrando...'
                      : 'Registrar pagamento'}
                  </button>

                </form>

              </div>

            </div>

          )}

        </>
      )}

      {/* =====================================================
          MODAL NOVA VENDA
      ===================================================== */}

      {mostrarFormularioVenda && (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !salvandoVenda
            ) {
              fecharFormularioVenda()
            }
          }}
        >

          <div
            className="modal"
            style={{
              maxHeight:
                'calc(100vh - 40px)',
              overflowY:
                'auto',
            }}
          >

            <div className="modal-cabecalho">

              <div>

                <span className="saudacao">
                  Vendas
                </span>

                <h2>
                  Nova venda
                </h2>

              </div>

              <button
                className="modal-fechar"
                type="button"
                onClick={
                  fecharFormularioVenda
                }
                disabled={
                  salvandoVenda
                }
              >
                ×
              </button>

            </div>

            <form
              className="formulario-produto"
              onSubmit={
                salvarVenda
              }
            >

              {/* CLIENTE */}

              <label>
                Cliente

                <select
                  name="cliente_id"
                  value={
                    formularioVenda.cliente_id
                  }
                  onChange={
                    alterarFormularioVenda
                  }
                  required
                  style={{
                    width:
                      '100%',
                    minHeight:
                      '46px',
                    border:
                      '1px solid #eadde3',
                    borderRadius:
                      '12px',
                    padding:
                      '0 12px',
                    background:
                      '#ffffff',
                    color:
                      '#292329',
                    fontSize:
                      '14px',
                  }}
                >
                  <option value="">
                    Selecione o cliente
                  </option>

                  {clientes.map(
                    (cliente) => (
                      <option
                        key={
                          cliente.id
                        }
                        value={
                          cliente.id
                        }
                      >
                        {
                          cliente.nome
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              {clientes.length === 0 && (
                <div
                  style={{
                    background:
                      '#fff8fb',
                    border:
                      '1px solid #f7dce7',
                    borderRadius:
                      '12px',
                    padding:
                      '12px',
                    color:
                      '#777',
                    fontSize:
                      '13px',
                  }}
                >
                  Nenhum cliente
                  cadastrado. Cadastre
                  um cliente antes de
                  criar uma venda.
                </div>
              )}

              {/* DATA E PRAZO */}

              <div className="formulario-duplo">

                <label>
                  Data da compra

                  <input
                    type="date"
                    name="data_compra"
                    value={
                      formularioVenda.data_compra
                    }
                    onChange={
                      alterarFormularioVenda
                    }
                    required
                  />
                </label>

                <label>
                  Primeiro vencimento

                  <input
                    type="date"
                    name="data_vencimento"
                    value={
                      formularioVenda.data_vencimento
                    }
                    onChange={
                      alterarFormularioVenda
                    }
                    min={
                      formularioVenda.data_compra ||
                      undefined
                    }
                    required
                  />

                  <span
                    style={{
                      display: 'block',
                      marginTop: '6px',
                      color: '#999',
                      fontSize: '12px',
                      lineHeight: '1.4',
                    }}
                  >
                    A revendedora escolhe a data do primeiro vencimento.
                  </span>
                </label>

              </div>

              {/* PARCELAMENTO */}

              <label>
                Número de parcelas

                <select
                  name="total_parcelas"
                  value={
                    formularioVenda.total_parcelas
                  }
                  onChange={
                    alterarFormularioVenda
                  }
                  required
                  style={{
                    width: '100%',
                    minHeight: '46px',
                    border: '1px solid #eadde3',
                    borderRadius: '12px',
                    padding: '0 12px',
                    background: '#ffffff',
                    color: '#292329',
                    fontSize: '14px',
                  }}
                >
                  <option value="1">1 parcela</option>
                  <option value="2">2 parcelas</option>
                  <option value="3">3 parcelas</option>
                </select>

                <span
                  style={{
                    display: 'block',
                    marginTop: '6px',
                    color: '#999',
                    fontSize: '12px',
                    lineHeight: '1.4',
                  }}
                >
                  As próximas parcelas vencem mensalmente na mesma data.
                </span>
              </label>

              {/* PRODUTO */}

              <div
                style={{
                  background:
                    '#fff8fb',
                  border:
                    '1px solid #f7dce7',
                  borderRadius:
                    '16px',
                  padding:
                    '16px',
                }}
              >

                <strong
                  style={{
                    display:
                      'block',
                    color:
                      '#292329',
                    fontSize:
                      '15px',
                    marginBottom:
                      '14px',
                  }}
                >
                  Produtos da venda
                </strong>

                <label>
                  Produto

                  <select
                    name="produto_id"
                    value={
                      itemVenda.produto_id
                    }
                    onChange={
                      alterarItemVenda
                    }
                    style={{
                      width:
                        '100%',
                      minHeight:
                        '46px',
                      border:
                        '1px solid #eadde3',
                      borderRadius:
                        '12px',
                      padding:
                        '0 12px',
                      background:
                        '#ffffff',
                      color:
                        '#292329',
                      fontSize:
                        '14px',
                    }}
                  >
                    <option value="">
                      Selecione o produto
                    </option>

                    {produtos.map(
                      (produto) => (
                        <option
                          key={
                            produto.id
                          }
                          value={
                            produto.id
                          }
                          disabled={
                            Number(
                              produto.estoque
                            ) <= 0
                          }
                        >
                          {
                            produto.nome
                          }{' '}
                          — R${' '}
                          {formatarMoeda(
                            produto.preco_venda
                          )}{' '}
                          — estoque:{' '}
                          {
                            produto.estoque
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>

                <div
                  style={{
                    display:
                      'flex',
                    gap:
                      '10px',
                    alignItems:
                      'flex-end',
                    marginTop:
                      '12px',
                  }}
                >

                  <label
                    style={{
                      flex:
                        '1',
                    }}
                  >
                    Quantidade

                    <input
                      type="number"
                      name="quantidade"
                      value={
                        itemVenda.quantidade
                      }
                      onChange={
                        alterarItemVenda
                      }
                      min="1"
                      step="1"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={
                      adicionarItemNovaVenda
                    }
                    style={{
                      minHeight:
                        '46px',
                      border:
                        'none',
                      borderRadius:
                        '12px',
                      padding:
                        '0 16px',
                      background:
                        '#df5f8d',
                      color:
                        '#ffffff',
                      fontWeight:
                        '700',
                      cursor:
                        'pointer',
                      whiteSpace:
                        'nowrap',
                    }}
                  >
                    + Adicionar
                  </button>

                </div>

              </div>

              {/* ITENS ADICIONADOS */}

              {itensNovaVenda.length > 0 && (
                <div>

                  <span
                    style={{
                      display:
                        'block',
                      color:
                        '#777',
                      fontSize:
                        '13px',
                      marginBottom:
                        '8px',
                    }}
                  >
                    Itens adicionados
                  </span>

                  {itensNovaVenda.map(
                    (item) => (

                      <div
                        key={
                          item.produto_id
                        }
                        style={{
                          display:
                            'flex',
                          justifyContent:
                            'space-between',
                          alignItems:
                            'center',
                          gap:
                            '12px',
                          background:
                            '#ffffff',
                          border:
                            '1px solid #f0e5ea',
                          borderRadius:
                            '14px',
                          padding:
                            '12px',
                          marginBottom:
                            '8px',
                        }}
                      >

                        <div>

                          <strong
                            style={{
                              display:
                                'block',
                              color:
                                '#292329',
                              fontSize:
                                '14px',
                            }}
                          >
                            {
                              item.produto_nome
                            }
                          </strong>

                          <span
                            style={{
                              display:
                                'block',
                              color:
                                '#999',
                              fontSize:
                                '12px',
                              marginTop:
                                '4px',
                            }}
                          >
                            {item.quantidade}{' '}
                            x R${' '}
                            {formatarMoeda(
                              item.preco_unitario
                            )}
                          </span>

                        </div>

                        <div
                          style={{
                            display:
                              'flex',
                            alignItems:
                              'center',
                            gap:
                              '10px',
                          }}
                        >

                          <strong
                            style={{
                              color:
                                '#df5f8d',
                              fontSize:
                                '14px',
                            }}
                          >
                            R${' '}
                            {formatarMoeda(
                              item.subtotal
                            )}
                          </strong>

                          <button
                            type="button"
                            onClick={() =>
                              removerItemNovaVenda(
                                item.produto_id
                              )
                            }
                            style={{
                              border:
                                'none',
                              width:
                                '32px',
                              height:
                                '32px',
                              borderRadius:
                                '10px',
                              background:
                                '#fff1f1',
                              color:
                                '#d9534f',
                              cursor:
                                'pointer',
                            }}
                          >
                            ×
                          </button>

                        </div>

                      </div>

                    )
                  )}

                  <div
                    style={{
                      display:
                        'flex',
                      justifyContent:
                        'space-between',
                      paddingTop:
                        '12px',
                      marginTop:
                        '4px',
                      borderTop:
                        '1px solid #f3e8ed',
                    }}
                  >

                    <strong>
                      Total da venda
                    </strong>

                    <strong
                      style={{
                        color:
                          '#df5f8d',
                        fontSize:
                          '18px',
                      }}
                    >
                      R${' '}
                      {formatarMoeda(
                        calcularTotalNovaVenda()
                      )}
                    </strong>

                  </div>

                </div>
              )}

              {erroFormularioVenda && (
                <div
                  style={{
                    background:
                      '#fff1f1',
                    border:
                      '1px solid #f3cccc',
                    borderRadius:
                      '12px',
                    padding:
                      '12px',
                    color:
                      '#d9534f',
                    fontSize:
                      '13px',
                    lineHeight:
                      '1.4',
                  }}
                >
                  {
                    erroFormularioVenda
                  }
                </div>
              )}

              <button
                className="botao-salvar"
                type="submit"
                disabled={
                  salvandoVenda ||
                  clientes.length === 0 ||
                  produtos.length === 0
                }
              >
                {salvandoVenda
                  ? 'Cadastrando venda...'
                  : 'Cadastrar venda'}
              </button>

            </form>

          </div>

        </div>
      )}

      {tela === 'mais' && (
        <>
          <header className="topo">
            <div>
              <span className="saudacao">QuitaAí</span>
              <h1>{subTelaMais === 'conta' ? 'Minha conta' : subTelaMais === 'configuracoes' ? 'Configurações' : 'Mais opções'}</h1>
            </div>
          </header>

          <main className="conteudo">
            {subTelaMais === 'menu' && (
              <section className="secao">
                <div style={{ marginBottom: '18px' }}>
                  <h2 style={{ marginBottom: '6px' }}>Sua conta</h2>
                  <p style={{ color: '#777', fontSize: '14px', margin: 0 }}>
                    Acesse seus dados e personalize algumas opções do aplicativo.
                  </p>
                </div>

                {[{
                  titulo: 'Minha conta',
                  descricao: 'Consulte os dados da sua conta',
                  simbolo: '👤',
                  acao: () => setSubTelaMais('conta'),
                }, {
                  titulo: 'Configurações',
                  descricao: 'Ajuste as preferências do aplicativo',
                  simbolo: '⚙️',
                  acao: () => setSubTelaMais('configuracoes'),
                }].map((item) => (
                  <button
                    key={item.titulo}
                    type="button"
                    onClick={item.acao}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                      minHeight: '68px', marginBottom: '10px', padding: '14px 16px',
                      border: '1px solid #f0dce3', borderRadius: '14px', background: '#fff',
                      color: '#42333a', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: '23px' }}>{item.simbolo}</span>
                    <span style={{ flex: 1 }}>
                      <strong style={{ display: 'block', marginBottom: '4px' }}>{item.titulo}</strong>
                      <span style={{ color: '#777', fontSize: '13px' }}>{item.descricao}</span>
                    </span>
                    <span style={{ color: '#c85b83', fontSize: '22px' }}>›</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={sairDaConta}
                  style={{
                    width: '100%', minHeight: '50px', marginTop: '8px',
                    border: '1px solid #f0cbd7', borderRadius: '14px', background: '#fff1f5',
                    color: '#c43f6d', fontSize: '15px', fontWeight: 700,
                    cursor: 'pointer', padding: '14px 16px', textAlign: 'left',
                  }}
                >
                  ↪ Sair da conta
                </button>
              </section>
            )}

            {subTelaMais === 'conta' && (
              <section className="secao">
                <button type="button" onClick={() => setSubTelaMais('menu')} style={{ border: 0, background: 'transparent', color: '#c43f6d', padding: '0 0 18px', cursor: 'pointer', fontWeight: 700 }}>
                  ← Voltar para Mais opções
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '22px' }}>
                  <div style={{ width: '58px', height: '58px', borderRadius: '50%', background: '#ffe6ef', display: 'grid', placeItems: 'center', fontSize: '27px' }}>👤</div>
                  <div>
                    <h2 style={{ margin: '0 0 5px' }}>{usuarioSalvo.nome || usuarioSalvo.name || 'Minha conta QuitaAí'}</h2>
                    <p style={{ margin: 0, color: '#777', fontSize: '14px' }}>{usuarioSalvo.email || 'E-mail não disponível'}</p>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #f1e4e9' }}>
                  <div style={{ padding: '15px 0', borderBottom: '1px solid #f1e4e9' }}>
                    <span style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '5px' }}>Nome</span>
                    <strong>{usuarioSalvo.nome || usuarioSalvo.name || 'Não informado'}</strong>
                  </div>
                  <div style={{ padding: '15px 0', borderBottom: '1px solid #f1e4e9' }}>
                    <span style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '5px' }}>E-mail</span>
                    <strong>{usuarioSalvo.email || 'Não informado'}</strong>
                  </div>
                </div>
                <p style={{ color: '#777', fontSize: '13px', lineHeight: 1.5, marginTop: '18px' }}>
                  Para manter seus dados protegidos, saia da conta quando terminar de usar o aplicativo em um dispositivo compartilhado.
                </p>
              </section>
            )}

            {subTelaMais === 'configuracoes' && (
              <section
                className="secao quitai-configuracoes"
                style={{
                  width: '100%',
                  maxWidth: '780px',
                  boxSizing: 'border-box',
                  margin: '0 auto',
                  padding: '24px clamp(18px, 4vw, 32px)',
                  textAlign: 'left',
                  background: temaEfetivo === 'escuro' ? '#19181f' : temaEfetivo === 'rosa' ? '#fff5f9' : '#ffffff',
                  border: temaEfetivo === 'escuro' ? '1px solid #39323d' : '1px solid #f4e3eb',
                  borderRadius: '20px',
                  boxShadow: temaEfetivo === 'escuro' ? '0 8px 24px rgba(0, 0, 0, 0.18)' : '0 8px 24px rgba(111, 45, 77, 0.045)',
                }}
              >
                <style>{`
                  .quitai-configuracoes h2 { color: ${temaEfetivo === 'escuro' ? '#f7edf2' : '#382530'} !important; }
                  .quitai-configuracoes button:focus:not(:focus-visible) { outline: none !important; }
                  .quitai-configuracoes .config-opcao { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
                  .quitai-configuracoes .config-texto { min-width: 0; flex: 1; }
                  .quitai-configuracoes .config-descricao { display: block; color: ${temaEfetivo === 'escuro' ? '#c8bdc8' : '#786873'}; font-size: 14px; line-height: 1.55; }
                  .quitai-configuracoes .config-divisor { border-top: 1px solid ${temaEfetivo === 'escuro' ? '#39323d' : '#f0e1e8'}; }
                  @media (max-width: 520px) {
                    .quitai-configuracoes { padding: 20px 16px !important; border-radius: 16px !important; }
                    .quitai-configuracoes .config-opcao { gap: 12px; }
                    .quitai-configuracoes .config-descricao { font-size: 13px; }
                  }
                `}</style>

                <button
                  type="button"
                  onClick={() => setSubTelaMais('menu')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: '0',
                    borderRadius: '999px',
                    background: temaEfetivo === 'escuro' ? '#fbeaf2' : '#fff0f6',
                    color: '#bd2f70',
                    padding: '10px 14px',
                    marginBottom: '22px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '14px',
                  }}
                >
                  ← Voltar para Mais opções
                </button>

                <div style={{ marginBottom: '22px' }}>
                  <span style={{
                    display: 'inline-block',
                    color: '#c13b78',
                    fontSize: '12px',
                    fontWeight: 800,
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                    marginBottom: '7px',
                  }}>
                    PERSONALIZAÇÃO
                  </span>
                  <h2 style={{ margin: '0 0 8px', color: '#382530', fontSize: '25px', lineHeight: 1.2 }}>
                    Preferências
                  </h2>
                  <p style={{ color: '#786873', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                    Escolha como o aplicativo deve se comportar neste dispositivo.
                  </p>
                </div>

                <div className="config-divisor" />

                <label className="config-opcao" style={{ padding: '20px 0', cursor: 'pointer' }}>
                  <span className="config-texto">
                    <strong style={{ display: 'block', color: temaEfetivo === 'escuro' ? '#f7edf2' : '#382530', fontSize: '16px', marginBottom: '6px' }}>
                      Confirmar antes de sair
                    </strong>
                    <span className="config-descricao">
                      Evita encerrar a sessão por toque acidental.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={confirmarSaida}
                    onChange={(evento) => {
                      const ativado = evento.target.checked
                      setConfirmarSaida(ativado)
                      localStorage.setItem('quitai_confirmar_saida', String(ativado))
                    }}
                    aria-label="Confirmar antes de sair"
                    style={{
                      width: '21px',
                      height: '21px',
                      accentColor: '#d94f88',
                      flexShrink: 0,
                      cursor: 'pointer',
                    }}
                  />
                </label>

                <div className="config-divisor" />

                <div style={{ padding: '20px 0' }}>
                  <div style={{ marginBottom: '14px' }}>
                    <strong style={{ display: 'block', color: temaEfetivo === 'escuro' ? '#f7edf2' : '#382530', fontSize: '16px', marginBottom: '6px' }}>Aparência</strong>
                    <span className="config-descricao">Escolha o tema mais confortável para você.</span>
                  </div>
                  <div className="config-temas" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                    {[
                      { id: 'rosa', nome: 'Rosa', simbolo: '✦', detalhe: 'Rosa-claro' },
                      { id: 'claro', nome: 'Claro', simbolo: '☀', detalhe: 'Branco e leve' },
                      { id: 'escuro', nome: 'Escuro', simbolo: '☾', detalhe: 'Conforto noturno' },
                      { id: 'automatico', nome: 'Automático', simbolo: '◐', detalhe: 'Segue o dispositivo' },
                    ].map((opcao) => {
                      const selecionado = temaAtual === opcao.id
                      return (
                        <button key={opcao.id} type="button" className="config-tema-opcao" aria-pressed={selecionado}
                          onClick={() => { setTemaAtual(opcao.id); localStorage.setItem('quitai_tema', opcao.id) }}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', minWidth: 0,
                            padding: '12px', borderRadius: '13px', cursor: 'pointer',
                            border: selecionado ? '1px solid #e45b98' : temaEfetivo === 'escuro' ? '1px solid #49414d' : '1px solid #f0dce5',
                            background: temaEfetivo === 'escuro' ? (selecionado ? '#49263b' : '#292730') : (selecionado ? '#ffe3ef' : '#fffafd'),
                            color: temaEfetivo === 'escuro' ? '#f8edf3' : '#49313e', boxShadow: selecionado ? '0 0 0 1px rgba(228,91,152,0.10)' : 'none' }}>
                          <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: '34px', height: '34px', flexShrink: 0,
                            borderRadius: '10px', background: opcao.id === 'escuro' ? '#292831' : '#f9dce8',
                            color: opcao.id === 'escuro' ? '#ff9fc2' : '#b83270', fontSize: '18px' }}>{opcao.simbolo}</span>
                          <span style={{ minWidth: 0 }}>
                            <strong style={{ display: 'block', fontSize: '13px', marginBottom: '3px' }}>{opcao.nome}</strong>
                            <span style={{ display: 'block', fontSize: '11px', lineHeight: 1.35, opacity: 0.8 }}>{opcao.detalhe}</span>
                          </span>
                          {selecionado && <span aria-hidden="true" style={{ marginLeft: 'auto', color: '#c13b78', fontWeight: 800 }}>✓</span>}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px', padding: '13px 14px',
                    background: temaEfetivo === 'escuro' ? '#29242e' : temaEfetivo === 'rosa' ? '#ffe3ef' : '#fff4f8',
                    border: temaEfetivo === 'escuro' ? '1px solid #514354' : '1px solid #f4dce7', borderRadius: '13px' }}>
                    <span aria-hidden="true" style={{ width: '34px', height: '34px', borderRadius: '10px',
                      background: temaEfetivo === 'escuro' ? '#403044' : '#f9dce8', color: '#b83270',
                      display: 'grid', placeItems: 'center', fontSize: '18px', flexShrink: 0 }}>
                      {temaEfetivo === 'escuro' ? '☾' : temaEfetivo === 'rosa' ? '✦' : '☀'}
                    </span>
                    <span style={{ color: temaEfetivo === 'escuro' ? '#f0e8ee' : '#765c6a', fontSize: '13px', lineHeight: 1.5 }}>
                      {temaAtual === 'automatico'
                        ? `Tema automático ativo: aparência ${temaEfetivo === 'escuro' ? 'escura' : 'clara'} conforme seu dispositivo.`
                        : `Tema ${temaAtual === 'escuro' ? 'escuro' : temaAtual === 'rosa' ? 'rosa' : 'claro'} ativo. Sua escolha fica salva neste dispositivo.`}
                    </span>
                  </div>
                </div>

                <div className="config-divisor" />

                <div style={{ paddingTop: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '34px',
                      height: '34px',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '10px',
                      background: '#fff0f6',
                      color: '#b83270',
                      fontSize: '17px',
                      flexShrink: 0,
                    }}>♧</span>
                      <strong style={{ color: '#382530', fontSize: '16px' }}>Notificações</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotificacoesAbertas(true)}
                      style={{
                        border: '1px solid #f0c4d7', background: '#fff0f6', color: '#b83270',
                        borderRadius: '10px', padding: '9px 12px', fontSize: '13px', fontWeight: 700,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      Ver avisos
                    </button>
                  </div>
                  <p style={{ color: '#786873', fontSize: '14px', lineHeight: 1.65, margin: 0 }}>
                    Consulte os avisos sobre vencimentos próximos e pagamentos atrasados.
                  </p>
                </div>
              </section>
            )}
          </main>
        </>
      )}

      {/* =====================================================
          NAVEGAÇÃO INFERIOR
      ===================================================== */}

      <style>{`
        .navegacao .nav-item:focus:not(:focus-visible) { outline: none !important; box-shadow: none !important; }
        .navegacao .nav-item:focus-visible { outline: 2px solid #d94f88; outline-offset: 2px; }
      `}</style>

      <nav className="navegacao">

        <button
          className={`nav-item ${
            tela === 'inicio'
              ? 'ativo'
              : ''
          }`}
          type="button"
          onClick={() =>
            setTela('inicio')
          }
        >
          <span>
            ⌂
          </span>

          Início
        </button>

        <button
          className={`nav-item ${
            tela === 'vendas' ||
            tela ===
              'detalhes-venda'
              ? 'ativo'
              : ''
          }`}
          type="button"
          onClick={() => {
            setVendaSelecionada(
              null
            )
            setErroDetalhesVenda(
              ''
            )
            setAbaVendas('abertas')
            setTela('vendas')
          }}
        >
          <span>
            🛒
          </span>

          Vendas
        </button>

        <button
          className={`nav-item ${
            tela === 'clientes'
              ? 'ativo'
              : ''
          }`}
          type="button"
          onClick={() =>
            setTela('clientes')
          }
        >
          <span>
            👥
          </span>

          Clientes
        </button>

        <button
          className={`nav-item ${
            tela === 'produtos'
              ? 'ativo'
              : ''
          }`}
          type="button"
          onClick={() =>
            setTela('produtos')
          }
        >
          <span>
            📦
          </span>

          Produtos
        </button>

        <button
          className={`nav-item ${tela === 'mais' ? 'ativo' : ''}`}
          type="button"
          onClick={() => setTela('mais')}
        >
          <span>
            ☰
          </span>

          Mais
        </button>

      </nav>

    </div>
  )
}

export default App