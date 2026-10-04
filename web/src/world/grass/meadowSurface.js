export const meadowSurfaceGlsl = `
uniform vec3 meadowDark;
uniform vec3 meadowLight;
          float meadowHash(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
          }
          float meadowNoise(vec2 p) {
            vec2 cell = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(meadowHash(cell), meadowHash(cell + vec2(1, 0)), f.x),
              mix(meadowHash(cell + vec2(0, 1)), meadowHash(cell + vec2(1, 1)), f.x), f.y);
          }
          float meadowFilteredNoise(vec2 p) {
            float footprint = max(length(dFdx(p)), length(dFdy(p)));
            return mix(meadowNoise(p), 0.5, smoothstep(0.3, 1.2, footprint));
          }
vec3 meadowSurfaceColor(vec2 p) {

          float broad = meadowNoise(p * 0.17 + vec2(13.7, -8.2));
          vec2 rotated = mat2(0.8, -0.6, 0.6, 0.8) * p;
          float medium = meadowFilteredNoise(rotated * 1.3 + vec2(-4.1, 21.8));
          float grain = meadowFilteredNoise(rotated * vec2(16.0, 8.0) + vec2(9.3, 2.1));
          float tone = clamp(0.55 + (broad - 0.5) * 0.32 + (medium - 0.5) * 0.22 + (grain - 0.5) * 0.28, 0.0, 1.0);
          return mix(meadowDark, meadowLight, tone);
}
`
