"""stage.blend（ダッシュボードの背景ステージ）を一から作り直す。

    "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b \
        --factory-startup -P src/avatar/models/stage/build.py

**このスクリプトが原典。** stage.blend の中を手でいじらず、ここを直して流し直す
（→ docs/BLENDER_MODELING_NOTES.md「成果物の残し方」）。
出来上がった stage.blend には、このファイル自身が `stage_build` テキストとして入る。

いまの背景（main-page.css の `.bg-stage` / `.deco-*`）を立体に起こしたもの:

- `Floor` / `Wall` / `Baseboard` … 床と奥の壁、壁の足元の幅木
- `Window_Frame` / `Window_Glass` / `Window_Sill` / `Window_Cloud` … 上が半円の窓
- `Book_1`〜`Book_3`（＋ページ） … 左の床に積んだ本
- `Pot` / `Soil` / `Leaf_*` … 右の床の植木鉢

座標はアプリのステージと同じ。**床が z=0、原点がひよこの定位置**で、
カメラは -Y 側（three.js の +Z）から見る。ひよこの背丈は約 2。
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

# --- 部屋 ----------------------------------------------------------------
# 枠いっぱいのステージは 1400x840px ≒ 12x7 単位（AvatarCanvas の PX_PER_UNIT=118）。
# 横長の画面でも端が切れないよう、床と壁はそれより広く取る
ROOM_W = 20.0
WALL_Y = 3.0          # 奥の壁の位置。ひよこが歩く奥行き（±1.2）より十分奥
FLOOR_FRONT = -5.0    # 床の手前の端。カメラより手前まで伸ばす
WALL_H = 10.0

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
    rounded_box('Window_Bar_H', (WIN_W, 0.06, bar), (0, WALL_Y - 0.03, WIN_BOTTOM + WIN_H * 0.45),
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


def build():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    build_room()
    build_window()
    build_books()
    build_plant()

    # スクリプト自身を .blend に入れておく
    txt = bpy.data.texts.get('stage_build') or bpy.data.texts.new('stage_build')
    txt.from_string(open(__file__, encoding='utf-8').read())


if __name__ == '__main__':
    build()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'stage.blend')
    if '--no-save' not in sys.argv:
        bpy.ops.wm.save_as_mainfile(filepath=out)
        print('saved', out)
