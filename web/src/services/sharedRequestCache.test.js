import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSharedRequestCache, loadSharedRequest } from './sharedRequestCache'

describe('shared request cache', () => {
  beforeEach(() => {
    clearSharedRequestCache()
  })

  it('deduplicates concurrent requests and reuses the successful value', async () => {
    const loader = vi.fn().mockResolvedValue({ value: 42 })

    const [first, second] = await Promise.all([
      loadSharedRequest('same', loader),
      loadSharedRequest('same', loader),
    ])
    const third = await loadSharedRequest('same', loader)

    expect(first).toEqual({ value: 42 })
    expect(second).toEqual({ value: 42 })
    expect(third).toEqual({ value: 42 })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('applies a cooldown after a failed request', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('offline'))

    await expect(loadSharedRequest('failed', loader)).rejects.toThrow('offline')
    await expect(loadSharedRequest('failed', loader)).rejects.toThrow('offline')

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('does not abort the shared request when one consumer unmounts', async () => {
    const controller = new AbortController()
    let resolveLoader
    const loader = vi.fn(() => new Promise((resolve) => {
      resolveLoader = resolve
    }))
    const abortedConsumer = loadSharedRequest('abort', loader, { signal: controller.signal })
    const activeConsumer = loadSharedRequest('abort', loader)

    await Promise.resolve()
    controller.abort()
    resolveLoader({ ok: true })

    await expect(abortedConsumer).rejects.toMatchObject({ name: 'AbortError' })
    await expect(activeConsumer).resolves.toEqual({ ok: true })
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
