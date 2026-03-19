import type { PluginToUI, UIToPlugin, VariableInfo } from './types'

figma.showUI(__html__, { width: 400, height: 600, title: 'String Variable Selector' })

// Notify UI of current selection on startup and on change
function notifySelection() {
  const textNodes = figma.currentPage.selection.filter((n) => n.type === 'TEXT')
  figma.ui.postMessage({
    type: 'SELECTION_CHANGED',
    hasTextLayer: textNodes.length > 0,
    count: textNodes.length,
  } satisfies PluginToUI)
}

figma.on('selectionchange', notifySelection)
notifySelection()

figma.ui.onmessage = async (msg: UIToPlugin) => {
  switch (msg.type) {
    case 'GET_VARIABLES': {
      await handleGetVariables()
      break
    }
    case 'GET_VARIABLE_VALUES': {
      await handleGetVariableValues(msg.keys)
      break
    }
    case 'APPLY_VARIABLE': {
      await handleApplyVariable(msg.key)
      break
    }
    case 'CLOSE': {
      figma.closePlugin()
      break
    }
  }
}

async function handleGetVariables() {
  try {
    const variables: VariableInfo[] = []
    const collectionNames = new Set<string>()
    const seenKeys = new Set<string>()

    // 1. Fetch from team library
    const libCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()
    for (const collection of libCollections) {
      const libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collection.key)
      for (const v of libVars) {
        if (v.resolvedType === 'STRING') {
          seenKeys.add(v.key)
          collectionNames.add(collection.name)
          variables.push({
            key: v.key,
            name: v.name,
            collectionName: collection.name,
            isLibrary: true,
          })
        }
      }
    }

    // 2. Fetch local variables (fallback / same-file usage)
    const localVars = await figma.variables.getLocalVariablesAsync('STRING')
    for (const v of localVars) {
      if (!seenKeys.has(v.key)) {
        const collection = figma.variables.getVariableCollectionById(v.variableCollectionId)
        const collectionName = collection?.name ?? 'Local'
        collectionNames.add(collectionName)
        variables.push({
          key: v.key,
          name: v.name,
          collectionName,
          isLibrary: false,
        })
      }
    }

    figma.ui.postMessage({
      type: 'VARIABLES_LOADED',
      variables,
      collections: Array.from(collectionNames).sort(),
    } satisfies PluginToUI)
  } catch (err) {
    figma.ui.postMessage({
      type: 'ERROR',
      message: `Failed to load variables: ${err instanceof Error ? err.message : String(err)}`,
    } satisfies PluginToUI)
  }
}

const BATCH_SIZE = 20

async function handleGetVariableValues(keys: string[]) {
  const values: Record<string, string> = {}

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map((key) => figma.variables.importVariableByKeyAsync(key))
    )

    for (let j = 0; j < results.length; j++) {
      const result = results[j]
      if (result.status === 'fulfilled') {
        const variable = result.value
        const collectionId = variable.variableCollectionId
        const collection = figma.variables.getVariableCollectionById(collectionId)
        const modeId = collection?.defaultModeId ?? Object.keys(variable.valuesByMode)[0]
        if (modeId) {
          const raw = variable.valuesByMode[modeId]
          if (typeof raw === 'string') {
            values[batch[j]] = raw
          }
        }
      }
    }

    // Send partial results as each batch completes
    figma.ui.postMessage({
      type: 'VARIABLE_VALUES',
      values: { ...values },
    } satisfies PluginToUI)
  }
}

function findNearestInstance(node: SceneNode): InstanceNode | null {
  let current: BaseNode | null = node.parent
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (current.type === 'INSTANCE') return current as InstanceNode
    current = (current as SceneNode).parent ?? null
  }
  return null
}

async function handleApplyVariable(key: string) {
  try {
    const textNodes = figma.currentPage.selection.filter(
      (n): n is TextNode => n.type === 'TEXT'
    )

    if (textNodes.length === 0) {
      figma.ui.postMessage({
        type: 'ERROR',
        message: 'No text layer selected. Select one or more text layers first.',
      } satisfies PluginToUI)
      return
    }

    const variable = await figma.variables.importVariableByKeyAsync(key)

    for (const node of textNodes) {
      const compPropKey = node.componentPropertyReferences?.characters
      if (compPropKey) {
        const instance = findNearestInstance(node)
        if (instance) {
          instance.setProperties({ [compPropKey]: { type: 'VARIABLE_ALIAS', id: variable.id } })
        } else {
          node.setBoundVariable('characters', variable)
        }
      } else {
        node.setBoundVariable('characters', variable)
      }
    }

    figma.ui.postMessage({
      type: 'APPLY_SUCCESS',
      variableName: variable.name,
    } satisfies PluginToUI)
  } catch (err) {
    figma.ui.postMessage({
      type: 'ERROR',
      message: `Failed to apply variable: ${err instanceof Error ? err.message : String(err)}`,
    } satisfies PluginToUI)
  }
}
