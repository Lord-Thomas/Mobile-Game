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
      // Ne pas appeler uncacheRoot ici. En développement, StrictMode exécute
      // volontairement setup -> cleanup -> setup sans recréer le useMemo.
      // uncacheRoot détruirait alors les bindings des AnimationAction conservées,
      // et leur prochain play() échouerait dans AnimationMixer._lendBinding.
      // Le mixer et sa racine deviennent naturellement collectables au démontage.
      api.mixer.stopAllAction()
    }
  }, [api.mixer])

  return api
}
