import { useEffect, useLayoutEffect, useMemo } from 'react'
import { AnimationMixer } from 'three'
import { gameAnimationMixerRegistry } from './animationMixerRegistry'

function createAnimationApi(clips, root) {
  const mixer = new AnimationMixer(root)
  const actions = Object.fromEntries(
    clips.map((clip) => [clip.name, mixer.clipAction(clip, root)]),
  )
  return {
    ref: { current: root },
    clips,
    actions,
    names: clips.map((clip) => clip.name),
    mixer,
  }
}

export function useScheduledAnimations(clips, root) {
  const api = useMemo(
    () => createAnimationApi(clips, root),
    [clips, root],
  )
  useLayoutEffect(
    () => gameAnimationMixerRegistry.register(api.mixer),
    [api.mixer],
  )

  useEffect(() => {
    return () => {
      api.mixer.stopAllAction()
      if (root) api.mixer.uncacheRoot(root)
    }
  }, [api.mixer, root])

  return api
}
