"""stage.blend -> stage.glb を書き出す。

    "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b \
        src/avatar/models/stage/stage.blend -P src/avatar/models/stage/export_glb.py

.blend は読むだけで保存しない。形を直したら `build.py` を流し直し、
**続けてこれも流す**（.blend を直しただけではアプリの見た目は変わらない）。

動きも骨も無いので、メッシュとマテリアルをそのまま出すだけ。
色は Blender で付けた色がそのまま出る（ひよこと違ってアプリは塗り直さない）。
"""
import os

import bpy

bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['Floor']

out = os.path.join(os.path.dirname(bpy.data.filepath), 'stage.glb')
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    use_selection=True,
    export_apply=True,   # Smooth by Angle を焼き込む
    export_yup=True,     # Blender は Z 上、three.js は Y 上
    export_cameras=False,
    export_lights=False,
    export_texcoords=False,
    export_animations=False,
)
print('exported', out, os.path.getsize(out))
