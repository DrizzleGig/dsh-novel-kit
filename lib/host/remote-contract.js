/**
 * Typert remote contract for the "小说" sidebar panel.
 *
 * Same shape as the other novel plugins: the Client mounts this contract with
 * ctx.remote.$mount(); the Host registers it with ctx.typert.register().
 * Keep dependency-free.
 */
function scalar(validate) {
  return {
    parse(value) {
      validate(value)
      return value
    },
    safeParse(value) {
      try {
        validate(value)
        return { success: true, data: value }
      } catch (error) {
        return { success: false, error }
      }
    },
  }
}

const sessionIdSchema = scalar((value) => {
  if (typeof value !== 'string' || value.length === 0) throw new Error('sessionId must be a non-empty string')
})

const requestSchema = scalar((value) => {
  if (value === undefined || value === null) return
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('request must be a plain object')
})

const payloadSchema = scalar(() => {})

function strictCodec(typeSymbol, schema) {
  return { mode: 'strict', typeSymbol, create: () => schema }
}

function parameter(name, schema) {
  return { name, wire: name, source: 'json', codec: strictCodec(name, schema) }
}

const methods = ['identity', 'getSnapshot', 'getDiagnostics', 'getDecisions', 'getMemory', 'getStyle', 'getCanon', 'getPlan', 'getOperations', 'searchMemory', 'importSource', 'listSourceFiles', 'decide', 'reviseDecision', 'savePlan', 'memoryAction', 'takeover', 'restore', 'getSettings', 'setMaster', 'setMode', 'importStyle', 'confirmStyle', 'importCanon', 'listSources', 'listStyleProfiles', 'createBook', 'startChapter', 'getDraft', 'saveDraft', 'updateCanon', 'confirmCanon']

const requestMethods = ['getSnapshot', 'getDecisions', 'getMemory', 'getStyle', 'getCanon', 'getPlan', 'getOperations', 'searchMemory', 'importSource', 'listSourceFiles', 'decide', 'reviseDecision', 'savePlan', 'memoryAction', 'getSettings', 'setMaster', 'setMode', 'importStyle', 'confirmStyle', 'importCanon', 'listSources', 'listStyleProfiles', 'createBook', 'startChapter', 'getDraft', 'saveDraft', 'updateCanon', 'confirmCanon']

export const DESCRIPTORS = methods.map((method) => ({
  id: `dsh-novel-kit#novelKitPanel/${method}`,
  namespace: 'novelKitPanel',
  service: 'novelKitPanel',
  method,
  invocation: { kind: 'direct' },
  parameters: requestMethods.includes(method)
    ? [parameter('sessionId', sessionIdSchema), parameter('request', requestSchema)]
    : [parameter('sessionId', sessionIdSchema)],
  result: strictCodec('KitPanelPayload', payloadSchema),
}))

export const TYPERT_REMOTE = { package: 'dsh-novel-kit', descriptors: DESCRIPTORS }
