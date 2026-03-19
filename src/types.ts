export interface VariableInfo {
  key: string
  name: string
  collectionName: string
  isLibrary: boolean
}

export type PluginToUI =
  | { type: 'VARIABLES_LOADED'; variables: VariableInfo[]; collections: string[] }
  | { type: 'VARIABLE_VALUES'; values: Record<string, string> }
  | { type: 'SELECTION_CHANGED'; hasTextLayer: boolean; count: number }
  | { type: 'APPLY_SUCCESS'; variableName: string }
  | { type: 'ERROR'; message: string }

export type UIToPlugin =
  | { type: 'GET_VARIABLES' }
  | { type: 'GET_VARIABLE_VALUES'; keys: string[] }
  | { type: 'APPLY_VARIABLE'; key: string }
  | { type: 'CLOSE' }
