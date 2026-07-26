export class AnimationMixerRegistry {
  constructor() {
    this.mixers = new Set()
  }

  register(mixer) {
    if (!mixer || typeof mixer.update !== 'function') {
      throw new Error('AnimationMixerRegistry.register expects an animation mixer.')
    }

    this.mixers.add(mixer)
    return () => {
      this.mixers.delete(mixer)
    }
  }

  update(delta) {
    this.mixers.forEach((mixer) => mixer.update(delta))
  }

  get size() {
    return this.mixers.size
  }
}

export const gameAnimationMixerRegistry = new AnimationMixerRegistry()
