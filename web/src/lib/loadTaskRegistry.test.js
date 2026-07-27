import { beforeEach, describe, expect, it } from 'vitest'
import {
  completeLoadTask,
  isLoadTaskReady,
  resetLoadTask,
  waitForLoadTasks,
} from './loadTaskRegistry'

describe('loadTaskRegistry', () => {
  beforeEach(() => {
    resetLoadTask('house')
    resetLoadTask('world')
  })

  it('waits until every requested task is complete', async () => {
    const resultPromise = waitForLoadTasks(['house', 'world'], 1000)
    completeLoadTask('house')
    expect(isLoadTaskReady('house')).toBe(true)
    completeLoadTask('world')

    await expect(resultPromise).resolves.toEqual({ ready: true, pending: [] })
  })
})
