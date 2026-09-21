"""egg.blend を一から作り直す。

    "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b \
        --factory-startup -P src/avatar/models/egg_build.py

**このスクリプトが原典。** 形も動きも全部ここに書いてあるので、たまごを直すときは
egg.blend の中を手でいじらず、ここを直して流し直す（chick.blend の
`<part>_build` テキストと同じ約束。→ docs/BLENDER_MODELING_NOTES.md「成果物の残し方」）。
出来上がった egg.blend には、このファイル自身が `egg_build` テキストとして入る。

作るもの:

- `Shell_Bottom` / `Shell_Top` … でこぼこに割れた線で上下に分けた殻。
  **割れ線を後から切るのではなく、最初からその線を通る格子で張る**ので、
  2つの殻の合わせ目の頂点は完全に一致する。閉じている間は継ぎ目が見えない。
- `EggRig` … ボーン3本（`EggBase` / `EggLo` / `EggHi`）。メッシュはボーンに
  オブジェクト親付けするだけで、スキニングはしない（→ BLENDER_ANIMATION_NOTES.md）。
- アクション2本 … `EggIdle`（ゆっくり揺れる）と `EggCrack`（ひび→割れて開く）。
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Quaternion, Vector

# --- 寸法 ----------------------------------------------------------------
# アプリの Egg（球 r=0.6 を縦 1.3 倍）と同じ見え方に合わせてある。
# 底が z=0 に接するので、three.js 側では床にそのまま置ける。
HEIGHT = 1.56
WIDTH = 1.15
# たまごらしさは「上が細い」だけで出る。大きくすると洋梨になる
TAPER = 0.28
# 殻の厚み。割れ口の切り口がこの幅で見える
THICK = 0.032

# 格子の細かさ。割れ線のギザギザ（9山）を出すのに、1山あたり8列は要る
NCOL = 72
NROW = 48
# 割れ線を通す行。ここから上が Shell_Top
IROW = 28

# 割れ線の高さ（底 0・頂上 1）。ゆるい波（2山）とギザギザ（9山）の重ね合わせ。
# 片方だけだと「きれいな波」か「規則的なノコギリ」になって割れ目に見えない
CUT = 0.60
CUT_WAVE = 0.040
CUT_ZIG = 0.038

# --- 見た目 --------------------------------------------------------------
# 色はアプリ（look.ts / Chick.tsx）が入れ直す。ここの値は Blender で見るときの仮。
# **マテリアル名はアプリが色を差し込む手掛かり**なので、変えると黙って色が付かなくなる
SHELL_COLOR = (0.95, 0.93, 0.87, 1.0)
INNER_COLOR = (0.93, 0.80, 0.74, 1.0)

FPS = 24


def egg_radius(t, rmax):
    """底 t=0 ・頂上 t=1 の、回転体としての半径。"""
    u = 2.0 * t - 1.0
    return WIDTH / 2.0 * math.sqrt(max(0.0, 1.0 - u * u)) / (1.0 + TAPER * u) / rmax


def cut_at(theta):
    """角度 theta での割れ線の高さ（t）。"""
    # 三角波。sin を重ねるだけだと山が丸くなって「割れ」に見えない
    x = (theta / (2.0 * math.pi) * 9.0) % 1.0
    zig = 2.0 * abs(2.0 * x - 1.0) - 1.0
    return CUT + CUT_WAVE * math.sin(2.0 * theta + 0.7) + CUT_ZIG * zig


def build_shell(name, i0, i1, rmax):
    """格子の行 i0〜i1 だけを張ったメッシュを作る。

    各列 j は「割れ線をちょうど IROW 行目が通る」ように t を割り当て直す。
    こうすると Top と Bottom が同じ頂点列を共有するので、閉じている間は
    合わせ目に隙間も段差も出ない。
    """
    bm = bmesh.new()
    grid = []
    for i in range(i0, i1 + 1):
        row = []
        for j in range(NCOL):
            theta = 2.0 * math.pi * j / NCOL
            tc = cut_at(theta)
            if i <= IROW:
                t = tc * (i / IROW)
            else:
                t = tc + (1.0 - tc) * (i - IROW) / (NROW - IROW)
            r = egg_radius(t, rmax)
            row.append(bm.verts.new((r * math.cos(theta), r * math.sin(theta), t * HEIGHT)))
        grid.append(row)

    for a in range(len(grid) - 1):
        for j in range(NCOL):
            k = (j + 1) % NCOL
            bm.faces.new((grid[a][j], grid[a][k], grid[a + 1][k], grid[a + 1][j]))

    # 極（t=0 / t=1）は全列が同じ点。張ってから潰す
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = 0.65
    return mat


def finish(obj, shell, inner):
    """殻に厚みを付け、切り口だけ角を立てて滑らかにする。"""
    obj.data.materials.append(shell)
    obj.data.materials.append(inner)

    mod = obj.modifiers.new('solidify', 'SOLIDIFY')
    mod.thickness = THICK
    # 既定の offset=-1。元の面が外側に残り、内側へ厚みが付く
    mod.offset = -1.0
    mod.use_rim = True
    # 内側の面と切り口だけ 2枚目のマテリアル（Egg_Inner）に回す
    mod.material_offset = 1
    mod.material_offset_rim = 1

    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Blender 5.x に use_auto_smooth は無い。角度で分けるのはモディファイア
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))


# --- ここから組み立て ----------------------------------------------------

# --factory-startup の既定の Cube / Camera / Light は要らない
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

RMAX = max(
    math.sqrt(1.0 - (2.0 * t / 400.0 - 1.0) ** 2) / (1.0 + TAPER * (2.0 * t / 400.0 - 1.0))
    for t in range(1, 400)
)

shell_mat = material('Egg_Shell', SHELL_COLOR)
inner_mat = material('Egg_Inner', INNER_COLOR)

bottom = build_shell('Shell_Bottom', 0, IROW, RMAX)
top = build_shell('Shell_Top', IROW, NROW, RMAX)
finish(bottom, shell_mat, inner_mat)
finish(top, shell_mat, inner_mat)

# --- リグ ----------------------------------------------------------------
# **ボーン名はメッシュ名と必ず変える**（glTF では同じ名前空間に並ぶ）。
# 支点は「そこを中心に回して自然に見えるか」で決める。
#   EggBase … たまご全体。ゆらゆらするのはこれ
#   EggLo   … 下半分。底の中心が支点なので、ぐらついても床から浮かない
#   EggHi   … 上半分。割れ線の平均の高さ・中心軸上。ここを支点に持ち上げると
#             フタが開くように見える
Z_HI = CUT * HEIGHT

arm = bpy.data.armatures.new('EggRig')
rig = bpy.data.objects.new('EggRig', arm)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
BONES = [
    ('EggBase', (0.0, 0.0, 0.0), None),
    ('EggLo', (0.0, 0.0, 0.02), 'EggBase'),
    ('EggHi', (0.0, 0.0, Z_HI), 'EggBase'),
]
for name, head, parent in BONES:
    eb = arm.edit_bones.new(name)
    eb.head = Vector(head)
    eb.tail = Vector(head) + Vector((0.0, 0.0, 0.12))
    if parent:
        eb.parent = arm.edit_bones[parent]
        # **つなぐと pose.location が黙って無視される。** 動かす気のあるボーンは
        # つながない（→ BLENDER_ANIMATION_NOTES.md）
        eb.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

# 親付け。**親を入れただけではローカル変換が親基準に読み替えられて形が崩れる**ので、
# 控えておいた matrix_world を入れ直す
for obj, bone in ((bottom, 'EggLo'), (top, 'EggHi')):
    mw = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    obj.matrix_world = mw

bpy.context.view_layer.update()

# --- アクション ----------------------------------------------------------
# ポーズは「ワールドのどの軸まわりに何ラジアン」「ワールドでどこへ何」で書き、
# ボーン空間へ直すのはこの2つの関数に閉じ込める（符号を間違えないため）
CHANNELS = ('location', 'rotation_quaternion')


def bone_space(pb, loc, rot):
    R = pb.bone.matrix_local.to_3x3().normalized()
    q = Euler(rot, 'XYZ').to_quaternion()
    return R.transposed() @ Vector(loc), (R.transposed() @ q.to_matrix() @ R).to_quaternion()


def make_action(name, poses):
    """poses = [(frame, {bone: (world移動, world回転XYZ)}), ...]

    **どのボーンも、書かれていないフレームでは素の値でキーする。** あるアクション
    だけで使ったチャンネルを他で書かないと、Blender で切り替えたとき直前の値が
    残る（→ BLENDER_ANIMATION_NOTES.md）。
    """
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    # Blender 5.x はスロットが無いとキーが入らない
    rig.animation_data.action_slot = act.slots.new(id_type='OBJECT', name='EggRig')
    # **四元数は符号をそろえてからキーする。** q と -q は同じ姿勢だが、
    # 曲線は成分ごとに補間されるので、隣り合うキーで符号が反転していると
    # 途中のフレームで 0 を通り、回転が一瞬消える（半回転あたりで必ず起きる）。
    # ポーズを見ても、カーブを見ても気付けない
    prev = {}
    for frame, pose in poses:
        for bone, _, _ in BONES:
            pb = rig.pose.bones[bone]
            loc, rot = pose.get(bone, ((0, 0, 0), (0, 0, 0)))
            loc, q = bone_space(pb, loc, rot)
            if prev.get(bone) and prev[bone].dot(q) < 0:
                q = Quaternion((-q.w, -q.x, -q.y, -q.z))
            prev[bone] = q
            pb.location, pb.rotation_quaternion = loc, q
            for ch in CHANNELS:
                # **クリップは 0 秒から始める。** Blender の1コマ目を frame=1 の
                # まま書き出すと glTF のキーが 1/24 秒から始まり、ループのたびに
                # そのぶん動かない間ができる（ひよこのクリップは全部 0 始まり）
                pb.keyframe_insert(data_path=ch, frame=frame - 1)
    # Blender 5.x のアクションは層構造。`act.fcurves` は無く、
    # レイヤー → ストリップ → スロットごとの channelbag の下にカーブがある
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for kp in fc.keyframe_points:
                        kp.interpolation = 'BEZIER'
    return act


def rock(a):
    """たまご全体を左右に傾ける。底が丸いので、傾けるだけで転がって見える"""
    return {'EggBase': ((0, 0, 0), (0, a, 0))}


# 通常時。2.5秒でひと揺れ。**ここでは上下の殻を動かさない。**
# 別々に動かすと合わせ目が開いて、閉じているはずのたまごにひびが見える
IDLE = [
    (1, rock(0.0)),
    (16, rock(0.09)),
    (31, rock(0.0)),
    (46, rock(-0.09)),
    (61, rock(0.0)),
]
make_action('EggIdle', IDLE)


def jolt(a, lift, tilt):
    """中から突かれて、たまごが跳ねる。上の殻だけわずかに浮くのが「ひび」"""
    return {
        'EggBase': ((0, 0, 0), (0, a, 0)),
        'EggHi': ((0, 0, lift), (0, tilt, 0)),
    }


def fly(x, z, tilt, base=0.0):
    """上の殻が飛んで、下の殻が残る"""
    return {
        'EggBase': ((0, 0, 0), (0, base, 0)),
        'EggHi': ((x, 0, z), (0, tilt, 0)),
    }


# 割れる。3秒・1回きり（アプリ側で LoopOnce）。
# ひび（小さな突き上げ3回）→ 大きくぐらつく → 上半分が飛んで、横に転がって止まる。
# **最後のフレームで止まった絵になる**ように、終わりは動かさない
CRACK = [
    (1, jolt(0.0, 0.0, 0.0)),
    (8, jolt(0.0, 0.0, 0.0)),
    # 1回目。軽く小突かれる
    (11, jolt(0.045, 0.012, 0.030)),
    (16, jolt(0.0, 0.0, 0.0)),
    # 2回目。逆へ
    (22, jolt(-0.065, 0.020, -0.045)),
    (27, jolt(0.0, 0.002, 0.0)),
    # 3回目。ここで一番大きく持ち上がる
    (34, jolt(0.085, 0.034, 0.075)),
    (39, jolt(-0.02, 0.008, 0.0)),
    # ため。小刻みに震える
    (43, jolt(0.05, 0.020, 0.03)),
    (46, jolt(-0.05, 0.020, -0.03)),
    (49, jolt(0.04, 0.026, 0.02)),
    # 破裂。上半分が斜め上へ飛ぶ。**飛ばしすぎない。** カードの枠は
    # 高さ 2.6・幅 2.6 ほどしか見えていないので、外へ出ると消えたように見える
    (54, fly(0.14, 0.34, 0.9, base=-0.10)),
    (59, fly(0.34, 0.46, 1.9, base=0.06)),
    # 落ちて、下の殻の横に転がる。
    # **床（z=0）に合わせる量は目分量では決まらない。** 逆さになった殻の
    # 一番低い点を測って出した値（ZDROP の注記）
    (63, fly(0.48, -Z_HI + 0.592, 2.90, base=-0.03)),
    (67, fly(0.53, -Z_HI + 0.664, 3.05, base=0.02)),
    (71, fly(0.55, -Z_HI + 0.624, 3.15, base=0.0)),
    (73, fly(0.55, -Z_HI + 0.624, 3.15, base=0.0)),
]
make_action('EggCrack', CRACK)

# 既定で割り当てておくのは通常時。書き出しは ACTIONS 指定で両方出る
rig.animation_data.action = bpy.data.actions['EggIdle']
rig.animation_data.action_slot = bpy.data.actions['EggIdle'].slots[0]

scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start = 0
scene.frame_end = 60
scene.frame_set(0)

# このファイル自身を .blend の中にも入れておく（chick.blend の `<part>_build` と同じ）
src = os.path.abspath(sys.argv[sys.argv.index('-P') + 1] if '-P' in sys.argv else __file__)
text = bpy.data.texts.new('egg_build')
with open(src, encoding='utf-8') as f:
    text.write(f.read())

out = os.path.join(os.path.dirname(src), 'egg.blend')
bpy.ops.wm.save_as_mainfile(filepath=out)
print('saved', out, os.path.getsize(out))
