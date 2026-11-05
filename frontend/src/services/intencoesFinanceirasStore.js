// A single durable store is used by every participating tab. No memory fallback.
export function transacionarIntencao(chave, executar) {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Armazenamento coordenado indisponivel (IndexedDB). O envio financeiro foi bloqueado; preserve as pendencias.'))
  return new Promise((resolve, reject) => {
    let db, tx, resultado, encerrada = false
    const timer = setTimeout(() => falhar(), 5000)
    function falhar(erro) {
      if (encerrada) return
      encerrada = true
      clearTimeout(timer)
      try { tx?.abort() } catch { /* already finished */ }
      db?.close()
      reject(erro || new Error('Nao foi possivel persistir a intencao financeira. Preserve a pendencia e reabra o formulario.'))
    }
    let abertura
    try { abertura = indexedDB.open('quitai-intencoes-financeiras', 1) }
    catch { falhar(); return }
    abertura.onerror = () => falhar()
    abertura.onblocked = () => falhar()
    abertura.onupgradeneeded = () => {
      if (!abertura.result.objectStoreNames.contains('intencoes')) abertura.result.createObjectStore('intencoes')
    }
    abertura.onsuccess = () => {
      db = abertura.result
      if (encerrada) { db.close(); return }
      try {
        // Overlapping readwrite transactions are serialized by IndexedDB itself.
        tx = db.transaction('intencoes', 'readwrite', { durability: 'strict' })
        tx.onabort = () => falhar()
        tx.onerror = () => falhar()
        tx.oncomplete = () => {
          if (encerrada) return
          encerrada = true
          clearTimeout(timer)
          db.close()
          resolve(resultado)
        }
        const store = tx.objectStore('intencoes')
        const leitura = store.get(chave)
        leitura.onsuccess = () => {
          try {
            resultado = executar(leitura.result, registro => store.put(registro, chave))
            if (resultado?.then) throw new Error('Atualizacao financeira local deve ser sincrona.')
          } catch (erro) { falhar(erro) }
        }
      } catch { falhar() }
    }
  })
}
