"""BirdRender.fbx -> bird.blend を作る。

    "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b \
        -P src/avatar/models/import_bird_fbx.py

このFBXは **FBX 6100 の ASCII形式**（Blender 2.66 が 2019 年に書き出したもの）で、
いまの Blender の FBX インポータはバイナリの 7100 以降しか読まない。
`bpy.ops.import_scene.fbx` は "ASCII FBX files are not supported" で弾かれる。

そこで中身を自分で読む。6100 ASCII は入れ子のテキストなので、必要なものだけ拾えばよい:

    Model: "Model::<名前>", "Mesh" { ... Vertices / PolygonVertexIndex / UV ... }

配列は長いと折り返され、続きの行は `,` で始まる。そこだけ気をつければ素直に読める。

座標系は GlobalSettings が UpAxis=1（Y-up）。Blender は Z-up なので X+90° で起こす。

マテリアルの貼っていたテクスチャ SparrowAO.png は FBX に埋まっておらず、
参照先も書き出した人の 2019 年当時のパス（C:\\bLENDERpROJECT\\...）なので解決しない。
ここでは拡散色だけ移して、テクスチャは後で貼り直す前提にしてある。
"""
import os
import re
import math

import bpy
from mathutils import Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
FBX = os.path.join(HERE, 'BirdRender.fbx')
BLEND = os.path.join(HERE, 'bird.blend')
GLB = os.path.join(HERE, 'bird.glb')

# Y-up -> Z-up。
CONV = Matrix.Rotation(math.radians(90.0), 4, 'X')

# Plane_001 は鳥の後ろに立てた湾曲した背景板で、レンダリング用の書き割り。
# 鳥より一回り大きく視界を埋めるだけなので取らない。
SKIP = {'Plane_001'}

MODEL_RE = re.compile(r'Model:\s*"Model::(.+?)",\s*"(\w+)"\s*\{')
PROP_RE = re.compile(r'Property:\s*"(.+?)",\s*".+?",\s*".*?",(.*)')


def read_blocks(path):
    """Mesh の Model ブロックを (名前, 中身の行リスト) で返す。"""
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.read().splitlines()

    blocks = []
    i = 0
    while i < len(lines):
        m = MODEL_RE.search(lines[i])
        if m and m.group(2) == 'Mesh':
            depth = 1
            body = []
            i += 1
            while i < len(lines) and depth > 0:
                depth += lines[i].count('{') - lines[i].count('}')
                if depth > 0:
                    body.append(lines[i])
                i += 1
            if m.group(1) not in SKIP and any('Vertices:' in ln for ln in body):
                blocks.append((m.group(1), body))
            continue
        i += 1
    return blocks


def take_array(body, key):
    """`key: 1,2,3` を折り返しごと集めて float のリストで返す。無ければ None。"""
    out = None
    for ln in body:
        s = ln.strip()
        if out is None:
            if s.startswith(key + ':'):
                out = s[len(key) + 1:]
            continue
        if s.startswith(','):
            out += s
        else:
            break
    if out is None:
        return None
    return [float(v) for v in out.split(',') if v.strip()]


def take_prop(body, name, default):
    for ln in body:
        m = PROP_RE.search(ln)
        if m and m.group(1) == name:
            return [float(v) for v in m.group(2).split(',')]
    return default


def build_faces(pvi):
    """PolygonVertexIndex を面ごとに切る。末尾の頂点は負数で示される。"""
    faces = []
    face = []
    for v in pvi:
        v = int(v)
        if v < 0:
            face.append(-v - 1)
            faces.append(tuple(face))
            face = []
        else:
            face.append(v)
    return faces


def build(name, body):
    verts = take_array(body, 'Vertices')
    pvi = take_array(body, 'PolygonVertexIndex')
    co = [tuple(verts[i:i + 3]) for i in range(0, len(verts), 3)]
    faces = build_faces(pvi)

    me = bpy.data.meshes.new(name)
    me.from_pydata(co, [], faces)
    me.validate()

    uv = take_array(body, 'UV')
    uv_index = take_array(body, 'UVIndex')
    if uv and uv_index:
        pairs = [(uv[i], uv[i + 1]) for i in range(0, len(uv), 2)]
        layer = me.uv_layers.new(name='UVMap')
        for loop in me.loops:
            layer.data[loop.index].uv = pairs[int(uv_index[loop.index])]

    ob = bpy.data.objects.new(name, me)
    loc = take_prop(body, 'Lcl Translation', [0, 0, 0])
    rot = take_prop(body, 'Lcl Rotation', [0, 0, 0])
    scl = take_prop(body, 'Lcl Scaling', [1, 1, 1])
    local = (
        Matrix.Translation(loc)
        @ Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
        @ Matrix.Diagonal(scl + [1.0])
    )
    ob.matrix_world = CONV @ local

    bpy.context.collection.objects.link(ob)
    print(f'  {name}: {len(co)} verts / {len(faces)} faces')
    return ob


bpy.ops.wm.read_factory_settings(use_empty=True)

blocks = read_blocks(FBX)
print(f'--- {len(blocks)} mesh blocks ---')
objects = [build(name, body) for name, body in blocks]

# マテリアルは拡散色だけ。テクスチャは解決しないので貼らない。
mat = bpy.data.materials.new('SparrowAO')
mat.use_nodes = True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1.0)
for ob in objects:
    ob.data.materials.append(mat)

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print('wrote', BLEND)

bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', export_apply=True)
print('wrote', GLB)
