"""chick.blend -> chick.glb を書き出す。

    "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b \
        src/avatar/models/chick.blend -P src/avatar/models/export_glb.py

.blend は読むだけで保存しない（この中で壊しているのはメモリ上のコピー）。
形・塗り分けを直したら必ずこれを流し直して .glb を更新すること。

ここでやっていることは3つ。

1. **間引き**。素のままだと約 4MB。アバターは小さくしか出ないので落としてよい。
   比率は「輪郭が崩れない範囲で最小」を見て決めた値。

2. **塗り分けマスクを頂点カラーとして出す**。glTF はノードの Mix を運べないので、
   Blender 側の「マスク属性 → 2色を Mix」という作りはそのままでは消える。
   マスクだけを COLOR_0 に載せて、2色の指定はアプリ側（look.ts）に任せる。
   胴体の Bib（下半分が白）はこのまま、目は白ハイライトが固定色なので
   ここで RGB に焼いてしまう。

3. カメラ・ライトを落とす。アプリ側（AvatarCanvas.tsx）で用意するため。
"""
import os
import bpy

RATIOS = {
    'Body': 0.15,
    'Beak': 0.3,
    'Eye_L': 0.2,
    'Eye_R': 0.2,
    'Foot_L': 0.09,
    'Foot_R': 0.09,
    'HeadFeather': 0.4,
    'Wing_L': 0.22,
    'Wing_R': 0.22,
}

# 目のハイライト。Eye_Black マテリアルの Mix に入っている2色と同じものを焼く。
EYE_DARK = (0.012, 0.012, 0.014, 1.0)
EYE_HILITE = (1.0, 1.0, 1.0, 1.0)


_rebuilt = {}


def use_vertex_color(obj, layer):
    """COLOR_0 をそのまま Base Color に挿した書き出し用マテリアルへ差し替える。

    glTF の書き出しは「マテリアルが実際に使っている頂点カラー」しか出さない。
    元のマテリアルは Attribute ノード経由で、これだと拾われず
    `The active Vertex Color will not be exported` で黙って落ちる。
    """
    # マテリアル名はアプリ側が色を差し替える手掛かりなので、元の名前を引き継ぐ。
    # 左右の目のように同じマテリアルを共有しているものは、作り直したものも共有させる
    # （別々に作ると Blender が Eye_Black.001 と連番を振り、名前で引けなくなる）。
    old = obj.data.materials[0]
    name = old.name.removesuffix('_src')   # 共有相手が先に通って改名済みのことがある
    obj.data.materials.clear()
    if name in _rebuilt:
        obj.data.materials.append(_rebuilt[name])
        return
    old.name = name + '_src'   # 新しい方に元の名前を渡す
    mat = bpy.data.materials.new(name)
    _rebuilt[name] = mat
    tree = mat.node_tree
    bsdf = tree.nodes['Principled BSDF']
    node = tree.nodes.new('ShaderNodeVertexColor')
    node.layer_name = layer
    tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    obj.data.materials.append(mat)


def bake_eye(obj):
    """Hilite マスク（0=黒目 1=ハイライト）を RGB の頂点カラーに焼く。"""
    src = obj.data.color_attributes['Hilite']
    dst = obj.data.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    for i, d in enumerate(src.data):
        f = d.color[0]
        dst.data[i].color = tuple(
            EYE_DARK[c] + (EYE_HILITE[c] - EYE_DARK[c]) * f for c in range(4)
        )
    # 焼いた後のマスクは要らない。残すと COLOR_0 がマスクの方になり、
    # three.js は COLOR_0 しか見ないのでハイライトが出ない。
    obj.data.color_attributes.remove(src)
    obj.data.color_attributes.active_color = dst
    use_vertex_color(obj, 'Col')


# カメラ・ライト・作業用の余りものは .glb に要らない
for obj in list(bpy.data.objects):
    if obj.name not in RATIOS:
        bpy.data.objects.remove(obj, do_unlink=True)

use_vertex_color(bpy.data.objects['Body'], 'Bib')
bake_eye(bpy.data.objects['Eye_L'])
bake_eye(bpy.data.objects['Eye_R'])

bpy.ops.object.select_all(action='DESELECT')
for name, ratio in RATIOS.items():
    obj = bpy.data.objects[name]
    obj.modifiers.new('decimate', 'DECIMATE').ratio = ratio
    obj.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['Body']

out = os.path.join(os.path.dirname(bpy.data.filepath), 'chick.glb')
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    use_selection=True,
    export_apply=True,   # Decimate を焼き込む
    export_yup=True,     # Blender は Z 上、three.js は Y 上
    export_cameras=False,
    export_lights=False,
    export_texcoords=False,
)
print('exported', out, os.path.getsize(out))
