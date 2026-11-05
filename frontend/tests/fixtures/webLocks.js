// Test-only LockManager: separate callers share one queue per name.
export function instalarWebLocks() {
  const persistencia = instalarIndexedDB()

  const filas = new Map()
  const locks = { persistencia,
    request(nome, opcoes, executar) {
      return new Promise((resolve, reject) => {
        const fila = filas.get(nome) || []
        filas.set(nome, fila)
        const entrada = { executar, resolve, reject, signal: opcoes.signal }
        const abortar = () => {
          const i = fila.indexOf(entrada)
          if (i >= 0 && !entrada.ativa) {
            fila.splice(i, 1)
            reject(new DOMException('aborted', 'AbortError'))
          }
        }
        entrada.abortar = abortar
        if (entrada.signal?.aborted) { reject(new DOMException('aborted', 'AbortError')); return }
        entrada.signal?.addEventListener('abort', abortar, { once: true })
        fila.push(entrada)
        if (fila.length === 1) queueMicrotask(() => proxima(nome))
      })
    },
  }
  function proxima(nome) {
    const fila = filas.get(nome)
    const entrada = fila?.[0]
    if (!entrada || entrada.ativa) return
    entrada.ativa = true
    entrada.signal?.removeEventListener('abort', entrada.abortar)
    Promise.resolve().then(() => entrada.executar({ name: nome, mode: 'exclusive' }))
      .then(entrada.resolve, entrada.reject).finally(() => {
        fila.shift()
        if (fila.length) proxima(nome)
        else filas.delete(nome)
      })
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } })
  return locks
}

// Unit-only IndexedDB subset. Native transactions are exercised by browser tests.
function instalarIndexedDB() {
  const registros = new Map()
  const controle = { falharCommit: null, commits: [] }
  const indexedDB = {
    open() {
      const request = {}
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          close() {},
          transaction() {
            const escrituras = new Map()
            let abortada = false
            const tx = {
              abort() { abortada = true; queueMicrotask(() => tx.onabort?.()) },
              objectStore() { return {
                put(value, key) { escrituras.set(key, structuredClone(value)); return {} },
                get(key) {
                  const r = {}
                  queueMicrotask(() => {
                    if (abortada) return
                    r.result = registros.has(key) ? structuredClone(registros.get(key)) : undefined
                    r.onsuccess?.()
                    queueMicrotask(() => {
                      if (abortada) return
                      const modo = [...escrituras.values()].map(v => controle.falharCommit?.(v)).find(Boolean)
                      if (modo) {
                        tx.error = new DOMException('simulated async commit failure', 'UnknownError')
                        if (modo === 'error') tx.onerror?.()
                        else tx.onabort?.()
                        return
                      }
                      for (const [k,v] of escrituras) { registros.set(k,v); controle.commits.push(structuredClone(v)) }
                      tx.oncomplete?.()
                    })
                  })
                  return r
                },
              } },
            }
            return tx
          },
        }
        request.onsuccess?.()
      })
      return request
    },
  }
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDB })
  return controle
}
