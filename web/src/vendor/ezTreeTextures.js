import {
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from 'three'

import birchAo from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/birch_ao_1k.jpg'
import birchColor from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/birch_color_1k.jpg'
import birchNormal from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/birch_normal_1k.jpg'
import birchRoughness from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/birch_roughness_1k.jpg'
import oakAo from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/oak_ao_1k.jpg'
import oakColor from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/oak_color_1k.jpg'
import oakNormal from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/oak_normal_1k.jpg'
import oakRoughness from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/oak_roughness_1k.jpg'
import pineAo from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/pine_ao_1k.jpg'
import pineColor from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/pine_color_1k.jpg'
import pineNormal from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/pine_normal_1k.jpg'
import pineRoughness from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/pine_roughness_1k.jpg'
import willowAo from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/willow_ao_1k.jpg'
import willowColor from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/willow_color_1k.jpg'
import willowNormal from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/willow_normal_1k.jpg'
import willowRoughness from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/willow_roughness_1k.jpg'
import ashLeaves from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/leaves/ash_color.png'
import aspenLeaves from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/leaves/aspen_color.png'
import oakLeaves from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/leaves/oak_color.png'
import pineLeaves from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/leaves/pine_color.png'

const textureLoader = new TextureLoader()
const textureCache = new Map()

const barkTextureUrls = {
  birch: {
    ao: birchAo,
    color: birchColor,
    normal: birchNormal,
    roughness: birchRoughness,
  },
  oak: {
    ao: oakAo,
    color: oakColor,
    normal: oakNormal,
    roughness: oakRoughness,
  },
  pine: {
    ao: pineAo,
    color: pineColor,
    normal: pineNormal,
    roughness: pineRoughness,
  },
  willow: {
    ao: willowAo,
    color: willowColor,
    normal: willowNormal,
    roughness: willowRoughness,
  },
}

const leafTextureUrls = {
  ash: ashLeaves,
  aspen: aspenLeaves,
  oak: oakLeaves,
  pine: pineLeaves,
}

function loadTexture(url, srgb = true) {
  const cacheKey = `${srgb ? 'srgb' : 'linear'}:${url}`
  let texture = textureCache.get(cacheKey)
  if (texture) return texture

  texture = textureLoader.load(url)
  texture.premultiplyAlpha = true
  if (srgb) texture.colorSpace = SRGBColorSpace
  textureCache.set(cacheKey, texture)
  return texture
}

export function getBarkTexture(barkType, fileType, scale = { x: 1, y: 1 }) {
  const url = barkTextureUrls[barkType]?.[fileType]
  if (!url) throw new Error(`Unknown EZ Tree bark texture: ${barkType}/${fileType}`)

  const texture = loadTexture(url, fileType === 'color')
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.x = scale.x
  texture.repeat.y = 1 / scale.y
  return texture
}

export function getLeafTexture(leafType) {
  const url = leafTextureUrls[leafType]
  if (!url) throw new Error(`Unknown EZ Tree leaf texture: ${leafType}`)
  return loadTexture(url)
}
