import { useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import { RepeatWrapping, SRGBColorSpace, Vector2, Vector4 } from 'three'
import {
  BIOME_SHADER_MAX_AREAS,
  GRAVEYARD_SHADER_AREAS,
  GRAVEYARD_SHADER_GROUND_INTENSITIES,
  MAP_BIOME_AREAS,
  getBiomeGroundColorUniforms,
  getBiomeShaderAreas,
} from './biomeAreas'
import { createRoadCurve } from './roads/roadGeometry'
import { roadLayout } from './roads/roadLayout'

const ROAD_SHADER_SAMPLES = 20
const _roadCurve = createRoadCurve(roadLayout.mainRoad.points)
const roadShaderPoints = Array.from({ length: ROAD_SHADER_SAMPLES }, (_, i) => {
  const pt = _roadCurve.getPointAt(i / (ROAD_SHADER_SAMPLES - 1))
  return new Vector2(pt.x, pt.z)
})
const graveyardShaderAreas = Array.from({ length: BIOME_SHADER_MAX_AREAS }, (_, index) => (
  GRAVEYARD_SHADER_AREAS[index] ?? new Vector4(0, 0, 0, 1)
))
const graveyardGroundIntensities = Array.from({ length: BIOME_SHADER_MAX_AREAS }, (_, index) => (
  GRAVEYARD_SHADER_GROUND_INTENSITIES[index] ?? 0
))
const graveyardGroundIntensityUniforms = Float32Array.from(graveyardGroundIntensities)
const graveyardGroundColorUniforms = getBiomeGroundColorUniforms('graveyard')

const SURFACE_TEXTURES = [
  '/textures/outdoor/grass-patchy-basecolor-512.jpg',
  '/textures/outdoor/dirt-ground-basecolor-512.jpg',
  '/textures/outdoor/grass-patchy-normal.png',
  '/textures/outdoor/dirt-ground-normal.jpg',
]

function configureTexture(texture, colorSpace = null) {
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  if (colorSpace) texture.colorSpace = colorSpace
  texture.needsUpdate = true
}

function applyBiomeUniformsToShader(shader, shaderBiomeData) {
  if (!shader?.uniforms) return
  shader.uniforms.uGraveyardAreas.value = shaderBiomeData.areas
  shader.uniforms.uGraveyardGroundIntensities.value = shaderBiomeData.groundIntensities
  shader.uniforms.uGraveyardDarkSoil.value = shaderBiomeData.groundColors.darkSoil
  shader.uniforms.uGraveyardDryClay.value = shaderBiomeData.groundColors.dryClay
  shader.uniforms.uGraveyardAsh.value = shaderBiomeData.groundColors.ash
  shader.uniforms.uGraveyardBoneDust.value = shaderBiomeData.groundColors.boneDust
  shader.uniforms.uGraveyardColdShadow.value = shaderBiomeData.groundColors.coldShadow
  shader.uniforms.uGraveyardAreaCount.value = shaderBiomeData.count
}

function NaturalTerrainMaterial({ biomeAreas = MAP_BIOME_AREAS }) {
  const materialRef = useRef()
  const [grassMap, dirtMap, grassNormalMap, dirtNormalMap] = useTexture(SURFACE_TEXTURES)
  const shaderBiomeData = useMemo(() => {
    if (biomeAreas === MAP_BIOME_AREAS) {
      return {
        areas: graveyardShaderAreas,
        groundIntensities: graveyardGroundIntensityUniforms,
        groundColors: graveyardGroundColorUniforms,
        count: Math.min(GRAVEYARD_SHADER_AREAS.length, BIOME_SHADER_MAX_AREAS),
      }
    }

    const areas = getBiomeShaderAreas('graveyard', biomeAreas)
    const graveyardAreas = biomeAreas
      .filter((area) => area.biome === 'graveyard')
      .slice(0, BIOME_SHADER_MAX_AREAS)
    return {
      areas: Array.from({ length: BIOME_SHADER_MAX_AREAS }, (_, index) => (
        areas[index] ?? new Vector4(0, 0, 0, 1)
      )),
      groundIntensities: Float32Array.from(Array.from({ length: BIOME_SHADER_MAX_AREAS }, (_, index) => (
        graveyardAreas[index]?.groundIntensity ?? 0
      ))),
      groundColors: getBiomeGroundColorUniforms('graveyard', biomeAreas),
      count: Math.min(areas.length, BIOME_SHADER_MAX_AREAS),
    }
  }, [biomeAreas])

  useMemo(() => {
    configureTexture(grassMap, SRGBColorSpace)
    configureTexture(dirtMap, SRGBColorSpace)
    configureTexture(grassNormalMap)
    configureTexture(dirtNormalMap)
  }, [dirtMap, dirtNormalMap, grassMap, grassNormalMap])

  const handleBeforeCompile = useMemo(() => (shader) => {
    shader.uniforms.uGrassMap = { value: grassMap }
    shader.uniforms.uDirtMap = { value: dirtMap }
    shader.uniforms.uGrassNormalMap = { value: grassNormalMap }
    shader.uniforms.uDirtNormalMap = { value: dirtNormalMap }
    shader.uniforms.uRoadPoints = { value: roadShaderPoints }
    shader.uniforms.uGraveyardAreas = { value: shaderBiomeData.areas }
    shader.uniforms.uGraveyardGroundIntensities = { value: shaderBiomeData.groundIntensities }
    shader.uniforms.uGraveyardDarkSoil = { value: shaderBiomeData.groundColors.darkSoil }
    shader.uniforms.uGraveyardDryClay = { value: shaderBiomeData.groundColors.dryClay }
    shader.uniforms.uGraveyardAsh = { value: shaderBiomeData.groundColors.ash }
    shader.uniforms.uGraveyardBoneDust = { value: shaderBiomeData.groundColors.boneDust }
    shader.uniforms.uGraveyardColdShadow = { value: shaderBiomeData.groundColors.coldShadow }
    shader.uniforms.uGraveyardAreaCount = { value: shaderBiomeData.count }

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      varying vec3 vNaturalWorldPosition;
      `,
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vNaturalWorldPosition = worldPosition.xyz;
      `,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform sampler2D uGrassMap;
      uniform sampler2D uDirtMap;
      uniform sampler2D uGrassNormalMap;
      uniform sampler2D uDirtNormalMap;
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

      float naturalSegmentDistance(vec2 p, vec2 a, vec2 b) {
        vec2 ab = b - a;
        float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
        return length(p - (a + ab * t));
      }

      uniform vec2 uRoadPoints[20];
      uniform vec4 uGraveyardAreas[${BIOME_SHADER_MAX_AREAS}];
      uniform float uGraveyardGroundIntensities[${BIOME_SHADER_MAX_AREAS}];
      uniform vec3 uGraveyardDarkSoil;
      uniform vec3 uGraveyardDryClay;
      uniform vec3 uGraveyardAsh;
      uniform vec3 uGraveyardBoneDust;
      uniform vec3 uGraveyardColdShadow;
      uniform int uGraveyardAreaCount;

      float naturalRoadDistance(vec2 p) {
        float minDist = 1e6;
        for (int i = 0; i < 19; i++) {
          minDist = min(minDist, naturalSegmentDistance(p, uRoadPoints[i], uRoadPoints[i + 1]));
        }
        return minDist;
      }

      float naturalRectDistance(vec2 p, vec2 center, vec2 halfSize) {
        vec2 q = abs(p - center) - halfSize;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
      }

      float naturalSurfaceDirtWeight(vec2 worldPosition) {
        float edgeNoise = naturalNoise(worldPosition * 0.34) * 2.0 - 1.0;
        float detailNoise = naturalNoise(worldPosition * 0.83) * 2.0 - 1.0;

        float roadDistance = naturalRoadDistance(worldPosition);
        float roadShoulder = 1.0 - smoothstep(2.6 + edgeNoise * 0.22, 4.4 + edgeNoise * 0.42, roadDistance);

        float pathVertical = naturalRectDistance(worldPosition, vec2(-6.05, 9.325), vec2(1.35, 11.575));
        float pathHorizontal = naturalRectDistance(worldPosition, vec2(-5.525, -2.25), vec2(0.525, 1.22));
        float pathDistance = min(pathVertical, pathHorizontal);
        float path = 1.0 - smoothstep(0.1 + edgeNoise * 0.14, 1.2 + edgeNoise * 0.32, pathDistance);

        float houseEdge = 1.0 - smoothstep(edgeNoise * 0.06, 0.9 + edgeNoise * 0.16, abs(naturalRectDistance(worldPosition, vec2(0.0, 0.0), vec2(5.45, 5.45))));
        float wildPatch = smoothstep(0.46, 0.78, naturalNoise(worldPosition * 0.115 + vec2(4.7, -2.1))) * 0.24;
        float drySpeckle = smoothstep(0.62, 0.92, naturalNoise(worldPosition * 1.7)) * 0.08;

        float dirt = max(max(path, roadShoulder), max(houseEdge * 0.38, wildPatch + drySpeckle));
        dirt += detailNoise * 0.045;
        return clamp(dirt, 0.0, 1.0);
      }

      float naturalBiomeAreaInfluence(vec2 worldPosition, vec4 area) {
        float distanceToCenter = distance(worldPosition, area.xy);
        float innerRadius = max(0.0, area.z - area.w);
        return 1.0 - smoothstep(innerRadius, area.z, distanceToCenter);
      }

      float naturalGraveyardInfluence(vec2 worldPosition) {
        float influence = 0.0;
        for (int i = 0; i < ${BIOME_SHADER_MAX_AREAS}; i++) {
          if (i >= uGraveyardAreaCount) break;
          influence = max(influence, naturalBiomeAreaInfluence(worldPosition, uGraveyardAreas[i]) * uGraveyardGroundIntensities[i]);
        }
        float mottledEdge = naturalNoise(worldPosition * 0.42 + vec2(8.1, -3.7)) * 0.16 - 0.05;
        return clamp(influence + mottledEdge * influence * (1.0 - influence), 0.0, 1.0);
      }
      `,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec2 naturalUv = vNaturalWorldPosition.xz;
      float naturalDirt = naturalSurfaceDirtWeight(naturalUv);
      vec4 naturalGrassColor = naturalTextureNoTile(uGrassMap, naturalUv * 0.155);
      vec4 naturalDirtColor = naturalTextureNoTile(uDirtMap, naturalUv * 0.18);

      // Keep the terrain close to the blade palette so sparse distant grass blends into it.
      float grassLum = dot(naturalGrassColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 grassTarget = vec3(0.20, 0.43, 0.035);
      vec3 grassGraded = mix(
        naturalGrassColor.rgb,
        grassTarget * clamp(grassLum * 2.8 + 0.10, 0.0, 0.84),
        0.74
      );

      // Grade dirt toward warm amber-ochre: harmonious earth tones under green (linear: ~#b87a30)
      float dirtLum = dot(naturalDirtColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 dirtTarget = vec3(0.49, 0.20, 0.03);
      vec3 dirtGraded = mix(
        naturalDirtColor.rgb,
        dirtTarget * clamp(dirtLum * 2.5 + 0.08, 0.0, 0.90),
        0.50
      );

      vec3 naturalColor = mix(grassGraded, dirtGraded, naturalDirt);
      float naturalGraveyard = naturalGraveyardInfluence(naturalUv);
      naturalDirt = max(naturalDirt, naturalGraveyard * 0.74);
      naturalColor = mix(grassGraded, dirtGraded, naturalDirt);
      float graveNoise = naturalNoise(naturalUv * 0.76 + vec2(2.7, 9.2));
      float graveFine = naturalNoise(naturalUv * 2.85 + vec2(-5.8, 1.9));
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
        float naturalNormalDirt = naturalSurfaceDirtWeight(naturalNormalUv);
        naturalNormalDirt = max(naturalNormalDirt, naturalGraveyardInfluence(naturalNormalUv) * 0.86);
        vec3 naturalGrassNormal = naturalNormalSample(uGrassNormalMap, naturalNormalUv * 0.155);
        vec3 naturalDirtNormal = naturalNormalSample(uDirtNormalMap, naturalNormalUv * 0.18);
        vec3 mapN = normalize(mix(naturalGrassNormal, naturalDirtNormal, naturalNormalDirt));
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);
      #endif
      `,
    )

    materialRef.current.userData.shader = shader
  }, [dirtMap, dirtNormalMap, grassMap, grassNormalMap, shaderBiomeData])

  useEffect(() => {
    const material = materialRef.current
    const shader = material?.userData?.shader
    applyBiomeUniformsToShader(shader, shaderBiomeData)
  }, [shaderBiomeData])

  useEffect(() => {
    const material = materialRef.current
    if (material) material.needsUpdate = true
  }, [dirtMap, dirtNormalMap, grassMap, grassNormalMap])

  return (
    <meshStandardMaterial
      ref={materialRef}
      map={grassMap}
      normalMap={grassNormalMap}
      normalScale={new Vector2(0.34, 0.34)}
      color="#ffffff"
      emissive="#3c7010"
      emissiveIntensity={0.07}
      roughness={0.88}
      onBeforeCompile={handleBeforeCompile}
    />
  )
}

export default NaturalTerrainMaterial
