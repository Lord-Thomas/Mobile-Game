import { afterEach, describe, expect, it, vi } from 'vitest'

describe('perfDiagnostics export window', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    delete globalThis.window
  })

  it('exports only events recorded inside the requested measurement window', async () => {
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    globalThis.window = {
      location: { search: '?debug=1' },
      setTimeout: (callback) => callback(),
    }

    const { perfDiagnostics } = await import('./perfDiagnostics')
    perfDiagnostics.mark('before')
    now = 200
    perfDiagnostics.mark('inside')
    now = 300
    perfDiagnostics.mark('after')

    const exported = perfDiagnostics.export({ since: 150, until: 250 })

    expect(exported.version).toBe(3)
    expect(exported.window).toEqual({ since: 150, until: 250 })
    expect(exported.events.map((entry) => entry.name)).toEqual(['inside'])
    expect(exported.truncatedBeforeWindow).toBe(false)
  })
})
