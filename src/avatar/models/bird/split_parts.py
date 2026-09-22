"""BirdRender.fbx を読み、一体のメッシュを部位ごとのオブジェクトに割る。

    "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b \
        -P src/avatar/models/bird/split_parts.py

読み込みは `import_fbx.py` に任せていて、FBX から bird_parts.blend まで一息で通る。
途中の .blend は残さない（数秒で作り直せるものを版管理しても仕方がない）。

出すのは Beak / Body / Wing_L / Wing_R / Foot_L / Foot_R / Tail の7つ。

**座標で切ってはいない。** 切ろうとすると境界が稜線に乗らず、必ずギザギザか
不自然な直線になる。代わりに、モデルが元から持っている2つの切れ目を使う。

1. **メッシュの島**（33個）。風切羽と尾羽の32枚は独立した島なので、連結成分で取れる。

2. **UVの継ぎ目**（97島）。元の作者が張った継ぎ目で、これが部位の境と一致している。
   くちばし・足・指・翼の腕が、それぞれ独立したUV島になっている。

この2つで7部位すべてが埋まる。下の THRESHOLDS は「どの島がどの部位か」を
言い当てるためだけのもので、メッシュを切る平面ではない。島はまるごと
どれか1つの部位に入るので、境界はモデル本来の継ぎ目そのままになる。

各島がどこにあるかは `uvdump` 相当の棚卸しで確認した値。値の根拠は各定数の脇に。
"""
import os
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_BLEND = os.path.join(HERE, 'bird_parts.blend')
OUT_GLB = os.path.join(HERE, 'bird_parts.glb')

# -P で流したスクリプトの置き場は sys.path に入らないので、自分で足す。
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import import_fbx  # noqa: E402

SRC = 'Cube_001'

Y0 = 0.16          # 胴体の中心線。左右の振り分けはここを基準にする
TAIL_X = 0.85      # これより後ろにある羽根は尾羽（風切羽は x>0.9 にしかない）
FOOT_Z = -1.10     # 足まわりのUV島は上端が -1.19 以下。胴の殻は -0.03 なので離れている
BEAK_X = 1.88      # くちばしのUV島だけが x=1.93 まで届く。胴の殻は 1.85 で止まる
ARM_Y_R = -0.15    # 右の腕のUV島は y=-0.54 まで出る。胴の殻は -0.10 止まり
ARM_Y_L = 0.60     # 左の腕のUV島は y=0.86 まで出る。胴の殻は 0.54 止まり

PARTS = ['Beak', 'Body', 'Wing_L', 'Wing_R', 'Foot_L', 'Foot_R', 'Tail']


class Box:
    """島の占める範囲。"""

    def __init__(self):
        self.lo = Vector((1e9, 1e9, 1e9))
        self.hi = Vector((-1e9, -1e9, -1e9))

    def add(self, p):
        for k in range(3):
            self.lo[k] = min(self.lo[k], p[k])
            self.hi[k] = max(self.hi[k], p[k])

    @property
    def center(self):
        return (self.lo + self.hi) / 2


def mesh_islands(bm):
    """連結成分を面インデックスの集合で返す。大きい順。"""
    seen = set()
    out = []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, group = [f], []
        seen.add(f.index)
        while stack:
            cur = stack.pop()
            group.append(cur.index)
            for e in cur.edges:
                for o in e.link_faces:
                    if o.index not in seen:
                        seen.add(o.index)
                        stack.append(o)
        out.append(group)
    out.sort(key=len, reverse=True)
    return out


def uv_islands(bm, uv):
    """UVが繋がっている面をまとめる。UVの継ぎ目でちょうど割れる。"""
    parent = list(range(len(bm.faces)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    shared = {}
    for f in bm.faces:
        for l in f.loops:
            k = (round(l[uv].uv.x, 5), round(l[uv].uv.y, 5))
            shared.setdefault(k, []).append(f.index)
    for fs in shared.values():
        for o in fs[1:]:
            ra, rb = find(fs[0]), find(o)
            if ra != rb:
                parent[ra] = rb

    groups = {}
    for f in bm.faces:
        groups.setdefault(find(f.index), []).append(f.index)
    return list(groups.values())


def name_feather(box):
    """独立した羽根1枚。尾羽の扇は胴体よりずっと後ろにある。"""
    if box.center.x < TAIL_X:
        return 'Tail'
    return 'Wing_L' if box.center.y > Y0 else 'Wing_R'


def name_uv_island(box):
    """胴体側のUV島。上から順に、はっきり離れているものを先に取る。"""
    if box.hi.z < FOOT_Z:
        return 'Foot_L' if box.center.y > Y0 else 'Foot_R'
    if box.hi.x > BEAK_X:
        return 'Beak'
    if box.lo.y < ARM_Y_R:
        return 'Wing_R'
    if box.hi.y > ARM_Y_L:
        return 'Wing_L'
    return 'Body'


import_fbx.load()

ob = bpy.data.objects[SRC]
me = ob.data
mw = ob.matrix_world

bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
uv = bm.loops.layers.uv.active


def box_of(face_ids):
    b = Box()
    for fi in face_ids:
        for v in bm.faces[fi].verts:
            b.add(mw @ v.co)
    return b


mislands = mesh_islands(bm)
body_faces = set(mislands[0])
print(f'メッシュ島 {len(mislands)}（うち羽根 {len(mislands) - 1} 枚）')

face_part = {}

# 羽根はメッシュ島まるごと1枚。
for g in mislands[1:]:
    part = name_feather(box_of(g))
    for fi in g:
        face_part[fi] = part

# 胴体側はUV島まるごと。
uvs = [g for g in uv_islands(bm, uv) if g[0] in body_faces]
print(f'胴体側のUV島 {len(uvs)}')
for g in uvs:
    part = name_uv_island(box_of(g))
    for fi in g:
        face_part[fi] = part

bm.free()

missing = [p.index for p in me.polygons if p.index not in face_part]
if missing:
    raise RuntimeError(f'部位が決まらない面が {len(missing)} 枚ある')

uv_src = me.uv_layers.active

for name in PARTS:
    faces = [p for p in me.polygons if face_part[p.index] == name]
    if not faces:
        print(f'  {name}: (なし)')
        continue

    # 使う頂点だけ詰め直す。
    remap = {}
    co = []
    for p in faces:
        for vi in p.vertices:
            if vi not in remap:
                remap[vi] = len(co)
                co.append(me.vertices[vi].co.copy())
    polys = [tuple(remap[vi] for vi in p.vertices) for p in faces]

    new_me = bpy.data.meshes.new(name)
    new_me.from_pydata(co, [], polys)
    new_me.validate()

    if uv_src:
        layer = new_me.uv_layers.new(name=uv_src.name)
        k = 0
        for p in faces:
            for li in p.loop_indices:
                layer.data[k].uv = uv_src.data[li].uv
                k += 1

    new_ob = bpy.data.objects.new(name, new_me)
    new_ob.matrix_world = mw
    for mat in me.materials:
        new_me.materials.append(mat)
    bpy.context.collection.objects.link(new_ob)
    print(f'  {name}: {len(co)} verts / {len(polys)} faces')

bpy.data.objects.remove(ob, do_unlink=True)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('wrote', OUT_BLEND)

bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_apply=True)
print('wrote', OUT_GLB)
