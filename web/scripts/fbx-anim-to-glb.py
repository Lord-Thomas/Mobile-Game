# Convertit un FBX d'animation Mixamo en GLB armature+animation (SANS le mesh).
#
# Pourquoi : les FBX Mixamo embarquent le mesh complet du perso à CHAQUE clip (~2 Mo
# chacun) alors que le runtime n'a besoin que de l'animation (le mesh vient du GLB
# joueur). On importe le FBX, on supprime les meshes, et on exporte un GLB ne contenant
# que l'armature + l'animation -> fichier minuscule et parse quasi instantané.
#
# Les noms d'os restent ceux de Mixamo ("mixamorig:Hips"). Côté code, les pistes sont
# renormalisées (mixamorig: -> mixamorig) comme l'avatar, cf. normalizeMixamoObjectName.
#
# Usage (headless) :
#   blender --background --python scripts/fbx-anim-to-glb.py -- <in.fbx> <out.glb>

import bpy
import sys

argv = sys.argv[sys.argv.index("--") + 1:]
in_fbx, out_glb = argv[0], argv[1]

# Scène vide propre
bpy.ops.wm.read_factory_settings(use_empty=True)

bpy.ops.import_scene.fbx(filepath=in_fbx)

# Supprime tout mesh : on ne garde que l'armature + l'action (animation)
removed = 0
for obj in list(bpy.data.objects):
    if obj.type == 'MESH':
        bpy.data.objects.remove(obj, do_unlink=True)
        removed += 1
print(f"[fbx-anim-to-glb] meshes supprimés: {removed}")

bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format='GLB',
    export_animations=True,
    export_skins=False,
    export_morph=False,
    export_apply=False,
)
print(f"[fbx-anim-to-glb] exporté: {out_glb}")
