import type { PluginToUI, UIToPlugin, VariableInfo } from '../types'

// State
let allVariables: VariableInfo[] = []
let values: Record<string, string> = {}
let hasTextLayer = false
let currentCollection = ''
let searchQuery = ''

// DOM refs
const statusEl = document.getElementById('status')!
const statusTextEl = document.getElementById('status-text')!
const loadingEl = document.getElementById('loading')!
const emptyEl = document.getElementById('empty')!
const listEl = document.getElementById('list')!
const footerEl = document.getElementById('footer')!
const searchEl = document.getElementById('search') as HTMLInputElement
const collectionFilterEl = document.getElementById('collection-filter') as HTMLSelectElement
const errorToastEl = document.getElementById('error-toast')!

let errorTimer: ReturnType<typeof setTimeout> | null = null

function send(msg: UIToPlugin) {
  parent.postMessage({ pluginMessage: msg }, '*')
}

// Receive messages from plugin code
window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage as PluginToUI
  if (!msg) return

  switch (msg.type) {
    case 'VARIABLES_LOADED': {
      allVariables = msg.variables
      loadingEl.style.display = 'none'

      // Populate collection filter
      collectionFilterEl.innerHTML = '<option value="">All collections</option>'
      for (const name of msg.collections) {
        const opt = document.createElement('option')
        opt.value = name
        opt.textContent = name
        collectionFilterEl.appendChild(opt)
      }

      renderList()

      // Request values for all variables
      if (allVariables.length > 0) {
        send({ type: 'GET_VARIABLE_VALUES', keys: allVariables.map((v) => v.key) })
      }
      break
    }

    case 'VARIABLE_VALUES': {
      // Merge incoming values and update rows in place
      Object.assign(values, msg.values)
      updateValueCells(msg.values)
      break
    }

    case 'SELECTION_CHANGED': {
      hasTextLayer = msg.hasTextLayer
      updateStatus(msg.hasTextLayer, msg.count)
      updateApplyButtons()
      break
    }

    case 'APPLY_SUCCESS': {
      // Flash success on the last-clicked button (handled inline)
      break
    }

    case 'ERROR': {
      showError(msg.message)
      break
    }
  }
}

function updateStatus(hasText: boolean, count: number) {
  statusEl.className = hasText ? 'has-selection' : 'no-selection'
  if (hasText) {
    statusTextEl.textContent = count === 1 ? '1 text layer selected' : `${count} text layers selected`
  } else {
    statusTextEl.textContent = 'No text layer selected'
  }
}

function updateApplyButtons() {
  document.querySelectorAll<HTMLElement>('.var-item').forEach((row) => {
    row.classList.toggle('disabled', !hasTextLayer)
    row.title = hasTextLayer ? '' : 'Select a text layer first'
  })
}

function renderList() {
  const query = searchQuery.toLowerCase()
  const filtered = allVariables.filter((v) => {
    if (currentCollection && v.collectionName !== currentCollection) return false
    if (query) {
      const nameMatch = v.name.toLowerCase().includes(query)
      const valueMatch = (values[v.key] ?? '').toLowerCase().includes(query)
      if (!nameMatch && !valueMatch) return false
    }
    return true
  })

  listEl.innerHTML = ''

  if (filtered.length === 0) {
    emptyEl.style.display = 'block'
    footerEl.textContent = ''
    return
  }

  emptyEl.style.display = 'none'

  const fragment = document.createDocumentFragment()
  for (const v of filtered) {
    fragment.appendChild(createRow(v))
  }
  listEl.appendChild(fragment)

  const total = allVariables.length
  const shown = filtered.length
  footerEl.textContent =
    shown === total
      ? `${total} variable${total !== 1 ? 's' : ''}`
      : `${shown} of ${total} variables`

  updateApplyButtons()
}

function createRow(v: VariableInfo): HTMLElement {
  const row = document.createElement('div')
  row.className = 'var-item'
  row.dataset.key = v.key

  const textDiv = document.createElement('div')
  textDiv.className = 'var-text'

  const nameDiv = document.createElement('div')
  nameDiv.className = 'var-name'
  nameDiv.textContent = v.name
  nameDiv.title = v.name

  const valueDiv = document.createElement('div')
  valueDiv.className = 'var-value loading'
  valueDiv.dataset.valueFor = v.key

  if (values[v.key] !== undefined) {
    valueDiv.textContent = `"${values[v.key]}"`
    valueDiv.classList.remove('loading')
  } else {
    valueDiv.textContent = '···'
  }

  textDiv.appendChild(nameDiv)
  textDiv.appendChild(valueDiv)

  const metaDiv = document.createElement('div')
  metaDiv.className = 'var-meta'

  const badge = document.createElement('span')
  badge.className = 'collection-badge'
  badge.textContent = v.collectionName
  badge.title = v.collectionName

  const btn = document.createElement('div')
  btn.className = 'apply-btn'
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`

  function triggerApply() {
    if (!hasTextLayer) return
    send({ type: 'APPLY_VARIABLE', key: v.key })
    btn.classList.add('success')
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5l3.5 3.5 6.5-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
    setTimeout(() => {
      btn.classList.remove('success')
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    }, 1500)
  }

  row.addEventListener('click', triggerApply)

  metaDiv.appendChild(badge)
  metaDiv.appendChild(btn)

  row.appendChild(textDiv)
  row.appendChild(metaDiv)

  return row
}

// Update only the value cells for received keys (without full re-render)
function updateValueCells(incoming: Record<string, string>) {
  for (const [key, value] of Object.entries(incoming)) {
    // Update existing rows in DOM
    document.querySelectorAll<HTMLElement>(`[data-value-for="${key}"]`).forEach((el) => {
      el.textContent = `"${value}"`
      el.classList.remove('loading')
    })
  }

  // If search is active and we're searching by value, re-render so newly loaded values are searchable
  if (searchQuery) {
    renderList()
  }
}

// Event listeners
searchEl.addEventListener('input', () => {
  searchQuery = searchEl.value.trim()
  renderList()
})

collectionFilterEl.addEventListener('change', () => {
  currentCollection = collectionFilterEl.value
  renderList()
})

// Keyboard shortcut: Escape closes
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    send({ type: 'CLOSE' })
  }
})

function showError(message: string) {
  errorToastEl.textContent = message
  errorToastEl.style.display = 'block'
  if (errorTimer) clearTimeout(errorTimer)
  errorTimer = setTimeout(() => {
    errorToastEl.style.display = 'none'
  }, 4000)
}

// Boot
send({ type: 'GET_VARIABLES' })
searchEl.focus()
