import { useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import { ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace, Vector2 } from 'three'
import {
  MAP_BIOME_AREAS,
  getBiomeGroundColorUniforms,
} from './biomeAreas'
import { patchNaturalTerrainVertexShader } from './naturalTerrainShader'
import {
  TERRAIN_SURFACE_MASK_HALF_SIZE,
  TERRAIN_SURFACE_MASK_URL,
  TERRAIN_SURFACE_MASK_WORLD_SIZE,
} from './terrain/terrainSurfaceMaskConfig'

const SURFACE_TEXTURES = [
  '/textures/outdoor/grass-patchy-basecolor-512.jpg',
  '/textures/outdoor/dirt-ground-basecolor-512.jpg',
  '/textures/outdoor/grass-patchy-normal.png',
  '/textures/outdoor/dirt-ground-normal.jpg',
  TERRAIN_SURFACE_MASK_URL,
]

function configureTexture(texture, colorSpace = null) {
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  if (colorSpace) texture.colorSpace = colorSpace
  texture.needsUpdate = true
}

function configureSurfaceMask(texture) {
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  // The generated image stores -Z on its first scanline so shader UVs can map
  // directly from world XZ without the usual image-texture vertical flip.
  texture.flipY = false
  texture.needsUpdate = true
}

function applyBiomeUniformsToShader(shader, groundColors) {
  if (!shader?.uniforms) return
  shader.uniforms.uGraveyardDarkSoil.value = groundColors.darkSoil
  shader.uniforms.uGraveyardDryClay.value = groundColors.dryClay
  shader.uniforms.uGraveyardAsh.value = groundColors.ash
  shader.uniforms.uGraveyardBoneDust.value = groundColors.boneDust
  shader.uniforms.uGraveyardColdShadow.value = groundColors.coldShadow
}

function NaturalTerrainMaterial({
  biomeAreas = MAP_BIOME_AREAS,
  lightingModel = 'standard',
}) {
  const materialRef = useRef()
  const [grassMap, dirtMap, grassNormalMap, dirtNormalMap, surfaceMask] = useTexture(SURFACE_TEXTURES)
  const groundColors = useMemo(
    () => getBiomeGroundColorUniforms('graveyard', biomeAreas),
    [biomeAreas],
  )

  useMemo(() => {
    configureTexture(grassMap, SRGBColorSpace)
    configureTexture(dirtMap, SRGBColorSpace)
    configureTexture(grassNormalMap)
    configureTexture(dirtNormalMap)
    configureSurfaceMask(surfaceMask)
  }, [dirtMap, dirtNormalMap, grassMap, grassNormalMap, surfaceMask])

  // Fonction classique (pas une arrow) : Three appelle `material.onBeforeCompile(...)`
  // en méthode, donc `this` === le matériau en cours de compilation. On stocke le
  // shader sur CE matériau plutôt que sur `materialRef.current`, qui peut être null
  // transitoirement (compilation déclenchée hors rendu, ex. pré-warm shader pendant
  // une transition où le ref n'est pas encore (ré)attaché) → évite un throw qui
  // avortait toute la passe de compilation.
  const handleBeforeCompile = useMemo(() => function handleBeforeCompile(shader) {
    shader.uniforms.uGrassMap = { value: grassMap }
    shader.uniforms.uDirtMap = { value: dirtMap }
    shader.uniforms.uGrassNormalMap = { value: grassNormalMap }
    shader.uniforms.uDirtNormalMap = { value: dirtNormalMap }
    shader.uniforms.uSurfaceMask = { value: surfaceMask }
    shader.uniforms.uGraveyardDarkSoil = { value: groundColors.darkSoil }
    shader.uniforms.uGraveyardDryClay = { value: groundColors.dryClay }
    shader.uniforms.uGraveyardAsh = { value: groundColors.ash }
    shader.uniforms.uGraveyardBoneDust = { value: groundColors.boneDust }
    shader.uniforms.uGraveyardColdShadow = { value: groundColors.coldShadow }

    // The terrain meshes stay in world-aligned local coordinates. Reuse the final
    // local vertex position directly: unlike Three's conditional `worldPosition`,
    // it exists with or without shadows and costs no extra matrix multiplication.
    shader.vertexShader = patchNaturalTerrainVertexShader(shader.vertexShader)

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform sampler2D uGrassMap;
      uniform sampler2D uDirtMap;
      uniform sampler2D uGrassNormalMap;
      uniform sampler2D uDirtNormalMap;
      uniform sampler2D uSurfaceMask;
      uniform vec3 uGraveyardDarkSoil;
      uniform vec3 uGraveyardDryClay;
      uniform vec3 uGraveyardAsh;
      uniform vec3 uGraveyardBoneDust;
      uniform vec3 uGraveyardColdShadow;
      varying vec3 vNaturalWorldPosition;

      float naturalHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float naturalNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(naturalHash(i), naturalHash(i + vec2(1.0, 0.0)), u.x),
          mix(naturalHash(i + vec2(0.0, 1.0)), naturalHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      vec4 naturalTextureNoTile(sampler2D tex, vec2 uv) {
        float k = naturalNoise(uv * 0.11);
        float l = k * 8.0;
        float ia = floor(l);
        float ib = ia + 1.0;
        float f = fract(l);
        vec2 offA = sin(vec2(3.0, 7.0) * ia) * 0.42;
        vec2 offB = sin(vec2(3.0, 7.0) * ib) * 0.42;
        vec4 colorA = texture2D(tex, uv + offA);
        vec4 colorB = texture2D(tex, uv + offB);
        float blend = smoothstep(0.2, 0.8, f - 0.08 * dot(colorA.rgb - colorB.rgb, vec3(0.333)));
        return mix(colorA, colorB, blend);
      }

      vec3 naturalNormalSample(sampler2D tex, vec2 uv) {
        return texture2D(tex, uv).xyz * 2.0 - 1.0;
      }
      `,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec2 naturalUv = vNaturalWorldPosition.xz;
      vec2 naturalMaskUv = clamp(
        (naturalUv + vec2(${TERRAIN_SURFACE_MASK_HALF_SIZE.toFixed(1)}))
          / ${TERRAIN_SURFACE_MASK_WORLD_SIZE.toFixed(1)},
        vec2(0.0),
        vec2(1.0)
      );
      vec4 naturalSurfaceMask = texture2D(uSurfaceMask, naturalMaskUv);
      float naturalDirt = naturalSurfaceMask.r;
      vec4 naturalGrassColor = naturalTextureNoTile(uGrassMap, naturalUv * 0.155);
      vec4 naturalDirtColor = naturalTextureNoTile(uDirtMap, naturalUv * 0.18);

      // Keep the terrain close to the blade palette so sparse distant grass blends into it.
      float grassLum = dot(naturalGrassColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 grassTarget = vec3(0.055, 0.37, 0.035);
      vec3 grassGraded = mix(
        naturalGrassColor.rgb,
        grassTarget * clamp(grassLum * 2.8 + 0.10, 0.0, 0.84),
        0.90
      );

      // Grade dirt toward warm amber-ochre: harmonious earth tones under green (linear: ~#b87a30)
      float dirtLum = dot(naturalDirtColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 dirtTarget = vec3(0.49, 0.23, 0.04);
      vec3 dirtGraded = mix(
        naturalDirtColor.rgb,
        dirtTarget * clamp(dirtLum * 2.5 + 0.08, 0.0, 0.90),
        0.50
      );

      vec3 naturalColor = mix(grassGraded, dirtGraded, naturalDirt);
      float naturalGraveyard = naturalSurfaceMask.g;
      naturalDirt = max(naturalDirt, naturalGraveyard * 0.74);
      naturalColor = mix(grassGraded, dirtGraded, naturalDirt);
      float graveNoise = naturalSurfaceMask.b;
      float graveFine = naturalSurfaceMask.a;
      float boneDust = smoothstep(0.82, 0.98, graveFine) * smoothstep(0.18, 0.75, graveNoise);
      float coldPocket = smoothstep(0.08, 0.24, graveNoise) * (1.0 - smoothstep(0.24, 0.48, graveNoise));
      vec3 graveColor = mix(uGraveyardDarkSoil, uGraveyardDryClay, smoothstep(0.18, 0.68, graveNoise));
      graveColor = mix(graveColor, uGraveyardAsh, smoothstep(0.54, 0.94, graveNoise) * 0.52);
      graveColor = mix(graveColor, uGraveyardBoneDust, boneDust * 0.38);
      graveColor = mix(graveColor, uGraveyardColdShadow, coldPocket * 0.3);
      naturalColor = mix(naturalColor, graveColor, naturalGraveyard * 0.94);
      diffuseColor *= vec4(naturalColor, 1.0);
      `,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #ifdef USE_NORMALMAP_TANGENTSPACE
        vec2 naturalNormalUv = vNaturalWorldPosition.xz;
        float naturalNormalDirt = max(naturalDirt, naturalGraveyard * 0.86);
        vec3 naturalGrassNormal = naturalNormalSample(uGrassNormalMap, naturalNormalUv * 0.155);
        vec3 naturalDirtNormal = naturalNormalSample(uDirtNormalMap, naturalNormalUv * 0.18);
        vec3 mapN = normalize(mix(naturalGrassNormal, naturalDirtNormal, naturalNormalDirt));
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);
      #endif
      `,
    )

    const material = materialRef.current ?? this
    if (material) material.userData.shader = shader
  }, [dirtMap, dirtNormalMap, grassMap, grassNormalMap, groundColors, surfaceMask])

  useEffect(() => {
    const material = materialRef.current
    const shader = material?.userData?.shader
    applyBiomeUniformsToShader(shader, groundColors)
  }, [groundColors])

  useEffect(() => {
    const material = materialRef.current
    if (material) material.needsUpdate = true
  }, [dirtMap, dirtNormalMap, grassMap, grassNormalMap, surfaceMask])

  if (lightingModel === 'lambert') {
    return (
      <meshLambertMaterial
        ref={materialRef}
        map={grassMap}
        normalMap={grassNormalMap}
        normalScale={new Vector2(0.34, 0.34)}
        color="#ffffff"
        emissive="#328f22"
        emissiveIntensity={0.05}
        onBeforeCompile={handleBeforeCompile}
      />
    )
  }

  return (
    <meshStandardMaterial
      ref={materialRef}
      map={grassMap}
      normalMap={grassNormalMap}
      normalScale={new Vector2(0.34, 0.34)}
      color="#ffffff"
      emissive="#328f22"
      emissiveIntensity={0.05}
      roughness={0.88}
      onBeforeCompile={handleBeforeCompile}
    />
  )
}

export default NaturalTerrainMaterial
