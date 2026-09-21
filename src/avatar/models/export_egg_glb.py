"""egg.blend -> egg.glb を書き出す。

    "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b \
        src/avatar/models/egg.blend -P src/avatar/models/export_egg_glb.py

.blend は読むだけで保存しない。形・動きを直したら `egg_build.py` を流し直し、
**続けてこれも流す**（.blend を直しただけではアプリの見た目は変わらない）。

ひよこ（`export_glb.py`）と違って、やることは間引きだけ。たまごは色を2つの
マテリアル（`Egg_Shell` / `Egg_Inner`）で塗り分けているので、頂点カラーに
マスクを載せる必要がない。色はアプリ（Chick.tsx）がマテリアル名で引いて入れる。
"""
import os

import bpy

# 間引きの比率。**割れ口のギザギザは輪郭そのもの**なので落とせない。
# 効くのは滑らかな殻の面だけで、ここを削りすぎると丸みが角ばる
RATIOS = {
    'Shell_Bottom': 0.5,
    'Shell_Top': 0.5,
}

RIG = 'EggRig'

for obj in list(bpy.data.objects):
    if obj.name not in RATIOS and obj.name != RIG:
        bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.object.select_all(action='DESELECT')
for name, ratio in RATIOS.items():
    obj = bpy.data.objects[name]
    obj.modifiers.new('decimate', 'DECIMATE').ratio = ratio
    obj.select_set(True)
bpy.data.objects[RIG].select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['Shell_Bottom']

out = os.path.join(os.path.dirname(bpy.data.filepath), 'egg.glb')
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    use_selection=True,
    export_apply=True,   # Decimate と Smooth by Angle を焼き込む
    export_yup=True,     # Blender は Z 上、three.js は Y 上
    export_cameras=False,
    export_lights=False,
    export_texcoords=False,
    export_animations=True,
    # **アクション1本を1クリップとして出す。** 指定しないと、割り当てている
    # EggIdle しか出ず、割れるアニメーションが消える
    export_animation_mode='ACTIONS',
    # 同じ値が続くキーも残す。消されるとクリップの長さが縮む
    export_optimize_animation_size=False,
)
print('exported', out, os.path.getsize(out))
