"""stage.blend（ダッシュボードの背景ステージ）を一から作り直す。

    "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b \
        --factory-startup -P src/avatar/models/stage/build.py

**このスクリプトが原典。** stage.blend の中を手でいじらず、ここを直して流し直す
（→ docs/BLENDER_MODELING_NOTES.md「成果物の残し方」）。
出来上がった stage.blend には、このファイル自身が `stage_build` テキストとして入る。

もとは CSS で描いていたダッシュボードの背景を立体に起こしたもの。アプリでは `RoomStage.tsx` が置く:

- `Floor` / `Wall` / `Baseboard` … 床と奥の壁、壁の足元の幅木
- `Window`（枠・桟・窓台）/ `Window_Glass` / `Window_Cloud` … 上が半円の窓
- `Books`（＋`Books_Shadow`） … 左の床に積んだ本
- `Plant`（＋`Plant_Shadow`） … 右の床の植木鉢

**光は Blender で焼き込む**（`bake_lighting`）。Cycles で部屋を照らした結果を
テクスチャにして貼るので、アプリ（RoomStage.tsx）は照明の計算をせず貼るだけで済む。
そのほうが明るく柔らかい光と影が出て、ブラウザの負担も軽い。
本と植木鉢は狭い画面で横へずらすので、床への影は床に焼かず、それぞれの下に敷いた
影の板（`*_Shadow`）に焼いて一緒に動かす。

座標はアプリのステージと同じ。**床が z=0、原点がひよこの定位置**で、
カメラは -Y 側（three.js の +Z）から見る。ひよこの背丈は約 2。
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

# --- 部屋 ----------------------------------------------------------------
# ステージは画面全体に広がる。見える範囲は画面の px ÷ 118（AvatarCanvas の PX_PER_UNIT）で、
# 奥の壁のあたりではさらに 1.2 倍ほど広く見える。2560x1440px の画面でも壁の端と上が
# 切れないよう、幅と高さはそれより広く取る
ROOM_W = 40.0
WALL_Y = 3.0          # 奥の壁の位置。ひよこが歩く奥行き（±1.2）より十分奥
FLOOR_FRONT = -5.0    # 床の手前の端。カメラより手前まで伸ばす
WALL_H = 20.0

# --- 窓 ------------------------------------------------------------------
# CSS の窓（132x210px・枠12px）を単位に直した大きさ。上は半円
WIN_W = 1.9
WIN_H = 3.0           # 下端から半円のてっぺんまで
WIN_BOTTOM = 2.6
WIN_FRAME = 0.18
WIN_DEPTH = 0.12

# --- 飾りの置き場 ---------------------------------------------------------
# ひよこが歩く範囲（ROAM_X は画面幅しだい、ROAM_Z ±1.2）の奥に置く。
# 手前に置くとひよこが飾りをすり抜けて見える
BOOKS_AT = Vector((-4.6, 2.0, 0.0))
PLANT_AT = Vector((4.6, 2.0, 0.0))

# --- 光（焼き込み） ---------------------------------------------------------
# 明るさの絶対値は最後に揃える（EXPOSURE_TARGET）ので、ここで決まるのは光の配分だけ
SKY_COLOR = (0.92, 0.96, 1.0)     # 空の光。部屋全体をむらなく持ち上げる
SKY_STRENGTH = 1.0
# 手前上からの大きな面光源。正面の壁と床を柔らかく照らす。**強すぎると壁のまん中が白く飛んで
# 壁の色が消える**ので、空の光より控えめにする
FILL_ENERGY = 600.0
SUN_STRENGTH = 3.0                 # 窓から差し込む日差し。床に窓の形の明るい所ができる
SUN_COLOR = (1.0, 0.94, 0.84)
# 壁のまん中あたりの明るさを、壁の色（#fcf4e5）の何倍にするか。1 で CSS の壁と同じ色
EXPOSURE_TARGET = 1.0
BAKE_SAMPLES = 128
# 焼くテクスチャの大きさ。光と影は柔らかいので、大きな面でもこれで足りる
BAKE_SIZE = {'Floor': 1024, 'Wall': 1024, 'Baseboard': 512, 'Window': 1024,
             'Books': 512, 'Plant': 1024}
SHADOW_SIZE = 256
# 焼かない物。空の色と雲は照らされる物ではないので、塗った色のまま出す
UNLIT = ('Window_Glass', 'Window_Cloud')

# --- 色 ------------------------------------------------------------------
# CSS の色をそのまま線形に直したもの。**マテリアル名はアプリが引く手掛かり**なので変えない
COLORS = {
    'Stage_Wall': '#fcf4e5',
    'Stage_Floor': '#efe6d6',
    'Stage_Baseboard': '#fbf9f5',
    'Stage_WindowFrame': '#fbf9f5',
    'Stage_Glass': '#deeffb',
    'Stage_Cloud': '#ffffff',
    'Stage_BookGreen': '#afc7a6',
    'Stage_BookBlue': '#92aac2',
    'Stage_BookTan': '#e3c6a9',
    'Stage_Pages': '#fffaf1',
    'Stage_Pot': '#e2a88a',
    'Stage_Soil': '#8a6a55',
    'Stage_Leaf': '#7fae7a',
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    h = COLORS[name].lstrip('#')
    rgb = [srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1.0)
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.85
    return mat


def new_object(name, bm, mat, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    me.materials.append(material(mat))
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return obj


def rounded_box(name, size, loc, mat, bevel=0.03, rot_z=0.0):
    """角を丸めた箱。パステルの小物は角が立つと硬く見える。"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=3, affect='EDGES')
    obj = new_object(name, bm, mat)
    obj.location = loc
    obj.rotation_euler.z = rot_z
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
    return obj


def arch_outline(w, h, n=32):
    """下が四角・上が半円の輪郭（反時計回り、XZ 平面）。"""
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0)]
    for i in range(n + 1):
        a = math.pi * i / n
        pts.append((r * math.cos(a), h - r + r * math.sin(a)))
    return pts


def lathe(name, profile, mat, seg=48):
    """(半径, 高さ) の列を z 軸まわりに回した回転体。鉢の形はこれで作る。"""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * k / seg),
                              r * math.sin(2 * math.pi * k / seg), z)) for k in range(seg)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return new_object(name, bm, mat, smooth=True)


# --- 作る ------------------------------------------------------------------

def build_room():
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=(ROOM_W, WALL_Y - FLOOR_FRONT, 1), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, (WALL_Y + FLOOR_FRONT) / 2, 0), verts=bm.verts)
    new_object('Floor', bm, 'Stage_Floor')

    # 壁は窓の穴をあけて張る。穴の輪郭と外周を1枚の面にして三角形分割する
    bm = bmesh.new()
    outer = [(-ROOM_W / 2, 0), (ROOM_W / 2, 0), (ROOM_W / 2, WALL_H), (-ROOM_W / 2, WALL_H)]
    hole = [(x, z + WIN_BOTTOM) for x, z in arch_outline(WIN_W + 2 * WIN_FRAME, WIN_H + WIN_FRAME)]
    vo = [bm.verts.new((x, WALL_Y, z)) for x, z in outer]
    vh = [bm.verts.new((x, WALL_Y, z)) for x, z in hole]
    edges = [bm.edges.new((a, b)) for a, b in zip(vo, vo[1:] + vo[:1])]
    edges += [bm.edges.new((a, b)) for a, b in zip(vh, vh[1:] + vh[:1])]
    bmesh.ops.triangle_fill(bm, edges=edges, use_beauty=True)
    for f in bm.faces:
        if f.normal.y > 0:          # 面はカメラ（-Y）へ向ける
            f.normal_flip()
    new_object('Wall', bm, 'Stage_Wall')

    rounded_box('Baseboard', (ROOM_W, 0.08, 0.28), (0, WALL_Y - 0.04, 0.14), 'Stage_Baseboard', bevel=0.02)


def build_window():
    outer = arch_outline(WIN_W + 2 * WIN_FRAME, WIN_H + WIN_FRAME)
    inner = arch_outline(WIN_W, WIN_H)
    # 外輪郭と内輪郭は点の数が同じなので、そのまま帯でつないで枠を押し出す
    bm = bmesh.new()
    y0, y1 = WALL_Y - WIN_DEPTH, WALL_Y + 0.02
    rings = []
    for pts, y in ((outer, y0), (inner, y0), (inner, y1), (outer, y1)):
        rings.append([bm.verts.new((x, y, z + WIN_BOTTOM)) for x, z in pts])
    n = len(outer)
    for a, b in zip(rings, rings[1:] + rings[:1]):
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    frame = new_object('Window_Frame', bm, 'Stage_WindowFrame')
    bpy.ops.object.select_all(action='DESELECT')
    frame.select_set(True)
    bpy.context.view_layer.objects.active = frame
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))

    # ガラス（奥の空）。枠の奥に1枚
    bm = bmesh.new()
    v = [bm.verts.new((x, WALL_Y + 0.01, z + WIN_BOTTOM)) for x, z in inner]
    bm.faces.new(v[::-1])
    new_object('Window_Glass', bm, 'Stage_Glass')

    # 十字の桟
    bar = 0.07
    rounded_box('Window_Bar_V', (bar, 0.06, WIN_H - 0.05), (0, WALL_Y - 0.03, WIN_BOTTOM + (WIN_H - 0.05) / 2),
                'Stage_WindowFrame', bevel=0.015)
    # 横の桟は縦の桟のところで左右に分ける。貫通させると、隠れた部分の暗さが焼き込みで
    # 交点ににじみ出て黒い点になる
    half = (WIN_W - bar) / 2
    for name, sx in (('Window_Bar_HL', -1), ('Window_Bar_HR', 1)):
        rounded_box(name, (half, 0.06, bar), (sx * (bar + half) / 2, WALL_Y - 0.03, WIN_BOTTOM + WIN_H * 0.45),
                    'Stage_WindowFrame', bevel=0.015)

    # 窓台。壁から少し手前へ張り出す
    rounded_box('Window_Sill', (WIN_W + 2 * WIN_FRAME + 0.3, 0.32, 0.12),
                (0, WALL_Y - 0.14, WIN_BOTTOM - 0.06), 'Stage_WindowFrame', bevel=0.03)

    # 空に浮かぶ雲（CSS の ::after の白い半楕円）。丸を3つ寄せた平たい板
    bm = bmesh.new()
    for cx, cz, r in ((0.35, 4.55, 0.22), (0.6, 4.62, 0.28), (0.82, 4.52, 0.18)):
        ret = bmesh.ops.create_circle(bm, cap_ends=True, radius=r, segments=24)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'), verts=ret['verts'])
        bmesh.ops.translate(bm, vec=(cx, WALL_Y + 0.005, cz), verts=ret['verts'])
    for f in bm.faces:
        if f.normal.y > 0:
            f.normal_flip()
    new_object('Window_Cloud', bm, 'Stage_Cloud')


def build_books():
    # 下から緑・青・茶（CSS の first-child が一番上に来る並びを、床から積んだ順に直した）
    specs = [
        ('Book_1', 'Stage_BookTan', 1.35, 0.95, 0.26, 0.00, 0.06),
        ('Book_2', 'Stage_BookBlue', 1.25, 0.88, 0.24, -0.08, -0.10),
        ('Book_3', 'Stage_BookGreen', 1.15, 0.82, 0.22, 0.10, 0.14),
    ]
    z = 0.0
    for name, mat, w, d, h, dx, rot in specs:
        loc = BOOKS_AT + Vector((dx, 0, z + h / 2))
        book = rounded_box(name, (w, d, h), loc, mat, bevel=0.035, rot_z=rot)
        # ページ。表紙より少し小さい白い芯を、背表紙の反対側（+x）へずらして覗かせる
        pages = rounded_box(name + '_Pages', (w - 0.08, d - 0.06, h * 0.72), (0.03, 0, 0), 'Stage_Pages', bevel=0.02)
        pages.parent = book
        z += h


def build_plant():
    # 鉢。縁が少し張り出した植木鉢のプロファイル（半径, 高さ）
    profile = [(0.0, 0.0), (0.30, 0.0), (0.34, 0.04), (0.40, 0.52), (0.46, 0.54),
               (0.47, 0.66), (0.43, 0.68), (0.41, 0.64), (0.0, 0.64)]
    pot = lathe('Pot', profile, 'Stage_Pot')
    pot.location = PLANT_AT
    soil = lathe('Soil', [(0.0, 0.0), (0.40, 0.0), (0.40, 0.02), (0.0, 0.02)], 'Stage_Soil')
    soil.location = PLANT_AT + Vector((0, 0, 0.60))

    # 葉。平たい楕円体を根元から外へ放射状に倒す。**角度を少しずつばらす**と作り物っぽさが抜ける
    leaves = [(0, 0.25, 0.80), (70, 0.6, 0.70), (140, 0.55, 0.78), (215, 0.65, 0.66),
              (290, 0.55, 0.74), (35, 1.0, 0.60), (180, 1.05, 0.62), (250, 0.3, 0.78), (320, 1.0, 0.58),
              (110, 0.15, 0.72)]
    for i, (az, tilt, length) in enumerate(leaves):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=0.5)
        bmesh.ops.scale(bm, vec=(0.55 * length, 0.08, length), verts=bm.verts)
        # 先をすこし細くする（上半分を絞る）。絞りすぎると多肉植物に見える
        for v in bm.verts:
            t = v.co.z / (0.5 * length)
            if t > 0:
                v.co.x *= 1 - 0.35 * t * t
        bmesh.ops.translate(bm, vec=(0, 0, 0.5 * length), verts=bm.verts)
        leaf = new_object(f'Leaf_{i + 1}', bm, 'Stage_Leaf', smooth=True)
        leaf.location = PLANT_AT + Vector((0, 0, 0.58))
        leaf.rotation_euler = (tilt, 0, math.radians(az))


# --- まとめる ----------------------------------------------------------------

def select_only(objs, active):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def join(name, names, origin):
    """いくつかの物を1つにまとめる。焼くテクスチャを1枚にするため。

    原点は床の上の置き場（`origin`）に置く。アプリはこの位置を横へずらして寄せる。
    """
    objs = [bpy.data.objects[n] for n in names]
    # Smooth by Angle などのモディファイアを先に焼く。join は1つ目以外のモディファイアを捨てる
    select_only(objs, objs[0])
    bpy.ops.object.convert(target='MESH')
    select_only(objs, objs[0])
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = obj.data.name = name
    bpy.context.scene.cursor.location = origin
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return obj


def group_parts():
    join('Window', ['Window_Frame', 'Window_Bar_V', 'Window_Bar_HL', 'Window_Bar_HR', 'Window_Sill'], Vector((0, WALL_Y, 0)))
    books = [o.name for o in bpy.data.objects if o.name.startswith('Book_')]
    join('Books', books, BOOKS_AT)
    plant = ['Pot', 'Soil'] + [o.name for o in bpy.data.objects if o.name.startswith('Leaf_')]
    join('Plant', plant, PLANT_AT)
    for name in ('Floor', 'Wall', 'Baseboard'):
        o = bpy.data.objects[name]
        select_only([o], o)
        bpy.ops.object.convert(target='MESH')


def add_shadow_plane(owner, pad=0.7):
    """動く物の足元に敷く影の板。床に焼けない接地の影をここに焼いて、一緒に動かす。"""
    lo = Vector([min(v[i] for v in owner.bound_box) for i in range(3)])
    hi = Vector([max(v[i] for v in owner.bound_box) for i in range(3)])
    bm = bmesh.new()
    # UV は板全体をテクスチャいっぱいに（calc_uvs）。余白が残ると、焼かれない黒が
    # 「濃い影」として縁ににじむ
    bm.loops.layers.uv.new('UVMap')
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, calc_uvs=True)
    bmesh.ops.scale(bm, vec=(hi.x - lo.x + 2 * pad, hi.y - lo.y + 2 * pad, 1), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0.003), verts=bm.verts)
    me = bpy.data.meshes.new(owner.name + '_Shadow')
    bm.to_mesh(me)
    bm.free()
    plane = bpy.data.objects.new(owner.name + '_Shadow', me)
    bpy.context.collection.objects.link(plane)
    # bound_box は持ち主から見た座標なので、板もそのまま持ち主の子として置けば足元に来る
    plane.parent = owner
    return plane


# --- 焼き込み ----------------------------------------------------------------

def setup_lights():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = BAKE_SAMPLES
    sc.cycles.device = 'CPU'
    world = sc.world or bpy.data.worlds.new('World')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*SKY_COLOR, 1)
    bg.inputs['Strength'].default_value = SKY_STRENGTH
    # 影の板の AO はこの距離より近い物だけを拾う。接地のあたりだけを濃くする
    world.light_settings.distance = 0.6

    fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'AREA'))
    fill.data.energy = FILL_ENERGY
    fill.data.size = 24
    fill.location = (0, -12, 10)
    fill.rotation_euler = (math.radians(45), 0, 0)
    sc.collection.objects.link(fill)

    # 日差しは壁の向こうから、窓を通して床へ落とす。高さ50度で、窓の形が床のまん中あたりに来る
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = SUN_STRENGTH
    sun.data.color = SUN_COLOR
    sun.data.angle = math.radians(4)       # 影の縁をぼかす
    sun.rotation_euler = (math.radians(-40), 0, math.radians(15))
    sc.collection.objects.link(sun)

    # ガラスと雲は日差しを遮らない（窓の穴から光を通すため）
    for name in UNLIT:
        bpy.data.objects[name].visible_shadow = False


def new_image(name, size, alpha=False):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    return bpy.data.images.new(name, size, size, alpha=alpha)


def bake_into(obj, img, bake_type, **kw):
    """`obj` の全マテリアルに焼き先の画像ノードを差して、Cycles で焼く。"""
    for mat in obj.data.materials:
        nodes = mat.node_tree.nodes
        node = nodes.new('ShaderNodeTexImage')
        node.image = img
        nodes.active = node
    select_only([obj], obj)
    bpy.ops.object.bake(type=bake_type, margin=8, use_clear=True, **kw)


def planar_uv(obj, u_of, v_of):
    """平らで単純な物の UV を、座標から直接決める。

    自動の展開（smart_project）は縦横比を保つので、幅40・高さ0.28の幅木はテクスチャの端の
    数画素に押し込まれて真っ黒になる。光は緩やかにしか変わらないので、引き伸ばして
    テクスチャ全体に広げたほうがきれいに出る。
    """
    me = obj.data
    uv = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
    for poly in me.polygons:
        n = obj.matrix_world.to_3x3() @ poly.normal
        for li in poly.loop_indices:
            co = obj.matrix_world @ me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (u_of(co), v_of(co, n))


def baseboard_v(c, n):
    """幅木の見える面（正面と上面）を、正面の下端から上面の奥まで1本の帯に開く。

    裏（壁に付く面）と底は見えないうえ、そのまま開くと正面と重なって焼き込みが
    黒く潰れる。帯の外（下の端）へまとめて逃がす。
    """
    if n.y > 0.5 or n.z < -0.5:
        return 0.03
    front = WALL_Y - 0.08
    return 0.1 + 0.9 * (c.z + (c.y - front)) / 0.36


def unwrap(obj):
    if obj.name == 'Floor':
        return planar_uv(obj, lambda c: c.x / ROOM_W + 0.5, lambda c, n: (c.y - FLOOR_FRONT) / (WALL_Y - FLOOR_FRONT))
    if obj.name == 'Wall':
        return planar_uv(obj, lambda c: c.x / ROOM_W + 0.5, lambda c, n: c.z / WALL_H)
    if obj.name == 'Baseboard':
        return planar_uv(obj, lambda c: c.x / ROOM_W + 0.5, baseboard_v)
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')


def baked_material(obj, img, blend=False):
    """焼いた画像を貼るだけのマテリアルに差し替える。アプリはこの画像をそのまま出す。"""
    mat = bpy.data.materials.new('Baked_' + obj.name)
    nodes = mat.node_tree.nodes
    bsdf = nodes['Principled BSDF']
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if blend:
        mat.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        mat.surface_render_method = 'BLENDED'
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def pack(img, fmt):
    """画像を .blend に詰める。JPEG で詰めると glb も JPEG で出て軽くなる（影の板は透けるので PNG）。"""
    ext = {'JPEG': '.jpg', 'PNG': '.png'}[fmt]
    path = os.path.join(bpy.app.tempdir, img.name + ext)
    img.filepath_raw = path
    img.file_format = fmt
    img.save()
    img.source = 'FILE'
    img.reload()
    img.pack()


def srgb_to_lin(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(a):
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)


def bake_lighting():
    setup_lights()
    lit = list(BAKE_SIZE)
    for name in lit:
        unwrap(bpy.data.objects[name])
    movers = [bpy.data.objects['Books'], bpy.data.objects['Plant']]

    images = {}
    for name in lit:
        obj = bpy.data.objects[name]
        # 動く物の影は床や壁に焼かない（ずらしたときに影だけ取り残される）
        for m in movers:
            m.hide_render = m.name != name
        img = new_image('Bake_' + name, BAKE_SIZE[name])
        bake_into(obj, img, 'DIFFUSE', pass_filter={'DIRECT', 'INDIRECT', 'COLOR'})
        images[name] = img
    for m in movers:
        m.hide_render = False

    # 明るさを揃える。壁のまん中あたりの明るさが、壁の色 × EXPOSURE_TARGET になるよう全体を掛ける
    wall = np.array(images['Wall'].pixels[:], dtype=np.float32).reshape(-1, 4)[:, :3]
    lum = srgb_to_lin(wall) @ np.array([0.2126, 0.7152, 0.0722])
    # UV の島の外は焼かれず黒のまま残るので、焼けた画素だけで測る
    wall_lum = np.median(lum[lum > 0.01])
    h = COLORS['Stage_Wall'].lstrip('#')
    albedo = srgb_to_lin(np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]))
    gain = EXPOSURE_TARGET * float(albedo @ np.array([0.2126, 0.7152, 0.0722])) / float(wall_lum)
    print('bake exposure gain', round(gain, 3))
    for name, img in images.items():
        px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
        px[:, :3] = np.clip(lin_to_srgb(np.clip(srgb_to_lin(px[:, :3]) * gain, 0, 1)), 0, 1)
        img.pixels.foreach_set(px.ravel())
        pack(img, 'JPEG')
        baked_material(bpy.data.objects[name], img)

    # 接地の影。影の板に AO（近くの物にどれだけ覆われているか）を焼き、暗い所ほど濃い黒にする
    for m in movers:
        plane = add_shadow_plane(m)
        plane.data.materials.append(bpy.data.materials.new('tmp_' + plane.name))
        img = new_image('Bake_' + plane.name, SHADOW_SIZE, alpha=True)
        # 板に写すのは持ち主の影だけ。壁や幅木まで写すと、板の端に黒い帯が出る
        others = [o for o in bpy.data.objects if o not in (m, plane) and o.type == 'MESH']
        for o in others:
            o.hide_render = True
        bake_into(plane, img, 'AO')
        for o in others:
            o.hide_render = False
        px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
        shade = np.clip((1 - px[:, 0]) * 1.4, 0, 0.85)
        px[:, :3] = 0
        px[:, 3] = shade
        img.pixels.foreach_set(px.ravel())
        pack(img, 'PNG')
        baked_material(plane, img, blend=True)

    # 焼いたあとの光は要らない（glb にも出さない）
    for name in ('Fill', 'Sun'):
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)


def build():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    build_room()
    build_window()
    build_books()
    build_plant()
    group_parts()
    bake_lighting()

    # スクリプト自身を .blend に入れておく
    txt = bpy.data.texts.get('stage_build') or bpy.data.texts.new('stage_build')
    txt.from_string(open(__file__, encoding='utf-8').read())


if __name__ == '__main__':
    build()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'stage.blend')
    if '--no-save' not in sys.argv:
        bpy.ops.wm.save_as_mainfile(filepath=out)
        print('saved', out)
